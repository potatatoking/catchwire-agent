import { createHash } from 'node:crypto';
import Imap from 'imap';

const endpoint = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scope = 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All';
export const outlookImapHost = 'outlook.office365.com';

export interface OutlookCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function outlookConfigured(): boolean {
  return Boolean(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET && process.env.OUTLOOK_REDIRECT_URI);
}

export function outlookAuthorizationUrl(state: string, verifier: string, email: string): string {
  const query = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI!,
    scope,
    state,
    login_hint: email,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return `${endpoint}/authorize?${query}`;
}

async function requestTokens(params: Record<string, string>, previousRefresh = ''): Promise<OutlookCredentials> {
  const response = await fetch(`${endpoint}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      scope,
      ...params,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Microsoft OAuth token request failed (HTTP ${response.status})`);
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  const refreshToken = data.refresh_token || previousRefresh;
  if (!data.access_token || !refreshToken || !data.expires_in) throw new Error('Incomplete Microsoft OAuth token response');
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
}

export function exchangeOutlookCode(code: string, verifier: string) {
  return requestTokens({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: process.env.OUTLOOK_REDIRECT_URI! });
}

export function refreshOutlookToken(refreshToken: string) {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken }, refreshToken);
}

export function outlookXoauth2(email: string, accessToken: string): string {
  return Buffer.from(`user=${email}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64');
}

export async function verifyOutlookInbox(email: string, accessToken: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const imap = new Imap({
      host: outlookImapHost, port: 993, user: email, tls: true,
      xoauth2: outlookXoauth2(email, accessToken), connTimeout: 10_000, authTimeout: 10_000, socketTimeout: 12_000,
    });
    imap.once('error', reject);
    imap.once('ready', () => imap.openBox('INBOX', true, (error) => {
      imap.end();
      if (error) reject(error); else resolve();
    }));
    imap.once('close', () => reject(new Error('Outlook IMAP connection closed')));
    imap.connect();
  });
}
