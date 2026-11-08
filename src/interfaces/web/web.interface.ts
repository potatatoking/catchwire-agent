import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import cors from 'cors';
import { exchangeOutlookCode, outlookAuthorizationUrl, outlookConfigured, verifyOutlookInbox } from '../../ingestion/outlook-oauth.ts';
import { Encryption } from '../../security/encryption.ts';
import { getPool } from '../../storage/pg-pool.ts';
import { logger } from '../../utils/logger.ts';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.ts';
import { requireAuth, verifyToken } from './middleware/auth.middleware.ts';
import { demoGuard } from './middleware/demo.middleware.ts';
import type { IUserInterface, InterfaceConfig, InterfaceCapabilities, Message, MessageResult, UserAction } from '../shared/interface-manager.ts';

export class WebInterface implements IUserInterface {
  readonly name:    string = 'web';
  readonly version: string = '1.0.0';

  private app    = express();
  private server = createServer(this.app);
  private wss    = new WebSocketServer({ noServer: true });
  private sockets = new Map<string, WebSocket>();
  private actionCallbacks: Array<(action: UserAction) => void> = [];
  // In-memory CSRF state store for Gmail OAuth: state → { accountId, expiresAt }
  private oauthStates = new Map<string, { accountId: string; expiresAt: number }>();

  private outlookStates = new Map<string, { accountId: string; userId: string; verifier: string; expiresAt: number }>();

  constructor(private port: number = 3000, private onImapConnected?: (id: string, interval: number) => void) {}

  async initialize(config: InterfaceConfig): Promise<void> {
    if (config.credentials?.port) this.port = Number(config.credentials.port);
    await this.start();
  }

  async shutdown(): Promise<void> {
    this.server.close();
    this.wss.close();
  }

  async healthCheck(): Promise<boolean> {
    return this.server.listening;
  }

  getCapabilities(): InterfaceCapabilities {
    return {
      supportsRichText:       true,
      supportsButtons:        true,
      supportsInlineEdit:     true,
      supportsFileAttachment: true,
      supportsVoiceMessage:   false,
      maxMessageLength:       65536,
      supportsThreads:        true,
    };
  }

  onUserAction(callback: (action: UserAction) => void): void {
    this.actionCallbacks.push(callback);
  }

  async start(): Promise<void> {
    // Trust the first proxy hop so req.ip reflects the real client IP (needed
    // for rate limiting when running behind Nginx or any reverse proxy).
    this.app.set('trust proxy', 1);
    this.setupMiddleware();
    await this.setupRoutes();
    this.setupWebSocket();

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`Web interface started on port ${this.port}`);
        resolve();
      });
    });
  }

  async sendMessage(userId: string, message: Message): Promise<MessageResult> {
    const ws = this.sockets.get(userId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'User not connected' };
    }
    ws.send(JSON.stringify({ type: 'message', ...message }));
    return { success: true };
  }

  private setupMiddleware(): void {
    // CORS — restrict to same origin in production, or explicit whitelist
    const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowedOrigins.includes('*')) {
      logger.warn('CORS: wildcard origin (*) with credentials=true is insecure — set CORS_ORIGINS to an explicit domain list');
    }
    this.app.use(cors({
      origin: allowedOrigins.length ? allowedOrigins : false,
      credentials: true,
    }));

    this.app.use(express.json({ limit: '512kb' }));
    this.app.use(express.static('public'));
    if (existsSync(resolve('dist/frontend'))) {
      this.app.use(express.static(resolve('dist/frontend')));
    }

    // Security headers
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' wss: wss://*; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
      );
      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
      }
      next();
    });

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.debug('HTTP', { method: req.method, path: req.path });
      next();
    });
  }

  private async setupRoutes(): Promise<void> {
    this.app.get('/health', (_req, res) => res.json({ ok: true }));

    this.app.locals.onImapConnected = this.onImapConnected;
    const { default: apiRouter } = await import('./routes/index.ts');
    this.app.use('/api', rateLimitMiddleware('api_calls'), demoGuard, apiRouter);

    this.app.post('/auth/gmail/start', requireAuth, rateLimitMiddleware('auth_attempts'), demoGuard, async (req, res) => {
      const { accountId } = req.body ?? {};
      if (typeof accountId !== 'string' || !accountId) {
        res.status(400).json({ error: '缺少邮箱账号 ID' });
        return;
      }
      try {
        const { rowCount } = await getPool().query(
          "SELECT 1 FROM email_accounts WHERE id = $1 AND user_id = $2 AND account_type = 'gmail' AND enabled = TRUE",
          [accountId, (req as Request & { user: { sub: string } }).user.sub],
        );
        if (!rowCount) {
          res.status(404).json({ error: '找不到可授权的 Gmail 账号' });
          return;
        }
        if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REDIRECT_URI) {
          res.status(503).json({ error: '服务器尚未配置 Google OAuth 凭据' });
          return;
        }
        const { GmailWebhook } = await import('../../ingestion/gmail-webhook.ts');
        const gmail = new GmailWebhook(() => Promise.resolve());
        const now = Date.now();
        for (const [key, entry] of this.oauthStates) {
          if (entry.expiresAt <= now) this.oauthStates.delete(key);
        }
        const state = randomBytes(32).toString('hex');
        const url = gmail.getAuthUrl(state);
        this.oauthStates.set(state, { accountId, expiresAt: now + 10 * 60 * 1000 });
        res.json({ url });
      } catch (err) {
        logger.error('Gmail OAuth start failed', { err });
        res.status(500).json({ error: '无法启动 Gmail 授权' });
      }
    });

    // Gmail OAuth callback — verify CSRF state and persist tokens
    this.app.get('/auth/gmail/callback', async (req, res) => {
      const code  = req.query.code  as string;
      const state = req.query.state as string;
      if (!code || !state) { res.status(400).send('Missing code or state'); return; }

      const entry = this.oauthStates.get(state);
      if (!entry || entry.expiresAt < Date.now()) {
        this.oauthStates.delete(state);
        res.status(403).send('Invalid or expired OAuth state — please try again');
        return;
      }
      this.oauthStates.delete(state);
      const { accountId } = entry;

      try {
        const { GmailWebhook } = await import('../../ingestion/gmail-webhook.ts');
        const gmail = new GmailWebhook(() => Promise.resolve());
        const tokens = await gmail.handleCallback(code);

        // Persist tokens encrypted against the account
        const { CredentialManager } = await import('../../security/credential-manager.ts');
        const enc  = new Encryption(process.env.ENCRYPTION_KEY!);
        const cred = new CredentialManager(enc);
        await cred.storeEmailCredentials(accountId, tokens);

        logger.info('Gmail OAuth tokens stored', { accountId });
        res.send('<script>window.close()</script><p>Gmail connected! You can close this tab.</p>');
      } catch (err) {
        logger.error('Gmail OAuth callback failed', { err });
        res.status(500).send('Authentication failed');
      }
    });

    this.app.post('/auth/outlook/start', requireAuth, rateLimitMiddleware('auth_attempts'), demoGuard, async (req, res) => {
      const { accountId } = req.body ?? {};
      if (typeof accountId !== 'string' || !accountId) {
        res.status(400).json({ error: '缺少邮箱账号 ID' }); return;
      }
      if (!outlookConfigured()) {
        res.status(503).json({ error: '服务器尚未配置 Microsoft OAuth 凭据' }); return;
      }
      try {
        const userId = (req as Request & { user: { sub: string } }).user.sub;
        const { rows: [account] } = await getPool().query(
          "SELECT email_address FROM email_accounts WHERE id = $1 AND user_id = $2 AND account_type = 'outlook' AND enabled = TRUE",
          [accountId, userId],
        );
        if (!account) { res.status(404).json({ error: '找不到可授权的 Outlook 账号' }); return; }
        const now = Date.now();
        for (const [key, entry] of this.outlookStates) {
          if (entry.expiresAt <= now) this.outlookStates.delete(key);
        }
        const state = randomBytes(32).toString('base64url');
        const verifier = randomBytes(32).toString('base64url');
        this.outlookStates.set(state, { accountId, userId, verifier, expiresAt: now + 10 * 60_000 });
        res.json({ url: outlookAuthorizationUrl(state, verifier, account.email_address) });
      } catch (error) {
        logger.error('Outlook OAuth start failed', { message: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: '无法启动 Outlook 授权' });
      }
    });

    this.app.get('/auth/outlook/callback', async (req, res) => {
      const { code, state } = req.query;
      const entry = typeof state === 'string' ? this.outlookStates.get(state) : undefined;
      if (typeof state === 'string') this.outlookStates.delete(state);
      if (!entry || entry.expiresAt <= Date.now()) {
        res.status(403).send('授权已过期，请回到设置重试。'); return;
      }
      if (typeof code !== 'string' || !code) {
        res.status(400).send('Microsoft 授权未完成。'); return;
      }
      try {
        const pool = getPool();
        const { rows: [account] } = await pool.query(
          "SELECT email_address, polling_interval_min FROM email_accounts WHERE id = $1 AND user_id = $2 AND account_type = 'outlook' AND enabled = TRUE",
          [entry.accountId, entry.userId],
        );
        if (!account) { res.status(404).send('Outlook 账号不存在。'); return; }
        const tokens = await exchangeOutlookCode(code, entry.verifier);
        await verifyOutlookInbox(account.email_address, tokens.accessToken);
        const enc = new Encryption(process.env.ENCRYPTION_KEY!);
        const { rowCount } = await pool.query(
          "UPDATE email_accounts SET credentials_enc = $1 WHERE id = $2 AND user_id = $3 AND account_type = 'outlook' AND enabled = TRUE",
          [enc.encrypt(JSON.stringify(tokens)), entry.accountId, entry.userId],
        );
        if (!rowCount) { res.status(404).send('Outlook 账号不存在。'); return; }
        this.onImapConnected?.(entry.accountId, account.polling_interval_min ?? 5);
        res.redirect('/agent/settings');
      } catch (error) {
        logger.warn('Outlook OAuth callback failed', { message: error instanceof Error ? error.message : String(error) });
        res.status(502).send('Outlook 连接失败。请确认选择了对应的 Microsoft 账号，并在 Outlook 设置中启用 IMAP。');
      }
    });

    // Landing page — served directly at /
    const landingHtml = resolve('public/index.html');
    this.app.get('/', (_req, res) => {
      if (existsSync(landingHtml)) res.sendFile(landingHtml);
      else res.redirect('/agent/inbox');
    });

    // SPA fallback — all /agent/* routes go to the Preact app
    const distHtml = resolve('dist/frontend/index.html');
    const devHtml  = resolve('index.html');
    this.app.use((_req, res) => {
      res.sendFile(existsSync(distHtml) ? distHtml : devHtml);
    });
  }

  private setupWebSocket(): void {
    // Upgrade handler — validate JWT before accepting WS connection
    this.server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const url    = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const token  = url.searchParams.get('token') ?? (req.headers['authorization'] as string)?.replace('Bearer ', '');

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const payload = verifyToken(token);
      if (!payload) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket as any, head, (ws) => {
        this.wss.emit('connection', ws, req, payload.sub);
      });
    });

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage, userId: string) => {
      this.sockets.set(userId, ws);
      logger.info('WS connected', { userId });

      ws.on('close', () => this.sockets.delete(userId));
      ws.on('error', (err) => logger.error('WS error', { userId, err }));
    });
  }
}
