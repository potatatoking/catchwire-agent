// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { LocationProvider, Router, Route } from 'preact-iso';
import { NavRail }          from './components/NavRail.tsx';
import { TopAppBar }        from './components/TopAppBar.tsx';
import { PageInfoContent }  from './components/PageInfo.tsx';
import { Inbox }            from './pages/Inbox.tsx';
import { Threads }          from './pages/Threads.tsx';
import { Analytics }        from './pages/Analytics.tsx';
import { Templates }        from './pages/Templates.tsx';
import { Scheduled }        from './pages/Scheduled.tsx';
import { Webhooks }         from './pages/Webhooks.tsx';
import { Settings }         from './pages/Settings.tsx';
import { PluginBuilder }    from './pages/PluginBuilder.tsx';
import { SenderOverrides }  from './pages/SenderOverrides.tsx';
import { PromptPlayground } from './pages/PromptPlayground.tsx';
import { Login }            from './pages/Login.tsx';
import { EmailTemplates }   from './pages/EmailTemplates.tsx';
import { Onboarding }       from './pages/Onboarding.tsx';
import { AgentChat }        from './components/AgentChat.tsx';
import { accounts, selectedAccount } from './signals/store.ts';
import { api, getToken, setToken, clearToken } from './api/client.ts';
import './styles/global.css';

const PAGE_TITLES: Record<string, string> = {
  '/agent/inbox':            '收件箱',
  '/agent/threads':          'Threads',
  '/agent/analytics':        'Analytics',
  '/agent/email-templates':  '邮件模板',
  '/agent/templates':        'AI 提示词',
  '/agent/scheduled':        '待发送',
  '/agent/webhooks':         'Webhooks',
  '/agent/plugins':          '插件构建器',
  '/agent/overrides':        '发件人规则',
  '/agent/playground':       '提示词调试台',
  '/agent/settings':         'Settings',
};

const PAGE_INFO: Record<string, PageInfoContent> = {
  '/agent/threads': {
    description: '按会话查看你与联系人的往来邮件。',
    actions: [
      '按最近活动查看邮件会话',
      '展开会话阅读各封邮件',
      '查看 AI 生成的邮件摘要',
    ],
  },
  '/agent/analytics': {
    description: '查看邮件量、自动回复率和主要发件人。',
    actions: [
      '查看 AI 回复的采纳和拒绝比例',
      '查看最近 30 天的每日邮件量',
      '查看邮件往来最频繁的发件人',
    ],
  },
  '/agent/email-templates': {
    description: 'Manage reusable email body templates with dynamic variables like {{name}} or {{date}}.',
    actions: [
      'Create templates with {{variable}} 占位符',
      '填写变量以预览模板效果',
      '编辑或删除已有模板',
      '为每个模板选择语气（如专业或友好）',
    ],
  },
  '/agent/templates': {
    description: '为所有邮件或指定邮件意图设置系统提示词。',
    actions: [
      '创建适用于所有邮件的全局提示词',
      'Create intent-specific prompts (e.g. for "support" emails only)',
      '启用或停用单个提示词',
      '随时编辑提示词',
    ],
  },
  '/agent/scheduled': {
    description: '查看并管理定时发送队列。',
    actions: [
      '查看待发送邮件及其发送时间',
      '在发送前取消定时邮件',
      '按待发送、已发送、失败或已取消筛选',
    ],
  },
  '/agent/webhooks': {
    description: '注册 HTTP 地址以接收邮件处理通知。',
    actions: [
      '为邮件接收、回复发送等事件添加 Webhook',
      '直接启用或停用单个 Webhook',
      '每次推送都带有可供验证的 HMAC-SHA256 签名',
      '删除不再使用的 Webhook',
    ],
  },
  '/agent/plugins': {
    description: '描述你需要的自动化流程，AI 会编写、测试并安装插件。',
    actions: [
      '用自然语言描述插件需求',
      '启用前查看生成的代码和沙盒测试结果',
      '随时启用或停用插件',
      '查看插件代码和规格',
    ],
  },
  '/agent/overrides': {
    description: '为指定发件人或域名设置回复语气、处理方式和转发规则。',
    actions: [
      '按完整邮箱地址或域名匹配（如 *@company.com）',
      '选择自动发送、草稿或仅建议',
      '为发件人单独设置回复语气',
      '将指定发件人的邮件转发到其他地址',
      '限制规则每日生效的时段',
    ],
  },
  '/agent/playground': {
    description: '用示例邮件测试系统提示词，再应用到你的账号。',
    actions: [
      '撰写或粘贴系统提示词',
      '粘贴示例邮件正文',
      '查看 AI 回复和词元用量',
    ],
  },
  '/agent/settings': {
    description: '配置邮箱、模型服务商、回复方式和个人偏好。',
    actions: [
      '连接 Gmail、IMAP 或转发邮箱',
      '通过邮箱旁的 OAuth 按钮授权 Gmail',
      '选择模型服务商和模型（如 OpenAI、Claude、Gemini 或 Ollama）',
      '设置回复语气和自动处理方式',
      '设置表情符号、回复语言和观察模式',
    ],
  },
};

export function App() {
  const path           = useSignal(window.location.pathname);
  const authed         = useSignal(!!getToken());
  const accsLoaded     = useSignal(false);
  const showOnboarding = useSignal(false);
  const magicPending   = useSignal(false);
  const isDemo         = useSignal(false);
  const chatOpen       = useSignal(false);

  // Magic link auto-login: ?magic=<token> in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic  = params.get('magic');
    if (!magic || authed.value) return;

    magicPending.value = true;
    fetch(`/api/auth/magic/redeem?token=${encodeURIComponent(magic)}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (data.token) {
          setToken(data.token);
          authed.value = true;
          // Strip magic param from URL without reload
          const clean = window.location.pathname;
          window.history.replaceState({}, '', clean);
        }
      })
      .catch(console.error)
      .finally(() => { magicPending.value = false; });
  }, []);

  useEffect(() => {
    const onLogout = () => { clearToken(); authed.value = false; };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  // Check demo mode once on mount
  useEffect(() => {
    fetch('/api/demo/status').then((r) => r.json()).then((d: any) => {
      if (d.demo) isDemo.value = true;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed.value) return;
    api.accounts.list().then((data) => {
      accounts.value = data;
      if (data.length && !selectedAccount.value) {
        selectedAccount.value = data[0].account_id;
      }
      // Show onboarding if no accounts, or returning from Gmail OAuth (pending key set)
      const pendingOAuth = !!localStorage.getItem('ea_onboarding_account');
      showOnboarding.value = data.length === 0 || pendingOAuth;
      accsLoaded.value = true;
    }).catch(console.error);
  }, [authed.value]);

  if (magicPending.value) {
    return (
      <div style="height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;background:var(--surface-1)">
        <span class="material-symbols-rounded" style="font-size:40px;color:var(--accent);animation:spin 1s linear infinite">sync</span>
        <div style="font-size:14px;color:var(--text-muted)">正在登录…</div>
      </div>
    );
  }

  if (!authed.value) {
    return <Login onLogin={() => {
      authed.value = true;
      if (path.value.includes('login') || path.value === '/agent' || path.value === '/agent/' || path.value === '/') {
         path.value = '/agent/inbox';
      }
    }} />;
  }

  // While loading accounts, show nothing (avoids flash)
  if (!accsLoaded.value) return null;

  if (showOnboarding.value) {
    return (
      <Onboarding onComplete={() => {
        showOnboarding.value = false;
      }} />
    );
  }

  const isInbox = path.value === '/agent/inbox' || path.value === '/agent' || path.value === '/agent/';

  return (
    <LocationProvider>
      {isDemo.value && (
        <div class="demo-banner">
          <span class="material-symbols-rounded" style="font-size:16px">lock</span>
          <span>演示模式下无法保存改动。</span>
          <a href="https://github.com/orilaxnet/catchwire-agent" target="_blank" rel="noopener">
            Fork 后自行部署 →
          </a>
        </div>
      )}
      <div class={`app-shell${isDemo.value ? ' demo-offset' : ''}`}>
        <NavRail currentPath={path.value} />
        <div class="main-content">
          <TopAppBar
            title={isInbox ? '收件箱' : (PAGE_TITLES[path.value] ?? '邮件助手')}
            info={PAGE_INFO[path.value]}
            onChatToggle={() => { chatOpen.value = !chatOpen.value; }}
            chatOpen={chatOpen.value}
          />
          <div class={isInbox ? 'inbox-wrapper' : 'page-wrapper'}>
            <Router onRouteChange={(url) => { path.value = url; }}>
              <Route path="/agent"           component={Inbox}            />
              <Route path="/agent/"          component={Inbox}            />
              <Route path="/agent/inbox"     component={Inbox}            />
              <Route path="/agent/threads"    component={Threads}          />
              <Route path="/agent/analytics"  component={Analytics}        />
              <Route path="/agent/email-templates" component={EmailTemplates}  />
              <Route path="/agent/templates"      component={Templates}        />
              <Route path="/agent/scheduled"  component={Scheduled}        />
              <Route path="/agent/webhooks"   component={Webhooks}         />
              <Route path="/agent/plugins"    component={PluginBuilder}    />
              <Route path="/agent/overrides"  component={SenderOverrides}  />
              <Route path="/agent/playground" component={PromptPlayground} />
              <Route path="/agent/settings"   component={Settings}         />
            </Router>
          </div>
        </div>

        {/* Right sidebar: Agent Chat */}
        <AgentChat open={chatOpen.value} onClose={() => { chatOpen.value = false; }} />
      </div>
    </LocationProvider>
  );
}
