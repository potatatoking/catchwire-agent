/**
 * IMAP Poller — for services that don't support webhooks
 * Phase 2
 */

import Imap from 'imap';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    let processing = false;
    imap.once('close', () => {
      if (!processing) this.polling = false;
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, async (error, box) => {
        if (error) { imap.end(); return; }
        processing = true;
        try {
          await this.processInbox(imap, config, box);
        } catch (error) {
          logger.warn('IMAP poll failed', { accountId: this.accountId, message: (error as Error).message });
        } finally {
          imap.end();
          this.polling = false;
        }
      });
    });

    imap.once('error', (err: Error) => {
      logger.error('IMAP connection error', { accountId: this.accountId, message: err.message });
    });

    imap.connect();
  }

  private async processInbox(imap: Imap, config: IMAPConfig, box: Imap.Box): Promise<void> {
    const key = createHash('sha256').update(JSON.stringify([this.accountId, config.host, config.port, config.user])).digest('hex');
    const dataDir = join(process.cwd(), 'data');
    const path = join(dataDir, `imap-cursor-${key}.json`);
    const save = (uid: number) => {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify({ validity: box.uidvalidity, uid }), { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
    };

    let cursor: { validity: number; uid: number } | undefined;
    try {
      cursor = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!Number.isInteger(box.uidnext) || box.uidnext < 1) throw new Error('IMAP server did not provide UIDNEXT');
    if (!cursor || cursor.validity !== box.uidvalidity) {
      // Establish a baseline for this mailbox instead of analyzing its existing unread mail.
      save(box.uidnext - 1);
      return;
    }
    if (box.uidnext <= cursor.uid + 1) return;

    const first = cursor.uid + 1;
    const last = box.uidnext - 1;
    const uids = await new Promise<number[]>((resolve, reject) => {
      imap.search([['UID', `${first}:${last}`]], (error, matches) => {
        if (error) reject(error);
        else resolve(matches.filter(uid => uid >= first && uid <= last).sort((a, b) => a - b));
      });
    });

    for (const uid of uids) {
      const rawBytes = await this.fetchMessage(imap, uid);
      if (rawBytes === undefined) continue; // The message was removed after the search.
      await this.onEmail({
        id: randomUUID(), accountId: this.accountId, receivedAt: new Date(), source: 'imap',
        raw: rawBytes.toString('utf8'), rawBytes, headers: {},
      });
      save(uid);
    }
    save(last);
  }

  private fetchMessage(imap: Imap, uid: number): Promise<Buffer | undefined> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let found = false;
      const fetch = imap.fetch(uid, { bodies: '' });
      fetch.on('message', (message) => {
        found = true;
        message.on('body', (stream) => {
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.once('error', reject);
        });
      });
      fetch.once('error', reject);
      fetch.once('end', () => resolve(found ? Buffer.concat(chunks) : undefined));
    });
  }
}
