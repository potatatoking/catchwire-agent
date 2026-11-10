import { simpleParser } from 'mailparser';

export async function cleanLegacyDisplay(row: { subject?: string | null; sender_name?: string | null }) {
  const subject = row.subject?.trim() ?? '';
  // Older parsing could treat a DKIM signed-header list as the subject.
  const signedHeaders = /^(?:[a-z][a-z0-9-]*\s*:\s*){3,}[a-z][a-z0-9-]*(?:[;\s]|$)/i;
  const signatureTail = /^(?:[a-z][a-z0-9-]*\s*:\s*)+[a-z][a-z0-9-]*\s*;\s*(?:bh|b)\s*=/i;
  if (signedHeaders.test(subject) || signatureTail.test(subject)) {
    row.subject = '旧邮件主题无法恢复';
  }
  for (const field of ['subject', 'sender_name'] as const) {
    const value = row[field];
    if (!value || !/=\?[^?]+\?[BQ]\?/i.test(value)) continue;
    try {
      const decoded = await simpleParser(`Subject: ${value.replace(/[\r\n]+/g, ' ')}\r\n\r\n`);
      row[field] = decoded.subject || value;
    } catch {
      // Some old records no longer contain the original header bytes.
    }
  }
  if (row.sender_name && /^[\s\ufffd]+$/.test(row.sender_name)) row.sender_name = null;
  return row;
}
