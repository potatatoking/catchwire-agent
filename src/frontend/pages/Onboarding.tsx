// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useSignal } from '@preact/signals';
import { api } from '../api/client.ts';
import { accounts, selectedAccount } from '../signals/store.ts';

// ── Constants (same as Settings) ─────────────────────────────────────────────

const LLM_PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-v1-...', note: '可访问多个模型，推荐使用' },
  { id: 'openai',     label: 'OpenAI',     placeholder: 'sk-...',        note: 'GPT-4o, o3-mini' },
  { id: 'claude',     label: 'Claude',     placeholder: 'sk-ant-...',    note: 'Sonnet, Haiku, Opus' },
  { id: 'gemini',     label: 'Gemini',     placeholder: 'AIza...',       note: 'Gemini 2.0 Flash, Pro' },
  { id: 'ollama',     label: 'Ollama',     placeholder: '',              note: '本地运行，无需 API 密钥' },
] as const;

const LLM_MODELS: Record<string, string[]> = {
  openrouter: ['google/gemini-flash-1.5', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct'],
  openai:     ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  claude:     ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7'],
  gemini:     ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama:     ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5'],
};

const TONES     = ['professional', 'friendly', 'formal', 'casual'] as const;
const AUTONOMY  = [
  { id: 'full',         label: '自动发送',  desc: '助手在有把握时自动回复' },
  { id: 'draft',        label: '草稿模式', desc: '助手拟定回复，由你逐封确认' },
  { id: 'consultative', label: '仅提供建议', desc: '助手总结邮件，由你撰写回复' },
] as const;

const ONBOARDING_KEY = 'ea_onboarding_account';

// ── Step indicator ────────────────────────────────────────────────────────────

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div style="display:flex;gap:6px;justify-content:center;margin-bottom:32px">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={`
          width:${i === current ? 24 : 8}px;height:8px;border-radius:4px;
          background:${i === current ? 'var(--accent)' : i < current ? 'var(--accent)' : 'var(--surface-3)'};
          opacity:${i < current ? '.4' : '1'};
          transition:all 300ms;
        `} />
      ))}
    </div>
  );
}

// ── Step 1 — Email connection ─────────────────────────────────────────────────

type EmailType = 'gmail' | 'imap' | 'forward';

function StepEmail({ onNext }: { onNext: (accountId: string) => void }) {
  const type      = useSignal<EmailType>('gmail');
  const email     = useSignal('');
  const display   = useSignal('');
  const imapHost  = useSignal('');
  const imapPort  = useSignal('993');
  const imapUser  = useSignal('');
  const imapPass  = useSignal('');
  const saving    = useSignal(false);
  const err       = useSignal('');

  const create = async () => {
    if (!email.value.trim()) { err.value = '请填写邮箱地址'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      err.value = '请输入有效的邮箱地址'; return;
    }
    saving.value = true;
    err.value    = '';
    try {
      const credentials: Record<string, string> = {};
      if (type.value === 'imap') {
        if (!imapHost.value || !imapPass.value) { err.value = '请填写 IMAP 服务器和密码'; saving.value = false; return; }
        credentials.host     = imapHost.value;
        credentials.port     = imapPort.value;
        credentials.user     = imapUser.value || email.value;
        credentials.password = imapPass.value;
      }
      const acc = await api.accounts.create({
        email_address: email.value.trim(),
        display_name:  display.value.trim() || undefined,
        account_type:  type.value,
        credentials:   Object.keys(credentials).length ? credentials : undefined,
      });
      if (type.value === 'gmail') {
        // Save account id so we return to step 2 after OAuth
        localStorage.setItem(ONBOARDING_KEY, acc.account_id);
        const { url } = await api.auth.startGmail(acc.account_id);
        window.location.assign(url);
      } else {
        onNext(acc.account_id);
      }
    } catch (e: any) {
      err.value = e.message ?? '连接邮箱失败';
    } finally {
      saving.value = false;
    }
  };

  const types: { id: EmailType; icon: string; label: string; desc: string }[] = [
    { id: 'gmail',   icon: 'mail',    label: 'Gmail',        desc: '通过 OAuth 授权，无需邮箱密码' },
    { id: 'imap',    icon: 'dns',     label: 'IMAP',         desc: '适用于支持 IMAP 的邮箱' },
    { id: 'forward', icon: 'forward_to_inbox', label: '仅接收转发', desc: '将邮件转发给此助手' },
  ];

  return (
    <div>
      <div style="font-size:28px;margin-bottom:8px">📬</div>
      <h2 style="font-size:20px;font-weight:700;margin-bottom:6px">连接邮箱</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:28px;line-height:1.6">
        请选择邮箱连接方式。稍后可在设置中添加更多账号。
      </p>

      {/* Type picker */}
      <div style="display:flex;gap:8px;margin-bottom:24px">
        {types.map((t) => (
          <button key={t.id}
            onClick={() => { type.value = t.id; err.value = ''; }}
            style={`
              flex:1;padding:12px 8px;border-radius:var(--r-md);cursor:pointer;text-align:center;
              border:2px solid ${type.value === t.id ? 'var(--accent)' : 'var(--border)'};
              background:${type.value === t.id ? 'var(--accent-subtle)' : 'var(--surface-1)'};
              transition:all 150ms;
            `}
          >
            <span class="material-symbols-rounded" style={`font-size:22px;display:block;margin-bottom:4px;color:${type.value === t.id ? 'var(--accent)' : 'var(--text-muted)'}`}>
              {t.icon}
            </span>
            <div style={`font-size:13px;font-weight:600;color:${type.value === t.id ? 'var(--accent)' : 'var(--text-primary)'}`}>{t.label}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Email field */}
      <div style="margin-bottom:14px">
        <div class="field-label">邮箱地址</div>
        <input class="md-input" style="margin-top:5px"
          type="email" value={email.value}
          onInput={(e: any) => { email.value = e.target.value; }}
          placeholder="you@gmail.com" />
      </div>

      {/* IMAP extra fields */}
      {type.value === 'imap' && (
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px;padding:14px;background:var(--surface-2);border-radius:var(--r-md)">
          <div style="display:grid;grid-template-columns:1fr 80px;gap:8px">
            <div>
              <div class="field-label">IMAP 服务器</div>
              <input class="md-input" style="margin-top:5px" value={imapHost.value}
                onInput={(e: any) => { imapHost.value = e.target.value; }}
                placeholder="imap.example.com" />
            </div>
            <div>
              <div class="field-label">端口</div>
              <input class="md-input" style="margin-top:5px" value={imapPort.value}
                onInput={(e: any) => { imapPort.value = e.target.value; }} />
            </div>
          </div>
          <div>
            <div class="field-label">用户名（留空则使用邮箱地址）</div>
            <input class="md-input" style="margin-top:5px" value={imapUser.value}
              onInput={(e: any) => { imapUser.value = e.target.value; }}
              placeholder="与邮箱地址相同" />
          </div>
          <div>
            <div class="field-label">密码或应用专用密码</div>
            <input class="md-input" style="margin-top:5px" type="password" value={imapPass.value}
              onInput={(e: any) => { imapPass.value = e.target.value; }}
              placeholder="••••••••" />
          </div>
        </div>
      )}

      {/* Forward-only hint */}
      {type.value === 'forward' && (
        <div style="padding:12px 14px;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:14px;font-size:12px;color:var(--text-muted);line-height:1.7">
          设置完成后，你会获得一个用于接收转发邮件的 SMTP 地址。<br />
          在邮箱设置中添加一条转发到该地址的规则。
        </div>
      )}

      {err.value && (
        <div style="padding:10px 14px;background:var(--c-critical-bg);color:var(--c-critical);border-radius:var(--r-md);margin-bottom:14px;font-size:13px">
          {err.value}
        </div>
      )}

      <button class="btn btn-primary" style="width:100%;height:44px;font-size:14px"
        onClick={create} disabled={saving.value}>
        {saving.value ? '连接中…' : type.value === 'gmail' ? '使用 Google 账号继续 →' : '连接并继续 →'}
      </button>

      {type.value === 'gmail' && (
        <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:10px;line-height:1.5">
          You'll be redirected to Google to authorize access. No password is stored.
        </p>
      )}
    </div>
  );
}

// ── Step 2 — AI Setup ─────────────────────────────────────────────────────────

function StepAI({ accountId, onNext }: { accountId: string; onNext: () => void }) {
  const provider  = useSignal('openrouter');
  const model     = useSignal(LLM_MODELS['openrouter'][0]);
  const apiKey    = useSignal('');
  const showKey   = useSignal(false);
  const tone      = useSignal<string>('professional');
  const autonomy  = useSignal<string>('draft');
  const prompt    = useSignal('');
  const saving    = useSignal(false);
  const err       = useSignal('');

  const providerInfo = LLM_PROVIDERS.find((p) => p.id === provider.value);
  const suggestedModels = LLM_MODELS[provider.value] ?? [];

  const save = async () => {
    saving.value = true;
    err.value    = '';
    try {
      await api.accounts.updatePersona(accountId, {
        llmProvider:  provider.value,
        llmModel:     model.value,
        llmApiKey:    apiKey.value || undefined,
        tone:         tone.value,
        autonomyLevel: autonomy.value,
        systemPrompt: prompt.value || undefined,
        onboardingDone: true,
      });
      onNext();
    } catch (e: any) {
      err.value = e.message ?? '保存设置失败';
    } finally {
      saving.value = false;
    }
  };

  return (
    <div>
      <div style="font-size:28px;margin-bottom:8px">🤖</div>
      <h2 style="font-size:20px;font-weight:700;margin-bottom:6px">配置 AI 助手</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:28px;line-height:1.6">
        选择 AI 模型和邮件处理方式。你可以随时在设置中调整。
      </p>

      {/* LLM Provider */}
      <div style="margin-bottom:20px">
        <div class="field-label" style="margin-bottom:8px">AI 服务商</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          {LLM_PROVIDERS.map((p) => (
            <button key={p.id}
              class={`btn ${provider.value === p.id ? 'btn-primary' : 'btn-outline'}`}
              style="font-size:12px;height:32px;padding:0 14px"
              onClick={() => {
                provider.value = p.id;
                model.value    = LLM_MODELS[p.id]?.[0] ?? '';
              }}>
              {p.label}
            </button>
          ))}
        </div>
        {providerInfo?.note && (
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">{providerInfo.note}</div>
        )}
      </div>

      {/* Model */}
      <div style="margin-bottom:20px">
        <div class="field-label" style="margin-bottom:8px">模型</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
          {suggestedModels.map((m) => (
            <button key={m}
              class={`btn ${model.value === m ? 'btn-primary' : 'btn-outline'}`}
              style="font-size:11px;height:28px;padding:0 10px;font-family:var(--mono)"
              onClick={() => { model.value = m; }}>
              {m.includes('/') ? m.split('/').pop() : m}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      {provider.value !== 'ollama' && (
        <div style="margin-bottom:20px">
          <div class="field-label" style="margin-bottom:5px">API 密钥</div>
          <div style="position:relative">
            <input class="md-input" style="padding-right:40px"
              type={showKey.value ? 'text' : 'password'}
              value={apiKey.value}
              onInput={(e: any) => { apiKey.value = e.target.value; }}
              placeholder={providerInfo?.placeholder ?? '在此粘贴 API 密钥'} />
            <button onClick={() => { showKey.value = !showKey.value; }}
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0">
              <span class="material-symbols-rounded" style="font-size:16px">
                {showKey.value ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
            密钥会加密保存。
          </div>
        </div>
      )}

      {/* Tone */}
      <div style="margin-bottom:20px">
        <div class="field-label" style="margin-bottom:8px">回复语气</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          {TONES.map((t) => (
            <button key={t}
              class={`btn ${tone.value === t ? 'btn-primary' : 'btn-outline'}`}
              style="font-size:12px;height:32px;padding:0 14px;text-transform:capitalize"
              onClick={() => { tone.value = t; }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Autonomy */}
      <div style="margin-bottom:20px">
        <div class="field-label" style="margin-bottom:8px">自动处理方式</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          {AUTONOMY.map((a) => (
            <button key={a.id}
              onClick={() => { autonomy.value = a.id; }}
              style={`
                padding:10px 14px;border-radius:var(--r-md);cursor:pointer;text-align:left;
                border:2px solid ${autonomy.value === a.id ? 'var(--accent)' : 'var(--border)'};
                background:${autonomy.value === a.id ? 'var(--accent-subtle)' : 'var(--surface-1)'};
                transition:all 150ms;
              `}>
              <div style={`font-size:13px;font-weight:600;color:${autonomy.value === a.id ? 'var(--accent)' : 'var(--text-primary)'}`}>
                {a.label}
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">{a.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 系统提示词 (optional) */}
      <div style="margin-bottom:24px">
        <div class="field-label" style="margin-bottom:5px">
          系统提示词
          <span style="font-size:10px;font-weight:400;color:var(--text-muted);margin-left:6px">可选</span>
        </div>
        <textarea class="edit-area" rows={4} style="width:100%"
          value={prompt.value}
          onInput={(e: any) => { prompt.value = e.target.value; }}
          placeholder={`你是 {{sender_name}} 的专业邮件助手。\n请使用简洁、友善的语气回复。`}
        />
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          留空则使用内置提示词。
        </div>
      </div>

      {err.value && (
        <div style="padding:10px 14px;background:var(--c-critical-bg);color:var(--c-critical);border-radius:var(--r-md);margin-bottom:14px;font-size:13px">
          {err.value}
        </div>
      )}

      <button class="btn btn-primary" style="width:100%;height:44px;font-size:14px"
        onClick={save} disabled={saving.value}>
        {saving.value ? '保存中…' : '保存并完成 →'}
      </button>

      <button class="btn btn-ghost" style="width:100%;margin-top:8px;font-size:13px"
        onClick={onNext}>
        暂时跳过
      </button>
    </div>
  );
}

// ── Step 3 — Done ─────────────────────────────────────────────────────────────

function StepDone({ onFinish }: { onFinish: () => void }) {
  return (
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:56px;margin-bottom:16px">🎉</div>
      <h2 style="font-size:22px;font-weight:700;margin-bottom:10px">设置完成！</h2>
      <p style="font-size:14px;color:var(--text-muted);line-height:1.7;margin-bottom:32px;max-width:340px;margin-inline:auto">
        邮件助手已就绪。它会分析收到的邮件，并按你的设置拟定回复。
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
        <button class="btn btn-primary" style="width:220px;height:44px;font-size:14px"
          onClick={onFinish}>
          <span class="material-symbols-rounded">inbox</span>
          打开收件箱
        </button>
        <div style="font-size:12px;color:var(--text-muted)">
          你可以随时在设置中调整。
        </div>
      </div>
    </div>
  );
}

// ── Main Onboarding component ─────────────────────────────────────────────────

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  // Check if we're returning from Gmail OAuth
  const pendingAccountId = localStorage.getItem(ONBOARDING_KEY);
  const initStep = pendingAccountId ? 1 : 0;
  const initAccountId = pendingAccountId ?? '';

  if (pendingAccountId) {
    localStorage.removeItem(ONBOARDING_KEY);
    // Reload accounts so the new Gmail account appears
    api.accounts.list().then((data) => {
      accounts.value = data;
      if (data.length && !selectedAccount.value) {
        selectedAccount.value = data[0].account_id;
      }
    }).catch(() => {});
  }

  const step      = useSignal(initStep);
  const accountId = useSignal(initAccountId);

  const goNext = () => { step.value += 1; };

  return (
    <div style="
      position:fixed;inset:0;
      background:var(--surface-2);
      display:flex;align-items:center;justify-content:center;
      z-index:1000;padding:16px;
    ">
      <div style="
        width:100%;max-width:520px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:var(--r-xl);
        padding:40px 44px;
        max-height:90vh;overflow-y:auto;
      ">
        {/* Logo */}
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px">
          <div style="width:32px;height:32px;background:var(--accent);border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 8l8 5 8-5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
              <rect x="2" y="6" width="20" height="14" rx="2" stroke="#fff" stroke-width="2" fill="none"/>
            </svg>
          </div>
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">邮件助手</span>
        </div>

        <Steps current={step.value} total={3} />

        {step.value === 0 && (
          <StepEmail onNext={(id) => { accountId.value = id; goNext(); }} />
        )}
        {step.value === 1 && (
          <StepAI accountId={accountId.value || selectedAccount.value || ''} onNext={goNext} />
        )}
        {step.value === 2 && (
          <StepDone onFinish={() => {
            // Reload accounts then hand back to App
            api.accounts.list().then((data) => {
              accounts.value = data;
              if (data.length) selectedAccount.value = data[0].account_id;
            }).finally(onComplete);
          }} />
        )}
      </div>
    </div>
  );
}
