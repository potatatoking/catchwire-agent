import { h } from 'preact';
import type { ImapConfig } from '../api/client.ts';

export function ImapFields({ config, hasPassword, disabled, onChange }: {
  config: ImapConfig;
  hasPassword?: boolean;
  disabled?: boolean;
  onChange: (config: ImapConfig) => void;
}) {
  return (
    <fieldset class="mailbox-fields" disabled={disabled}>
      <legend>IMAP 收信设置</legend>
      <label>IMAP 服务器
        <input class="md-input" value={config.host} placeholder="imap.example.com"
          onInput={(event) => onChange({ ...config, host: event.currentTarget.value })} />
      </label>
      <label>端口
        <input class="md-input" type="number" min={1} max={65535} value={config.port || ''}
          onInput={(event) => onChange({ ...config, port: Number(event.currentTarget.value) })} />
      </label>
      <label>用户名
        <input class="md-input" value={config.user} placeholder="留空则使用邮箱地址"
          onInput={(event) => onChange({ ...config, user: event.currentTarget.value })} />
      </label>
      <label>密码或应用专用密码
        <input class="md-input" type="password" autocomplete="new-password" value={config.password ?? ''}
          placeholder={hasPassword ? '留空则保留已保存的 IMAP 密码' : undefined}
          onInput={(event) => onChange({ ...config, password: event.currentTarget.value })} />
      </label>
    </fieldset>
  );
}
