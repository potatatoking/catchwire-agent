// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { api, type Webhook } from '../api/client.ts';

const ALL_EVENTS = [
  'email.received',
  'email.replied',
  'email.ignored',
  'priority.critical',
  'draft.created',
  'account.error',
];

export function Webhooks() {
  const items     = useSignal<Webhook[]>([]);
  const loading   = useSignal(true);
  const error     = useSignal('');
  const showForm  = useSignal(false);
  const newUrl    = useSignal('');
  const newEvents = useSignal<string[]>(['email.received', 'priority.critical']);
  const newSecret = useSignal('');
  const saving    = useSignal(false);

  const load = () => {
    loading.value = true;
    api.webhooks.list()
      .then((data) => { items.value = data; })
      .catch((e) => { error.value = e.message; })
      .finally(() => { loading.value = false; });
  };

  useEffect(load, []);

  const toggleEvent = (ev: string) => {
    newEvents.value = newEvents.value.includes(ev)
      ? newEvents.value.filter((e) => e !== ev)
      : [...newEvents.value, ev];
  };

  const create = async () => {
    if (!newUrl.value.trim()) { error.value = '请填写 URL'; return; }
    if (newEvents.value.length === 0) { error.value = '请至少选择一个事件'; return; }
    saving.value = true;
    error.value  = '';
    try {
      const wh = await api.webhooks.create({
        url:    newUrl.value.trim(),
        events: newEvents.value,
        secret: newSecret.value.trim() || undefined,
      });
      items.value   = [...items.value, wh];
      showForm.value = false;
      newUrl.value   = newSecret.value = '';
      newEvents.value = ['email.received', 'priority.critical'];
    } catch (e: any) {
      error.value = e.message;
    } finally {
      saving.value = false;
    }
  };

  const toggle = async (wh: Webhook) => {
    try {
      const updated = await api.webhooks.update(wh.id, { enabled: !wh.enabled });
      items.value = items.value.map((i) => i.id === wh.id ? { ...i, ...updated } : i);
    } catch (e: any) {
      error.value = e.message;
    }
  };

  const remove = async (id: string) => {
    if (!confirm('删除此 Webhook？')) return;
    try {
      await api.webhooks.delete(id);
      items.value = items.value.filter((i) => i.id !== id);
    } catch (e: any) {
      error.value = e.message;
    }
  };

  return (
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="section-header" style="margin:0">Webhook</div>
        <button class="btn btn-primary" onClick={() => { showForm.value = !showForm.value; }}>
          + New Webhook
        </button>
      </div>

      {error.value && (
        <div style="background:var(--c-critical-bg);color:var(--c-critical);padding:10px 14px;border-radius:var(--r-md);margin-bottom:12px;font-size:13px">
          {error.value}
        </div>
      )}

      {showForm.value && (
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:16px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:12px">新建 Webhook</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <input class="md-input" value={newUrl.value}
              onInput={(e: any) => { newUrl.value = e.target.value; }}
              placeholder="https://your-server.com/webhook" />
            <input class="md-input" value={newSecret.value}
              onInput={(e: any) => { newSecret.value = e.target.value; }}
              placeholder="签名密钥（可选，留空则自动生成）" />
            <div>
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">事件</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                {ALL_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    class={`btn ${newEvents.value.includes(ev) ? 'btn-primary' : 'btn-outline'}`}
                    style="font-size:12px;padding:4px 10px"
                    onClick={() => toggleEvent(ev)}
                  >{ev}</button>
                ))}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onClick={create} disabled={saving.value}>
                {saving.value ? '创建中…' : '创建 Webhook'}
              </button>
              <button class="btn btn-ghost" onClick={() => { showForm.value = false; }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {loading.value ? (
        <div class="empty-state"><span class="material-symbols-rounded">sync</span><p>加载中…</p></div>
      ) : items.value.length === 0 ? (
        <div class="empty-state">
          <span class="material-symbols-rounded">webhook</span>
          <p>尚未配置 Webhook</p>
          <p style="font-size:12px">收到邮件或发送回复时，通过 HTTP POST 接收通知。</p>
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:8px">
          {items.value.map((wh) => (
            <div key={wh.id} class="card" style={`padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;${!wh.enabled ? 'opacity:.6' : ''}`}>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  {wh.url}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  {(wh.events ?? []).map((ev) => (
                    <span key={ev} class="chip">
                      {ev}
                    </span>
                  ))}
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                  Created {new Date(wh.created_at).toLocaleDateString()} ·{' '}
                  <span style={wh.enabled ? 'color:var(--accent)' : 'color:var(--text-muted)'}>
                    {wh.enabled ? '已启用' : '已停用'}
                  </span>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                <button class="btn btn-outline" style="font-size:12px;padding:4px 10px" onClick={() => toggle(wh)}>
                  {wh.enabled ? '停用' : '启用'}
                </button>
                <button class="btn btn-ghost btn-danger" style="font-size:12px" onClick={() => remove(wh.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style="margin-top:20px;padding:14px;background:var(--surface-2);border-radius:var(--r-md);font-size:12px;color:var(--text-muted)">
        <strong>推送：</strong> 每个 Webhook 请求都包含签名请求头 <code>X-EmailAgent-Signature: sha256=&lt;hmac&gt;</code>，签名使用你设置的密钥生成。
        Timeout: 10 seconds.
      </div>
    </div>
  );
}
