import { h } from 'preact';
import { AccountSwitcher } from './AccountSwitcher.tsx';
import { PageInfo, PageInfoContent } from './PageInfo.tsx';

export function TopAppBar({
  title, info, onChatToggle, chatOpen, onNavToggle, navOpen,
}: {
  title: string;
  info?: PageInfoContent;
  onChatToggle?: () => void;
  chatOpen?: boolean;
  onNavToggle?: () => void;
  navOpen?: boolean;
}) {
  return (
    <header class="top-app-bar">
      <button class="icon-btn mobile-nav-toggle" type="button" aria-label="页面导航"
        aria-expanded={navOpen} aria-controls="main-navigation" onClick={onNavToggle}>
        <span class="material-symbols-rounded" aria-hidden="true">menu</span>
      </button>
      <span class="title">{title}</span>
      <AccountSwitcher />
      {info && <PageInfo info={info} />}
      <button class="icon-btn" title="刷新" onClick={() => window.location.reload()}>
        <span class="material-symbols-rounded">refresh</span>
      </button>
      {onChatToggle && (
        <button
          class={`chat-toggle-btn${chatOpen ? ' active' : ''}`}
          onClick={onChatToggle}
          title="助手对话"
          aria-label="助手对话"
          aria-expanded={chatOpen}
        >
          <span class="material-symbols-rounded">smart_toy</span>
        </button>
      )}
    </header>
  );
}
