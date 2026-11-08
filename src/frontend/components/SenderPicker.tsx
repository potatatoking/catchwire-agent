import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';

export function SenderPicker({ primary, aliases, selected, disabled, onSelect }: {
  primary: string;
  aliases: string[];
  selected: string;
  disabled?: boolean;
  onSelect: (address: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const addresses = [primary, ...aliases].filter((address) => address.toLowerCase().includes(search));

  return (
    <div class="mailbox-panel mailbox-from">
      <span>发件人</span>
      <button type="button" class="btn btn-outline mailbox-sender-trigger" aria-haspopup="dialog"
        disabled={disabled} onClick={() => { setQuery(''); dialog.current?.showModal(); }}>
        <span>{selected || primary}</span>
        <span class="material-symbols-rounded" aria-hidden="true">expand_more</span>
      </button>
      <dialog ref={dialog} class="mailbox-sender-dialog" aria-label="选择发件人">
        <header class="mailbox-sender-heading">
          <h2>选择发件人</h2>
          <button type="button" class="btn btn-ghost" onClick={() => dialog.current?.close()}>关闭</button>
        </header>
        <input type="search" class="md-input" aria-label="搜索发件地址"
          placeholder="搜索发件地址" value={query} autoFocus
          onInput={(event) => setQuery(event.currentTarget.value)} />
        <div class="mailbox-sender-list">
          {addresses.map((address) => {
            const current = address === (selected || primary);
            return (
              <button type="button" key={address} class="mailbox-sender-option"
                aria-pressed={current} onClick={() => {
                  onSelect(address === primary ? '' : address);
                  dialog.current?.close();
                }}>
                <span>{address}<small>{address === primary ? '主邮箱' : '发件别名'}</small></span>
                {current && <span class="material-symbols-rounded" aria-hidden="true">check</span>}
              </button>
            );
          })}
          {addresses.length === 0 && <p role="status">没有匹配的发件地址</p>}
        </div>
      </dialog>
    </div>
  );
}
