import { h } from 'preact';

const ITEMS = [
  { icon: 'inbox',         label: '收件箱',      href: '/agent/inbox'           },
  { icon: 'forum',         label: '邮件会话',    href: '/agent/threads'         },
  { icon: 'bar_chart',     label: '统计分析',  href: '/agent/analytics'       },
  { icon: 'description',   label: '模板',  href: '/agent/email-templates' },
  { icon: 'psychology',    label: '提示词',    href: '/agent/templates'       },
  { icon: 'schedule_send', label: '定时发送',  href: '/agent/scheduled'       },
  { icon: 'webhook',       label: 'Webhook',   href: '/agent/webhooks'        },
  { icon: 'extension',     label: '插件',    href: '/agent/plugins'         },
  { icon: 'tune',          label: '发件人规则',  href: '/agent/overrides'       },
  { icon: 'smart_toy',     label: '调试台', href: '/agent/playground'      },
];

export function NavRail({ currentPath, open, onNavigate }: { currentPath: string; open: boolean; onNavigate: () => void }) {
  return (
    <nav id="main-navigation" class={`nav-rail${open ? ' open' : ''}`} aria-label="页面导航">
      <div class="nav-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 8l8 5 8-5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          <rect x="2" y="6" width="20" height="14" rx="2" stroke="#fff" stroke-width="2" fill="none"/>
        </svg>
      </div>

      {ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          class={`nav-item ${currentPath === item.href ? 'active' : ''}`}
          data-label={item.label}
          title={item.label}
          aria-label={item.label}
          onClick={onNavigate}
        >
          <span class="material-symbols-rounded" aria-hidden="true">{item.icon}</span>
          <span class="nav-item-label">{item.label}</span>
        </a>
      ))}

      <div class="nav-spacer" />

      <a href="/agent/settings" class={`nav-item ${currentPath === '/agent/settings' ? 'active' : ''}`}
        data-label="设置" title="设置" aria-label="设置" onClick={onNavigate}>
        <span class="material-symbols-rounded" aria-hidden="true">settings</span>
        <span class="nav-item-label">设置</span>
      </a>
    </nav>
  );
}
