import { h } from 'preact';
import { combinedMailbox } from '../signals/store.ts';

export function MailboxScope() {
  return (
    <label class="mailbox-scope">
      <input type="checkbox" role="switch" checked={combinedMailbox.value}
        onChange={(event) => { combinedMailbox.value = event.currentTarget.checked; }} />
      全部邮箱
    </label>
  );
}
