import { h } from 'preact';
import type { SmtpConfig } from '../api/client.ts';

export function SmtpFields({ config, onChange, hasPassword = false, disabled = false }: {
  config: SmtpConfig;
  onChange: (config: SmtpConfig) => void;
  hasPassword?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} class="mailbox-fields">
      <legend>SMTP 发件设置</legend>
      <label>SMTP 服务器
        <input class="md-input" value={config.host} placeholder="smtp.example.com"
          onInput={(e) => onChange({ ...config, host: e.currentTarget.value })} />
      </label>
      <label>端口（465 使用 TLS，其他端口使用 STARTTLS）
        <input class="md-input" type="number" min={1} max={65535} value={config.port || ''}
          onInput={(e) => onChange({ ...config, port: Number(e.currentTarget.value) })} />
      </label>
      <label>用户名
        <input class="md-input" value={config.user} autocomplete="off"
          onInput={(e) => onChange({ ...config, user: e.currentTarget.value })} />
      </label>
      <label>密码或应用专用密码
        <input class="md-input" type="password" autocomplete="new-password" value={config.password ?? ''}
          placeholder={hasPassword ? '留空则保留已保存的密码' : undefined}
          onInput={(e) => onChange({ ...config, password: e.currentTarget.value })} />
      </label>
      <label>发件别名
        <textarea class="md-input" rows={3} value={(config.aliases ?? []).join(', ')}
          onChange={(e) => onChange({ ...config, aliases: e.currentTarget.value.split(/[,\s]+/).filter(Boolean) })}
          placeholder="alias@example.com, work@example.com" />
        <small class="mailbox-hint">填写已获邮箱服务商授权的别名，最多 20 个，用逗号或换行分隔。</small>
      </label>
    </fieldset>
  );
}
