/**
 * IMAP Poller — for services that don't support webhooks
 * Phase 2
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.ts';
import type { RawEmail } from '../types/index.ts';

export interface IMAPConfig {
  host:     string;
  port:     number;
  user:     string;
  password?: string;
  xoauth2?: string;
  tls:      boolean;
}

type RawEmailHandler = (email: RawEmail) => Promise<void>;

export class IMAPPoller {
  private intervalId?: ReturnType<typeof setInterval>;
  private lastUID = 0;
  private polling = false;

  constructor(
    private accountId: string,
    private getConfig: () => Promise<IMAPConfig | null>,
    private onEmail: RawEmailHandler,
    private intervalMin = 5,
  ) {}

  start(): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.intervalMin * 60 * 1000);
    logger.info('IMAP poller started', { accountId: this.accountId, intervalMin: this.intervalMin });
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    let config: IMAPConfig | null;
    try {
      config = await this.getConfig();
    } catch (error) {
      logger.warn('IMAP credentials could not be loaded', { accountId: this.accountId, message: error instanceof Error ? error.message : String(error) });
      this.polling = false;
      return;
    }
    if (!config) { this.polling = false; return; }
    const imap = new Imap({
      ...config,
      autotls: 'required',
      connTimeout: 10_000, authTimeout: 10_000, socketTimeout: 30_000,
      tlsOptions: { rejectUnauthorized: true },
    });
    imap.once('close', () => { this.polling = false; });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { imap.end(); return; }

        const criteria = this.lastUID > 0
          ? [['UID', `${this.lastUID + 1}:*`]]
          : ['UNSEEN'];

        imap.search(criteria as any, (err2, uids) => {
          if (err2 || !uids.length) { imap.end(); return; }

          const fetch = imap.fetch(uids, { bodies: '' });

          fetch.on('message', (msg) => {
            const chunks: Buffer[] = [];
            msg.on('body', (stream) => stream.on('data', (c: Buffer) => chunks.push(c)));
            msg.once('end', async () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              try {
                const parsed = await simpleParser(raw);
                const headers: Record<string, string> = {};
                parsed.headers.forEach((v, k) => { headers[k] = String(v); });

                await this.onEmail({
                  id:         randomUUID(),
                  accountId:  this.accountId,
                  receivedAt: new Date(),
                  source:     'imap',
                  raw,
                  headers,
                });
              } catch (e) {
                logger.error('IMAP message parse error', e as Error);
              }
            });
          });

          fetch.once('error', (error: Error) => {
            logger.warn('IMAP fetch failed', { accountId: this.accountId, message: error.message });
            imap.end();
          });
          fetch.once('end', () => {
            this.lastUID = Math.max(...uids);
            imap.end();
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      this.polling = false;
      logger.error('IMAP connection error', { accountId: this.accountId, message: err.message });
    });

    imap.connect();
  }
}
