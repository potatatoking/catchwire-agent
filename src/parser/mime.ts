import { simpleParser } from 'mailparser';

export async function parseMime(raw: Buffer | string) {
  const decoded = await simpleParser(raw, { skipImageLinks: true });
  if (!decoded.text?.trim() && decoded.html) {
    // Mailparser may leave HTML-only multipart messages without a text body.
    const html = Buffer.from(decoded.html).toString('base64');
    const plain = await simpleParser(
      `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${html}`,
      { skipImageLinks: true },
    );
    decoded.text = plain.text;
  }
  return decoded;
}

export function imagePreviewHtml(decoded: Awaited<ReturnType<typeof parseMime>>): string | undefined {
  let html = decoded.html || '';
  if (html.length > 1024 * 1024) return undefined;
  let remaining = 4 * 1024 * 1024;
  const inline = new Map<string, string>();
  const images: string[] = [];
  for (const attachment of decoded.attachments) {
    const mime = attachment.contentType.toLowerCase();
    if (!/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(mime) ||
        attachment.content.length === 0 || attachment.content.length > remaining) continue;
    remaining -= attachment.content.length;
    const src = `data:${mime};base64,${attachment.content.toString('base64')}`;
    if (attachment.cid) inline.set(attachment.cid, src);
    images.push(src);
  }
  const used = new Set<string>();
  html = html.replace(/\bcid:([^'"\s<>]{1,256})/gi, (original, cid) => {
    const src = inline.get(cid);
    if (!src || used.has(src)) return original;
    used.add(src);
    return src;
  });
  if (html.length > 7 * 1024 * 1024) return undefined;
  if (!images.length && !/<(?:img|a)\b/i.test(html)) return undefined;
  return html + images.filter(src => !used.has(src)).map(src => `<img src="${src}">`).join('') || undefined;
}
