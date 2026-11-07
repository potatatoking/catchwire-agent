import { h } from 'preact';
import { combinedMailbox } from '../signals/store.ts';

export function MailboxScope() {
  return (
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px">
      <input type="checkbox" checked={combinedMailbox.value}
        onChange={(event) => { combinedMailbox.value = event.currentTarget.checked; }} />
      全部邮箱
    </label>
  );
}
