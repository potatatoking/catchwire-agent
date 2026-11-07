// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { Sparkline } from '../components/Sparkline.tsx';
import { combinedMailbox, selectedAccount } from '../signals/store.ts';
import { MailboxScope } from '../components/MailboxScope.tsx';
import { api, type Stats } from '../api/client.ts';

export function Analytics() {
  const stats = useSignal<Stats | null>(null);
  const scope = combinedMailbox.value ? 'all' : selectedAccount.value;
  const loading = useSignal(false);
  const error   = useSignal('');

  useEffect(() => {
    stats.value = null;
    error.value = '';
    if (!scope) return;
    let active = true;
    loading.value = true;
    api.accounts.stats(scope)
      .then((data) => { if (active) stats.value = data; })
      .catch((e) => { if (active) error.value = e.message ?? '加载统计数据失败'; })
      .finally(() => { if (active) loading.value = false; });
    return () => { active = false; };
  }, [scope]);

  const s = stats.value;
  if (!s || loading.value || error.value) {
    return (
      <div>
        <MailboxScope />
        <div class="empty-state">
          <p>{error.value || (loading.value ? '加载中…' : '暂无统计数据')}</p>
        </div>
      </div>
    );
  }

  const totalEmails = s.last30Days.reduce((sum, d) => sum + d.totalEmails, 0);
  const autoSent    = s.last30Days.reduce((sum, d) => sum + d.autoSent, 0);
  const autoPct     = totalEmails > 0 ? Math.round((autoSent / totalEmails) * 100) : 0;
  const sparkData   = s.last30Days.map((d) => d.totalEmails);

  return (
    <div>
      <MailboxScope />
      <div class="section-header">最近 30 天</div>

      <div class="kpi-grid">
        <div class="kpi-tile">
          <div class="kpi-value">{totalEmails}</div>
          <div class="kpi-label">邮件总量</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{autoPct}%</div>
          <div class="kpi-label">自动发送</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{Math.round((s.acceptedRatio ?? 0) * 100)}%</div>
          <div class="kpi-label">采纳率</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{Math.round(s.avgResponseMs ?? 0)}ms</div>
          <div class="kpi-label">平均响应</div>
        </div>
      </div>

      <div class="section-header">每日邮件量</div>
      <div style="background:var(--surface-2);border-radius:var(--r-md);padding:16px;margin-bottom:24px">
        <Sparkline data={sparkData} width={600} height={80} />
      </div>

      {s.topSenders.length > 0 && (
        <>
          <div class="section-header">主要发件人</div>
          {s.topSenders.map((sender) => (
            <div key={sender.sender} style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>{sender.sender}</span>
              <span style="color:var(--text-muted)">{sender.count}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
