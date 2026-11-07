// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useSignal } from '@preact/signals';
import { api, setToken } from '../api/client.ts';

interface Props {
  onLogin: () => void;
}

export function Login({ onLogin }: Props) {
  const username    = useSignal('');
  const password    = useSignal('');
  const confirm     = useSignal('');
  const error       = useSignal('');
  const loading     = useSignal(false);
  const isSetup     = useSignal<boolean | null>(null);

  // Check whether initial setup is needed
  if (isSetup.value === null) {
    api.auth.setupStatus()
      .then(({ needsSetup }) => { isSetup.value = needsSetup; })
      .catch(() => { isSetup.value = false; });
    return (
      <div class="login-container">
        <div class="login-card">
          <p>加载中…</p>
        </div>
      </div>
    );
  }

  const setupMode = isSetup.value;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error.value   = '';
    loading.value = true;

    try {
      if (setupMode && password.value !== confirm.value) {
        error.value = '两次输入的密码不一致';
        return;
      }
      const fn = setupMode ? api.auth.setup : api.auth.login;
      const { token } = await fn(username.value, password.value);
      setToken(token);
      onLogin();
    } catch (err: any) {
      error.value = err.message ?? '登录失败';
    } finally {
      loading.value = false;
    }
  }

  return (
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">
          <span class="login-icon">📧</span>
          <h1>邮件助手</h1>
          {setupMode && <p class="login-subtitle">创建管理员账号</p>}
        </div>

        <form onSubmit={handleSubmit} class="login-form">
          <div class="form-field">
            <label for="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username.value}
              onInput={(e) => { username.value = (e.target as HTMLInputElement).value; }}
              placeholder="admin"
              autocomplete="username"
              required
            />
          </div>

          <div class="form-field">
            <label for="password">密码</label>
            <input
              id="password"
              type="password"
              value={password.value}
              onInput={(e) => { password.value = (e.target as HTMLInputElement).value; }}
              placeholder="••••••••"
              autocomplete={setupMode ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {setupMode && (
            <div class="form-field">
              <label for="confirm">确认密码</label>
              <input
                id="confirm"
                type="password"
                value={confirm.value}
                onInput={(e) => { confirm.value = (e.target as HTMLInputElement).value; }}
                placeholder="••••••••"
                autocomplete="new-password"
                required
              />
            </div>
          )}

          {error.value && <p class="login-error">{error.value}</p>}

          <button type="submit" class="login-btn" disabled={loading.value}>
            {loading.value ? '请稍候…' : setupMode ? '创建账号' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
