import { cleanLegacyDisplay } from '../../../parser/legacy-display.ts';
import { Encryption } from '../../../security/encryption.ts';
import type { SmtpCredentials } from '../../../services/smtp-settings.ts';
import { Router } from 'express';
import { imagePreviewHtml, parseMime } from '../../../parser/mime.ts';
import { getPool } from '../../../storage/pg-pool.ts';
import { EmailSender } from '../../../services/email-sender.ts';
import { EmailLogRepo, FeedbackRepo } from '../../../storage/sqlite.adapter.ts';
import { logger } from '../../../utils/logger.ts';

const router = Router();
const sender = new EmailSender();

router.get('/emails/:id', async (req, res) => {
  try {
    const userId = (req as any).user?.sub;
    const { rows } = await getPool().query(
      `SELECT el.id, el.account_id, el.thread_id, el.from_address, el.sender_name, el.subject,
              el.body, el.body_html, el.summary, el.priority, el.intent, el.in_reply_to, el."references",
              el.received_at, el.agent_response, el.user_action, el.processed_at AS created_at
       FROM email_log el
       JOIN email_accounts ea ON ea.id = el.account_id
       WHERE el.id = $1 AND ea.user_id = $2`,
      [req.params.id, userId]
    );
    const row = rows[0];
    if (!row) { res.status(404).json({ error: 'Email not found' }); return; }

    let thread = null;
    if (row.thread_id) {
      const { rows: tr } = await getPool().query(
        'SELECT * FROM threads WHERE id = $1', [row.thread_id]
      );
      thread = tr[0] ?? null;
    }
    // Older rows can contain a MIME body with its outer headers stripped.
    const boundary = typeof row.body === 'string'
      ? /^--([!-~]{1,70})\r?\n(?=Content-[\w-]+:)/i.exec(row.body)?.[1]
      : undefined;
    if (boundary && row.body.includes(`--${boundary}--`)) {
      try {
        const escaped = boundary.replace(/["\\]/g, '\\$&');
        const decoded = await parseMime(
          `MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${escaped}"\r\n\r\n${row.body}`,
        );
        row.body_html ??= imagePreviewHtml(decoded);
        if (decoded.text || row.body_html) row.body = decoded.text ?? '';
      } catch {
        // Keep the stored body when there is not enough MIME data to recover it.
      }
    }
    if (!row.body_html && typeof row.body === 'string' && row.body.length < 1024 * 1024) {
      const looksLikeHtml = (text: string) => /^\s*(?:<!doctype\s+html|<(?:html|head|body|div|table|p|img|center|meta|style)\b)/i.test(text);
      const compact = row.body.replace(/\s+/g, '');
      const encodedHtml = compact.length >= 16 && compact.length % 4 === 0 &&
        /^[a-z0-9+/]+={0,2}$/i.test(compact) &&
        looksLikeHtml(Buffer.from(compact, 'base64').toString('utf8'));
      if (encodedHtml || looksLikeHtml(row.body)) {
        try {
          const encoding = encodedHtml ? 'base64' : /(?:src|href)=3D|=\r?\n/i.test(row.body) ? 'quoted-printable' : '8bit';
          const decoded = await parseMime(
            `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${row.body}`,
          );
          row.body_html = imagePreviewHtml(decoded);
          row.body = decoded.text ?? '';
        } catch {
          // Preserve the original text when decoding fails.
        }
      }
    }
    res.json({ ...await cleanLegacyDisplay(row), thread });
  } catch (err) {
    logger.error('GET /emails/:id error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/emails/:id/reply', async (req, res) => {
  const { body, from } = req.body as { body?: string; from?: string };
  if (typeof body !== 'string' || !body.trim()) { res.status(400).json({ error: 'body is required' }); return; }

  try {
    const userId = (req as any).user?.sub;
    const { rows } = await getPool().query(
      `SELECT el.* FROM email_log el
       JOIN email_accounts ea ON ea.id = el.account_id
       WHERE el.id = $1 AND ea.user_id = $2`,
      [req.params.id, userId]
    );
    const row = rows[0];
    if (!row) { res.status(404).json({ error: 'Email not found' }); return; }

    const { rows: acctRows } = await getPool().query(
      'SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2 AND enabled = TRUE', [row.account_id, userId]
    );
    const account = acctRows[0];
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    let fromAddress = account.email_address;
    if (from !== undefined) {
      const requested = typeof from === 'string' ? from.trim().toLowerCase() : '';
      const encryption = new Encryption(process.env.ENCRYPTION_KEY!);
      const credentials: SmtpCredentials = account.account_type === 'imap' && account.credentials_enc
        ? JSON.parse(encryption.decrypt(account.credentials_enc)) : {};
      const allowed = [account.email_address, ...(credentials.smtp_aliases ?? [])];
      const match = allowed.find((address) => address.toLowerCase() === requested);
      if (!match) { res.status(400).json({ error: '所选发件地址未在此邮箱的发件别名中配置' }); return; }
      fromAddress = match;
    }
    const subject     = row.subject?.startsWith('Re:') ? row.subject : `Re: ${row.subject ?? ''}`;

    const result = await sender.send(row.account_id, {
      from: fromAddress, to: row.from_address, subject, body,
      inReplyTo: row.id, references: row.id,
    });

    if (!result.success) { res.status(502).json({ error: result.error }); return; }

    await FeedbackRepo.insert({
      emailLogId: req.params.id, accountId: row.account_id,
      prediction: {} as any, userAction: 'sent_as_is', wasCorrect: true, createdAt: new Date(),
    });
    await EmailLogRepo.recordAction(req.params.id, 'replied');

    logger.info('Reply sent', { emailId: req.params.id });
    res.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    logger.error('POST /emails/:id/reply error', { msg: err?.message, stack: err?.stack });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/threads/:id/summary', async (req, res) => {
  try {
    const userId = (req as any).user?.sub;
    const { rows: tr } = await getPool().query(
      `SELECT t.* FROM threads t
       JOIN email_accounts ea ON ea.id = t.account_id
       WHERE t.id = $1 AND ea.user_id = $2`,
      [req.params.id, userId]
    );
    const thread = tr[0];
    if (!thread) { res.status(404).json({ error: 'Thread not found' }); return; }

    const { rows: messages } = await getPool().query(
      `SELECT id, from_address, subject, received_at, agent_response
       FROM email_log WHERE thread_id = $1 ORDER BY received_at ASC`,
      [req.params.id]
    );
    res.json({ ...thread, messages });
  } catch (err) {
    logger.error('GET /threads/:id/summary error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
