import { IMAPPoller, type IMAPConfig } from './imap-poller.ts';
import { outlookImapHost, outlookXoauth2, refreshOutlookToken, type OutlookCredentials } from './outlook-oauth.ts';
import { randomUUID }  from 'crypto';
import { EventEmitter } from 'events';
import { logger }       from '../utils/logger.ts';
import { getPool }      from '../storage/pg-pool.ts';
import { ForwardingParser } from '../parser/forwarding-parser.ts';
import { Encryption }   from '../security/encryption.ts';
import type { RawEmail, ParsedEmail } from '../types/index.ts';

type ParsedEmailHandler = (email: ParsedEmail) => Promise<void>;

export class MultiAccountManager extends EventEmitter {
  private readonly imapPollers = new Map<string, IMAPPoller>();
  private parser: ForwardingParser;
  private handlers: ParsedEmailHandler[] = [];

  constructor(private encryption: Encryption) {
    super();
    this.parser = new ForwardingParser();
  }

  async initialize(): Promise<void> {
    const { rows } = await getPool().query(
      `SELECT * FROM email_accounts WHERE enabled = TRUE`
    );
    logger.info(`Multi-account manager: ${rows.length} account(s) active`);

    for (const acc of rows) {
      if ((acc.account_type === 'imap' || acc.account_type === 'outlook') && acc.credentials_enc) {
        this.startIMAPPoller(acc.id, acc.polling_interval_min);
      } else if (acc.account_type === 'mailtm' && acc.credentials_enc) {
        await this.startMailTMPoller(acc);
      } else if (acc.account_type === 'gmail') {
        logger.info('Gmail uses webhooks — no polling needed', { accountId: acc.id });
      }
    }
  }

  startIMAPPoller(accountId: string, intervalMin = 5): void {
    if (this.imapPollers.has(accountId)) return;
    const poller = new IMAPPoller(accountId, () => this.loadImapConfig(accountId), (raw) => this.ingest(raw), intervalMin);
    this.imapPollers.set(accountId, poller);
    poller.start();
  }

  private async loadImapConfig(accountId: string): Promise<IMAPConfig | null> {
    const pool = getPool();
    const { rows: [account] } = await pool.query(
      'SELECT account_type, email_address, credentials_enc FROM email_accounts WHERE id = $1 AND enabled = TRUE',
      [accountId],
    );
    if (!account?.credentials_enc) return null;
    const creds = JSON.parse(this.encryption.decrypt(account.credentials_enc));
    if (account.account_type === 'outlook') {
      let tokens: OutlookCredentials = creds;
      if (tokens.expiresAt < Date.now() + 60_000) {
        tokens = await refreshOutlookToken(tokens.refreshToken);
        const { rowCount } = await pool.query(
          "UPDATE email_accounts SET credentials_enc = $1 WHERE id = $2 AND credentials_enc = $3 AND enabled = TRUE",
          [this.encryption.encrypt(JSON.stringify(tokens)), accountId, account.credentials_enc],
        );
        if (!rowCount) return null;
      }
      return { host: outlookImapHost, port: 993, user: account.email_address, tls: true,
        xoauth2: outlookXoauth2(account.email_address, tokens.accessToken) };
    }
    const host = creds.host ?? creds.imap_host;
    const password = creds.pass ?? creds.imap_pass;
    if (!host || !password) return null;
    const port = creds.port ?? creds.imap_port ?? 993;
    return { host, port, user: creds.user ?? creds.imap_user ?? account.email_address, password, tls: port !== 143 };
  }

  private async startMailTMPoller(account: any): Promise<void> {
    try {
      const creds = JSON.parse(this.encryption.decrypt(account.credentials_enc));
      if (!creds?.address || !creds?.password) {
        logger.warn('MailTM account missing credentials', { accountId: account.id }); return;
      }
      const { MailTMPoller } = await import('./mailtm-poller.ts');
      const poller = new MailTMPoller(
        account.id,
        { address: creds.address, password: creds.password },
        (raw) => this.ingest(raw),
        account.polling_interval_min ?? 1,
      );
      poller.start();
      logger.info('MailTM poller started', { accountId: account.id });
    } catch (err) {
      logger.error('Failed to start MailTM poller', { accountId: account.id, err });
    }
  }

  async ingest(raw: RawEmail): Promise<void> {
    try {
      const parsed = await this.parser.parse(raw);
      logger.info('Email ingested', { accountId: parsed.accountId, sender: parsed.originalSender, subject: parsed.subject });
      for (const handler of this.handlers) await handler(parsed);
    } catch (err) {
      logger.error('Failed to ingest email', err as Error);
    }
  }

  onEmailReceived(handler: ParsedEmailHandler): void {
    this.handlers.push(handler);
  }

  async addAccount(userId: string, data: {
    emailAddress: string; displayName?: string;
    accountType: 'gmail' | 'outlook' | 'imap' | 'forward';
    credentials?: object; priority?: number;
  }): Promise<string> {
    const id   = randomUUID();
    const pool = getPool();
    await pool.query(
      `INSERT INTO email_accounts (id, user_id, email_address, display_name, account_type, enabled, priority)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6)`,
      [id, userId, data.emailAddress, data.displayName ?? null, data.accountType, data.priority ?? 5]
    );
    await pool.query(`INSERT INTO personas (account_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);

    if (data.credentials) {
      const enc = this.encryption.encrypt(JSON.stringify(data.credentials));
      await pool.query('UPDATE email_accounts SET credentials_enc = $1 WHERE id = $2', [enc, id]);
    }
    logger.info('Account added', { accountId: id, email: data.emailAddress });
    return id;
  }
}
