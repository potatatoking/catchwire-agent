// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { selectedAccount, accounts } from '../signals/store.ts';
import { api, type Account } from '../api/client.ts';

const LLM_PROVIDERS = [
  { id: 'grok',       label: 'Grok (xAI)',  placeholder: 'xai-...' },
  { id: 'openrouter', label: 'OpenRouter',  placeholder: 'sk-or-v1-...' },
  { id: 'openai',     label: 'OpenAI',      placeholder: 'sk-...' },
  { id: 'gemini',     label: 'Gemini',      placeholder: 'AIza...' },
  { id: 'claude',     label: 'Claude',      placeholder: 'sk-ant-...' },
  { id: 'ollama',     label: 'Ollama',      placeholder: 'http://localhost:11434' },
  { id: 'custom',     label: '自定义',      placeholder: 'API 密钥' },
] as const;

const LLM_MODELS: Record<string, string[]> = {
  grok:       ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning', 'grok-4.20-0309-non-reasoning', 'grok-4.20-0309-reasoning', 'grok-4.20-multi-agent-0309'],
  openrouter: ['google/gemini-flash-1.5', 'google/gemini-2.0-flash-exp', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct'],
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  gemini:     ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  claude:     ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  ollama:     ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'deepseek-r1'],
  custom:     [],
};

const TONE_LABELS = { professional: '专业', friendly: '友好', formal: '正式', casual: '随意' };
const TONES    = ['professional', 'friendly', 'formal', 'casual'] as const;
const AUTONOMY = [
  { id: 'full',         label: '自动发送',    desc: 'AI 置信度达到 90% 时自动发送' },
  { id: 'draft',        label: '草稿模式',   desc: '发送前始终需要确认' },
  { id: 'consultative', label: '仅提供建议', desc: '只显示摘要' },
] as const;
const LANGUAGES = ['auto','en','fa','de','fr','es','ar','zh'] as const;
const LANGUAGE_LABELS = { auto: '自动识别', en: '英语', fa: '波斯语', de: '德语', fr: '法语', es: '西班牙语', ar: '阿拉伯语', zh: '中文' };

export function Settings() {
  const provider   = useSignal('openrouter');
  const llmModel   = useSignal('');
  const apiKey     = useSignal('');
  const baseUrl    = useSignal('');
  const tone       = useSignal('professional');
  const autonomy   = useSignal('draft');
  const language   = useSignal('auto');
  const useEmoji   = useSignal(false);
  const savedMsg   = useSignal('');
  const loadingP   = useSignal(false);
  const showKey    = useSignal(false);

  const telegramEnabled = useSignal(false);
  const smtpPort        = useSignal(2525);
  const apiBaseUrl      = useSignal('');
  const copiedField     = useSignal('');

  const renameAccount = useSignal<Account | null>(null);
  const displayName = useSignal('');
  const savingName = useSignal(false);
  const renameError = useSignal('');

  async function saveDisplayName(event: Event) {
    event.preventDefault();
    const account = renameAccount.value;
    if (!account || savingName.value) return;
    savingName.value = true;
    renameError.value = '';
    try {
      const updated = await api.accounts.rename(account.account_id, displayName.value);
      accounts.value = accounts.value.map((item) => item.account_id === updated.account_id ? updated : item);
      renameAccount.value = null;
    } catch (error) {
      renameError.value = error instanceof Error ? error.message : '无法保存显示名称';
    } finally {
      savingName.value = false;
    }
  }

  const showAddAcc  = useSignal(false);
  const newEmail    = useSignal('');
  const newDisplay  = useSignal('');
  const newType     = useSignal('imap');
  const imapHost    = useSignal('imap.gmail.com');
  const imapPort    = useSignal('993');
  const imapUser    = useSignal('');
  const imapPass    = useSignal('');
  const addingAcc   = useSignal(false);
  const addAccErr   = useSignal('');
  const testingConn = useSignal(false);
  const testResult  = useSignal<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    api.integrations.info().then((info) => {
      telegramEnabled.value = info.telegramEnabled;
      smtpPort.value        = info.smtpPort;
      apiBaseUrl.value      = info.apiBaseUrl || window.location.origin;
    }).catch(() => { apiBaseUrl.value = window.location.origin; });
  }, []);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      copiedField.value = field;
      setTimeout(() => { copiedField.value = ''; }, 2000);
    });
  };

  useEffect(() => {
    if (!selectedAccount.value) return;
    loadingP.value = true;
    api.accounts.persona(selectedAccount.value).then((p) => {
      provider.value  = p.llmProvider  ?? 'openrouter';
      llmModel.value  = p.llmModel     ?? '';
      tone.value      = p.tone         ?? 'professional';
      autonomy.value  = p.autonomyLevel ?? 'draft';
      language.value  = p.language     ?? 'auto';
      useEmoji.value  = p.useEmoji     ?? false;
    }).catch(console.error).finally(() => { loadingP.value = false; });
  }, [selectedAccount.value]);

  const savePersona = () => {
    if (!selectedAccount.value) return;
    const patch: any = {
      tone: tone.value, autonomyLevel: autonomy.value,
      language: language.value, useEmoji: useEmoji.value,
      llmProvider: provider.value,
      llmModel: llmModel.value || undefined,
    };
    if (apiKey.value.trim())  patch.llmApiKey = apiKey.value.trim();
    if (baseUrl.value.trim()) patch.llmBaseUrl = baseUrl.value.trim();

    api.accounts.updatePersona(selectedAccount.value, patch).then(() => {
      savedMsg.value = 'saved';
      apiKey.value   = '';
      setTimeout(() => { savedMsg.value = ''; }, 3000);
    }).catch((e) => { savedMsg.value = `error:${e.message}`; });
  };

  const testConnection = async () => {
    testResult.value  = null;
    testingConn.value = true;
    try {
      const r = await fetch('/api/accounts/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ea_token')}` },
        body: JSON.stringify({
          host: imapHost.value || 'imap.gmail.com',
          port: parseInt(imapPort.value) || 993,
          user: imapUser.value || newEmail.value,
          pass: imapPass.value,
        }),
      });
      const d = await r.json() as { ok: boolean; error?: string };
      testResult.value = { ok: d.ok, msg: d.ok ? '连接成功，可以保存。' : (d.error ?? '连接失败') };
    } catch {
      testResult.value = { ok: false, msg: '网络错误，无法连接服务器' };
    } finally { testingConn.value = false; }
  };

  const addAccount = async () => {
    if (!newEmail.value.trim()) { addAccErr.value = '请填写邮箱地址'; return; }
    addingAcc.value = true; addAccErr.value = '';
    try {
      const creds = newType.value === 'imap' ? {
        imap_host: imapHost.value || 'imap.gmail.com',
        imap_port: parseInt(imapPort.value) || 993,
        imap_user: imapUser.value || newEmail.value,
        imap_pass: imapPass.value,
      } : undefined;
      await api.accounts.create({
        email_address: newEmail.value.trim(),
        display_name:  newDisplay.value.trim() || undefined,
        account_type:  newType.value, credentials: creds,
      });
      const updated = await api.accounts.list();
      accounts.value = updated;
      showAddAcc.value = false;
      newEmail.value = newDisplay.value = imapHost.value = imapUser.value = imapPass.value = '';
      testResult.value = null;
    } catch (e: any) { addAccErr.value = e.message; }
    finally { addingAcc.value = false; }
  };

  const suggestedModels = LLM_MODELS[provider.value] ?? [];
  const providerInfo    = LLM_PROVIDERS.find((p) => p.id === provider.value);

  return (
    <div style="max-width:560px">

        {/* ── Accounts ── */}
        <section style="margin-bottom:32px">
          <div class="section-header">邮箱账号</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
            {accounts.value.length === 0 && (
              <div class="empty-state" style="padding:24px">
                <span class="material-symbols-rounded">email</span>
                <p>尚未连接邮箱账号</p>
              </div>
            )}
            {accounts.value.map((a) => (
              <div key={a.account_id}
                onClick={() => { selectedAccount.value = a.account_id; }}
                style={`
                  display:flex;align-items:center;gap:12px;padding:10px 14px;
                  border-radius:var(--r-md);cursor:pointer;transition:background 100ms;
                  background:${a.account_id === selectedAccount.value ? 'var(--accent-subtle)' : 'var(--surface-2)'};
                  border:1.5px solid ${a.account_id === selectedAccount.value ? 'var(--accent)' : 'transparent'};
                `}>
                <span class="material-symbols-rounded" style="color:var(--accent);font-size:18px">email</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600">{a.display_name || a.email_address}</div>
                  {a.display_name && a.display_name !== a.email_address && (
                    <div style="font-size:11px;color:var(--text-muted)">{a.email_address}</div>
                  )}
                  <div style="font-size:11px;color:var(--text-muted)">{a.provider}</div>
                </div>
                <button type="button" class="btn btn-outline" disabled={savingName.value}
                  onClick={(event) => {
                    event.stopPropagation();
                    renameAccount.value = a;
                    displayName.value = a.display_name === a.email_address ? '' : a.display_name ?? '';
                    renameError.value = '';
                  }}>改名</button>
                {a.provider === 'gmail' && (
                  <button type="button" onClick={async (event) => {
                    event.stopPropagation();
                    try {
                      const { url } = await api.auth.startGmail(a.account_id);
                      window.location.assign(url);
                    } catch (error) {
                      window.alert(error instanceof Error ? error.message : 'Gmail 授权失败');
                    }
                  }}
                    class="btn btn-outline"
                    style="height:26px;font-size:11px;padding:0 10px;text-decoration:none"
                    title="授权连接 Gmail">
                    <span class="material-symbols-rounded" style="font-size:13px">link</span>
                    OAuth
                  </button>
                )}
                {a.account_id === selectedAccount.value && (
                  <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent)">check_circle</span>
                )}
              </div>
            ))}
            <button class="btn btn-outline" style="align-self:flex-start;margin-top:4px"
              onClick={() => { showAddAcc.value = !showAddAcc.value; }}>
              <span class="material-symbols-rounded">add</span>
              添加邮箱
            </button>
          </div>

          {renameAccount.value && (
            <form class="card" style="margin-bottom:16px" onSubmit={saveDisplayName}>
              <label class="field-label" for="account-display-name">显示名称 · {renameAccount.value.email_address}</label>
              <input id="account-display-name" class="md-input" value={displayName.value}
                maxLength={100} disabled={savingName.value}
                placeholder="留空则显示邮箱地址"
                onInput={(event) => { displayName.value = event.currentTarget.value; }} />
              {renameError.value && <p role="alert">{renameError.value}</p>}
              <div style="display:flex;gap:8px;margin-top:8px">
                <button type="submit" class="btn btn-primary" disabled={savingName.value}>
                  {savingName.value ? '保存中…' : '保存'}
                </button>
                <button type="button" class="btn btn-ghost" disabled={savingName.value}
                  onClick={() => { renameAccount.value = null; }}>取消</button>
              </div>
            </form>
          )}

          {showAddAcc.value && (
            <div class="card" style="margin-bottom:16px">
              <div style="font-weight:600;font-size:13px;margin-bottom:12px">连接邮箱账号</div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <div>
                  <div class="field-label">邮箱地址 *</div>
                  <input class="md-input" value={newEmail.value}
                    onInput={(e: any) => { newEmail.value = e.target.value; }}
                    placeholder="you@example.com" />
                </div>
                <div>
                  <div class="field-label">显示名称</div>
                  <input class="md-input" value={newDisplay.value}
                    onInput={(e: any) => { newDisplay.value = e.target.value; }}
                    placeholder="显示名称（可选）" />
                </div>
                <div>
                  <div class="field-label">账号类型</div>
                  <select class="md-input" value={newType.value}
                    onChange={(e: any) => { newType.value = e.target.value; }}>
                    {['gmail','outlook','imap','forward'].map((t) => <option value={t}>{t === 'forward' ? '仅接收转发' : t.toUpperCase()}</option>)}
                  </select>
                </div>
                {newType.value === 'imap' && (
                  <>
                    <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
                      <div>
                        <div class="field-label">IMAP 服务器</div>
                        <input class="md-input" value={imapHost.value}
                          onInput={(e: any) => { imapHost.value = e.target.value; }}
                          placeholder="imap.gmail.com" />
                      </div>
                      <div style="width:80px">
                        <div class="field-label">端口</div>
                        <input class="md-input" value={imapPort.value} type="number"
                          onInput={(e: any) => { imapPort.value = e.target.value; }} />
                      </div>
                    </div>
                    <div>
                      <div class="field-label">用户名</div>
                      <input class="md-input" value={imapUser.value}
                        onInput={(e: any) => { imapUser.value = e.target.value; }}
                        placeholder="留空则使用邮箱地址" />
                    </div>
                    <div>
                      <div class="field-label">密码或应用专用密码</div>
                      <input class="md-input" type="password" value={imapPass.value}
                        onInput={(e: any) => { imapPass.value = e.target.value; testResult.value = null; }}
                        placeholder="Gmail 请填写应用专用密码" />
                    </div>
                    {/* Test connection */}
                    <div>
                      <button class="btn btn-ghost" style="font-size:13px"
                        onClick={testConnection} disabled={testingConn.value || !imapPass.value}>
                        <span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle">wifi_tethering</span>
                        {testingConn.value ? ' 测试中…' : ' 测试连接'}
                      </button>
                    </div>
                    {testResult.value && (
                      <div style={`font-size:12px;padding:8px 12px;border-radius:8px;line-height:1.5;
                        background:${testResult.value.ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)'};
                        color:${testResult.value.ok ? '#4ade80' : '#f87171'}`}>
                        {testResult.value.ok ? '✓ ' : '✗ '}{testResult.value.msg}
                      </div>
                    )}
                  </>
                )}
                {addAccErr.value && (
                  <div style="font-size:12px;color:var(--c-critical);padding:8px 12px;background:rgba(239,68,68,.1);border-radius:8px;line-height:1.5">
                    {addAccErr.value}
                  </div>
                )}
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button class="btn btn-primary" onClick={addAccount} disabled={addingAcc.value}>
                    {addingAcc.value ? '连接中…' : '连接账号'}
                  </button>
                  <button class="btn btn-ghost" onClick={() => { showAddAcc.value = false; testResult.value = null; }}>取消</button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Integrations ── */}
        <div class="divider" style="margin-bottom:24px" />
        <section style="margin-bottom:32px">
          <div class="section-header" style="margin-bottom:16px">集成</div>

          {/* n8n / API */}
          <div class="card" style="margin-bottom:12px;padding:16px 18px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <span class="material-symbols-rounded" style="color:var(--accent);font-size:20px">webhook</span>
              <div>
                <div style="font-size:13px;font-weight:600">n8n / Make / External Agents</div>
                <div style="font-size:11px;color:var(--text-muted)">通过 REST API 和 Webhook 连接自动化工具</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              {[
                { label: 'API 基础地址', value: `${apiBaseUrl.value}/api`, field: 'apibase' },
                { label: '身份验证接口', value: `POST ${apiBaseUrl.value}/api/auth/login`, field: 'auth' },
              ].map(({ label, value, field }) => (
                <div key={field}>
                  <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">{label}</div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <code style="flex:1;font-size:11px;background:var(--surface-3,var(--surface-2));padding:6px 10px;border-radius:var(--r-sm,6px);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      {value}
                    </code>
                    <button class="btn btn-ghost" style="height:28px;padding:0 8px;min-width:0"
                      onClick={() => copyToClipboard(value, field)}
                      title="复制">
                      <span class="material-symbols-rounded" style="font-size:14px">
                        {copiedField.value === field ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;padding:8px 10px;background:var(--surface-2);border-radius:var(--r-sm,6px);line-height:1.6">
                1. 向 <code>/api/auth/login</code> 发送 POST 请求，获取 <code>token</code><br/>
                2. 在请求中添加 <code>Authorization: Bearer &lt;token&gt;</code><br/>
                3. 在 <a href="/agent/webhooks" style="color:var(--accent)">Webhook</a> 页面注册接收地址，以获取实时事件
              </div>
            </div>
          </div>

          {/* Telegram */}
          <div class="card" style="margin-bottom:12px;padding:16px 18px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <span class="material-symbols-rounded" style="color:var(--accent);font-size:20px">send</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">Telegram 机器人</div>
                <div style="font-size:11px;color:var(--text-muted)">用手机批准或拒绝回复</div>
              </div>
              <div style={`font-size:10px;font-weight:600;padding:3px 8px;border-radius:99px;
                background:${telegramEnabled.value ? 'var(--c-low-bg,#1a2e1a)' : 'var(--surface-2)'};
                color:${telegramEnabled.value ? 'var(--c-low,#4caf50)' : 'var(--text-muted)'}`}>
                {telegramEnabled.value ? '已启用' : '未配置'}
              </div>
            </div>
            {telegramEnabled.value ? (
              <div style="font-size:11px;color:var(--text-muted);line-height:1.7">
                机器人正在运行，可在 Telegram 中找到它。<br/>
                <strong style="color:var(--text)">命令：</strong><br/>
                <code>/start</code> — welcome &amp; connect account<br/>
                <code>/settings</code> — change LLM, tone, autonomy<br/>
                <code>/setmodel &lt;name&gt;</code> — switch model<br/>
                <code>/analytics</code> — 7-day stats<br/>
                <code>/addaccount</code> — add another inbox<br/>
                <code>/setstyle</code> — teach your writing style<br/>
                <code>/help</code> — full command list
              </div>
            ) : (
              <div style="font-size:11px;color:var(--text-muted);line-height:1.7">
                在 <code>.env</code> 中设置 <code>TELEGRAM_BOT_TOKEN</code> 即可启用。<br/>
                获取令牌，请联系 Telegram 上的 <a href="https://t.me/BotFather" target="_blank" style="color:var(--accent)">@BotFather</a>。<br/>
                可选：将 <code>TELEGRAM_ALLOWED_USERS</code> 设为以逗号分隔的 Telegram 用户 ID 列表，以限制访问权限。
              </div>
            )}
          </div>

          {/* SMTP Forward */}
          <div class="card" style="padding:16px 18px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <span class="material-symbols-rounded" style="color:var(--accent);font-size:20px">forward_to_inbox</span>
              <div>
                <div style="font-size:13px;font-weight:600">邮件转发（SMTP）</div>
                <div style="font-size:11px;color:var(--text-muted)">将邮件直接转发给助手</div>
              </div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">转发至</div>
              <div style="display:flex;align-items:center;gap:6px">
                <code style="flex:1;font-size:11px;background:var(--surface-2);padding:6px 10px;border-radius:var(--r-sm,6px);font-family:var(--mono)">
                  {apiBaseUrl.value.replace(/^https?:\/\//, '')} port {smtpPort.value}
                </code>
                <button class="btn btn-ghost" style="height:28px;padding:0 8px;min-width:0"
                  onClick={() => copyToClipboard(`${apiBaseUrl.value.replace(/^https?:\/\//, '')}:${smtpPort.value}`, 'smtp')}
                  title="复制">
                  <span class="material-symbols-rounded" style="font-size:14px">
                    {copiedField.value === 'smtp' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
                在 Gmail 或 Outlook 中设置规则，将邮件转发到此地址。
              </div>
            </div>
          </div>
        </section>

        {selectedAccount.value && (
          <>
            <div class="divider" />

            {/* ── AI / LLM Config ── */}
            <section style="margin-top:24px;margin-bottom:32px">
              <div class="section-header" style="margin-bottom:16px">
                AI Configuration
                {loadingP.value && <span style="font-size:11px;color:var(--text-muted);margin-left:8px;font-weight:400">加载中…</span>}
              </div>

              {/* Provider selector */}
              <div style="margin-bottom:16px">
                <div class="field-label">模型服务商</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  {LLM_PROVIDERS.map((p) => (
                    <button key={p.id}
                      class={`btn ${provider.value === p.id ? 'btn-primary' : 'btn-outline'}`}
                      style="font-size:12px;height:30px;padding:0 12px"
                      onClick={() => { provider.value = p.id; llmModel.value = LLM_MODELS[p.id]?.[0] ?? ''; }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model */}
              <div style="margin-bottom:16px">
                <div class="field-label">模型</div>
                {suggestedModels.length > 0 ? (
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
                    <div style="display:flex;flex-wrap:wrap;gap:6px">
                      {suggestedModels.map((m) => (
                        <button key={m}
                          class={`btn ${llmModel.value === m ? 'btn-primary' : 'btn-outline'}`}
                          style="font-size:11px;height:28px;padding:0 10px;font-family:var(--mono)"
                          onClick={() => { llmModel.value = m; }}>
                          {m.includes('/') ? m.split('/').pop() : m}
                        </button>
                      ))}
                    </div>
                    <input class="md-input" value={llmModel.value}
                      onInput={(e: any) => { llmModel.value = e.target.value; }}
                      placeholder="或输入自定义模型名称" style="margin-top:4px" />
                  </div>
                ) : (
                  <input class="md-input" value={llmModel.value}
                    onInput={(e: any) => { llmModel.value = e.target.value; }}
                    placeholder="模型名称或路径" style="margin-top:6px" />
                )}
              </div>

              {/* API Key */}
              <div style="margin-bottom:16px">
                <div class="field-label">API 密钥</div>
                <div style="position:relative;margin-top:6px">
                  <input class="md-input" type={showKey.value ? 'text' : 'password'}
                    value={apiKey.value}
                    onInput={(e: any) => { apiKey.value = e.target.value; }}
                    placeholder={providerInfo?.placeholder ?? '留空则保留现有密钥'}
                    style="padding-right:40px" />
                  <button onClick={() => { showKey.value = !showKey.value; }}
                    style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0">
                    <span class="material-symbols-rounded" style="font-size:16px">
                      {showKey.value ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                  留空则保留现有密钥。密钥加密存储于数据库。
                </div>
              </div>

              {/* Base URL (Ollama / Custom) */}
              {(provider.value === 'ollama' || provider.value === 'custom') && (
                <div style="margin-bottom:16px">
                  <div class="field-label">接口地址</div>
                  <input class="md-input" value={baseUrl.value}
                    onInput={(e: any) => { baseUrl.value = e.target.value; }}
                    placeholder={provider.value === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                    style="margin-top:6px" />
                </div>
              )}
            </section>

            <div class="divider" />

            {/* ── Behavior ── */}
            <section style="margin-top:24px;margin-bottom:32px">
              <div class="section-header" style="margin-bottom:16px">回复方式</div>

              {/* Tone */}
              <div style="margin-bottom:16px">
                <div class="field-label">回复语气</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  {TONES.map((t) => (
                    <button key={t}
                      class={`btn ${tone.value === t ? 'btn-primary' : 'btn-outline'}`}
                      style="font-size:12px;height:30px;padding:0 14px;text-transform:capitalize"
                      onClick={() => { tone.value = t; }}>
                      {TONE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Autonomy */}
              <div style="margin-bottom:16px">
                <div class="field-label">自动处理方式</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
                  {AUTONOMY.map((a) => (
                    <label key={a.id} style={`
                      display:flex;align-items:center;gap:12px;padding:10px 14px;
                      border-radius:var(--r-md);cursor:pointer;transition:background 100ms;
                      background:${autonomy.value === a.id ? 'var(--accent-subtle)' : 'var(--surface-2)'};
                      border:1.5px solid ${autonomy.value === a.id ? 'var(--accent)' : 'transparent'};
                    `}>
                      <input type="radio" name="autonomy" value={a.id}
                        checked={autonomy.value === a.id}
                        onChange={() => { autonomy.value = a.id; }}
                        style="accent-color:var(--accent)" />
                      <div>
                        <div style="font-size:13px;font-weight:600">{a.label}</div>
                        <div style="font-size:11px;color:var(--text-muted)">{a.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div style="margin-bottom:16px">
                <div class="field-label">回复语言</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  {LANGUAGES.map((l) => (
                    <button key={l}
                      class={`btn ${language.value === l ? 'btn-primary' : 'btn-outline'}`}
                      style="font-size:12px;height:30px;padding:0 12px"
                      onClick={() => { language.value = l; }}>
                      {LANGUAGE_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji */}
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;background:var(--surface-2);border-radius:var(--r-md)">
                <input type="checkbox" checked={useEmoji.value}
                  onChange={(e: any) => { useEmoji.value = e.target.checked; }}
                  style="accent-color:var(--accent);width:16px;height:16px" />
                <div>
                  <div style="font-size:13px;font-weight:500">在回复中使用表情符号</div>
                  <div style="font-size:11px;color:var(--text-muted)">按上下文添加表情符号，使语气更亲切</div>
                </div>
              </label>
            </section>

            {/* ── Save ── */}
            <div style="display:flex;align-items:center;gap:12px;padding-bottom:40px">
              <button class="btn btn-primary" style="height:38px;padding:0 24px"
                onClick={savePersona} disabled={loadingP.value}>
                保存设置
              </button>
              {savedMsg.value === 'saved' && (
                <span style="font-size:13px;color:var(--c-low);font-weight:500">✓ 设置已保存</span>
              )}
              {savedMsg.value.startsWith('error:') && (
                <span style="font-size:13px;color:var(--c-critical)">{savedMsg.value.slice(6)}</span>
              )}
            </div>
          </>
        )}
    </div>
  );
}
