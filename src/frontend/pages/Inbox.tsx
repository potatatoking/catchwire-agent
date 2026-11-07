// Modified for Simplified Chinese localization with OpenAI GPT.
import { MailboxScope } from '../components/MailboxScope.tsx';
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useSignal, computed } from '@preact/signals';
import { accounts, combinedMailbox, emails, selectedAccount, loading } from '../signals/store.ts';
import { api } from '../api/client.ts';
import type { EmailItem } from '../api/client.ts';

// ── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name?: string, email?: string): string {
  const src = (name ?? email ?? '?').trim();
  const parts = src.split(/[\s@]/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : src[0].toUpperCase();
}

const AVATAR_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706',
  '#DC2626','#7C3AED','#DB2777','#0284C7',
];
function avatarColor(email: string): string {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFF;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
type Filter = 'all' | 'pending' | 'critical' | 'high' | 'done';

// ── Email List Row ─────────────────────────────────────────────────────────

function EmailRow({ email, selected, source, onClick }: {
  email: EmailItem; selected: boolean; source?: string; onClick: () => void;
}) {
  const analysis = email.agent_response as any;
  const isDone   = Boolean(email.user_action);
  return (
    <div class={`email-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <span class={`email-row-dot ${email.priority}`} />
      <div class="email-row-body">
        <div class="email-row-sender">{email.sender_name || email.from_address}</div>
        <div class="email-row-subject">{email.subject}</div>
        {source && <div class="mailbox-source" title={source}>{source}</div>}
        {email.summary && <div class="email-row-preview">{email.summary}</div>}
      </div>
      <div class="email-row-meta">
        <span class="email-row-time">{timeAgo(email.created_at)}</span>
        {(email.priority === 'critical' || email.priority === 'high') && !isDone && (
          <span class={`email-row-badge ${email.priority}`}>{email.priority}</span>
        )}
        {isDone && <span class="email-row-badge done">已处理</span>}
      </div>
    </div>
  );
}

// ── Reply Card ─────────────────────────────────────────────────────────────

function ReplyCard({ reply, onSend, onEdit, isSending }: {
  reply: { label: string; body: string };
  onSend: () => void;
  onEdit: () => void;
  isSending: boolean;
}) {
  return (
    <div class="reply-card">
      <div class="reply-card-label">{reply.label}</div>
      <div class="reply-card-body">{reply.body}</div>
      <div class="reply-card-actions">
        <button class="btn btn-primary" onClick={onSend} disabled={isSending}>
          <span class="material-symbols-rounded">send</span>
          {isSending ? '发送中…' : '发送'}
        </button>
        <button class="btn btn-outline" onClick={onEdit}>
          <span class="material-symbols-rounded">edit</span>
          编辑
        </button>
      </div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────

function DetailPane({ email, readOnly, onDone, onBack }: { email: EmailItem | null; readOnly: boolean; onDone: () => void; onBack?: () => void }) {
  const fromAddress = useSignal('');
  const aliases = useSignal<string[]>([]);
  const mailAccount = accounts.value.find((account) => account.account_id === email?.account_id);

  useEffect(() => {
    fromAddress.value = '';
  }, [email?.id]);

  useEffect(() => {
    aliases.value = [];
    if (readOnly || mailAccount?.provider !== 'imap') return;
    let active = true;
    api.accounts.smtp(mailAccount.account_id).then((settings) => {
      if (active) aliases.value = (settings.aliases ?? []).filter((alias) =>
        alias.toLowerCase() !== mailAccount.email_address.toLowerCase());
    }).catch(() => {});
    return () => { active = false; };
  }, [mailAccount?.account_id, readOnly]);

  const editIdx     = useSignal<number | null>(null);
  const editBody    = useSignal('');
  const sending     = useSignal(false);
  const resultMsg   = useSignal('');
  const showBody    = useSignal(false);
  const aiInstruct  = useSignal('');
  const regenerating = useSignal(false);

  // reset state when email changes
  if (email?.id !== (DetailPane as any)._lastId) {
    (DetailPane as any)._lastId = email?.id;
    editIdx.value  = null;
    editBody.value = '';
    resultMsg.value = '';
    sending.value  = false;
    showBody.value = false;
    aiInstruct.value = '';
    regenerating.value = false;
  }

  if (!email) {
    return (
      <div class="detail-pane">
        <div class="detail-empty">
          <span class="material-symbols-rounded">mark_email_read</span>
          <p>请选择一封邮件查看</p>
        </div>
      </div>
    );
  }

  // Back button: visible only on mobile (hidden via CSS on desktop)
  const backBtn = onBack ? (
    <button class="detail-back-btn btn btn-ghost" onClick={onBack}>
      <span class="material-symbols-rounded" style="font-size:18px">arrow_back</span>
    </button>
  ) : null;

  const analysis  = email.agent_response as any;
  const replies: Array<{ label: string; body: string }> = analysis?.suggestedReplies ?? [];
  const color     = avatarColor(email.from_address);
  const ini       = initials(email.sender_name, email.from_address);
  const isDone    = Boolean(email.user_action);

  const regenerate = async () => {
    if (!aiInstruct.value.trim() || regenerating.value) return;
    regenerating.value = true;
    resultMsg.value = '';
    try {
      const res = await api.emails.regenerate(email.id, aiInstruct.value.trim(), email.account_id);
      // Update local agent_response with new replies
      (email.agent_response as any).suggestedReplies = res.suggestedReplies;
      editBody.value = res.suggestedReplies[0]?.body ?? editBody.value;
      aiInstruct.value = '';
    } catch (e: any) {
      resultMsg.value = 'error:AI regeneration failed — ' + e.message;
    } finally {
      regenerating.value = false;
    }
  };

  const sendReply = async (body: string) => {
    if (sending.value) return;
    sending.value  = true;
    resultMsg.value = '';
    try {
      await api.emails.reply(email.id, body, fromAddress.value || undefined);
      resultMsg.value = 'sent';
      onDone();
    } catch (e: any) {
      resultMsg.value = 'error:' + e.message;
    } finally {
      sending.value = false;
    }
  };

  const ignore = async () => {
    try {
      await api.actions.ignore(email.id);
      resultMsg.value = 'ignored';
      onDone();
    } catch {}
  };

  return (
    <div class="detail-pane">
      <div class="detail-scroll">

        {/* Header */}
        <div class="detail-header">
          {backBtn}
          <div class="sender-avatar" style={{ background: color }}>{ini}</div>
          <div class="detail-header-info">
            <div class="detail-from">{email.sender_name || email.from_address}</div>
            {email.sender_name && <div class="detail-from-email">{email.from_address}</div>}
            <div class="detail-time">{new Date(email.created_at).toLocaleString('zh-CN')}</div>
          </div>
          <span class={`pill ${email.priority}`}>{email.priority}</span>
        </div>

        {/* Subject */}
        <div class="detail-subject">{email.subject}</div>

        {/* AI Analysis */}
        {(email.summary || analysis?.intent) && (
          <div class="ai-card">
            <div class="ai-card-header">
              <span class="ai-chip">AI</span>
              <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">分析</span>
            </div>
            {email.summary && <div class="ai-summary">{email.summary}</div>}
            <div class="ai-meta">
              {analysis?.intent && (
                <div class="ai-meta-item">意图 <strong>{analysis.intent}</strong></div>
              )}
              {analysis?.confidence != null && (
                <div class="ai-meta-item">
                  Confidence <strong>{Math.round(analysis.confidence * 100)}%</strong>
                </div>
              )}
              {isDone && (
                <div class="ai-meta-item">
                  状态 <strong style="color:var(--c-low)">{email.user_action}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email body (collapsible placeholder — full body via GET /emails/:id) */}
        <div class="email-body-section">
          <div class="email-body-label" style="cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none"
            onClick={() => { showBody.value = !showBody.value; }}>
            原始邮件
            <span class="material-symbols-rounded" style="font-size:14px">
              {showBody.value ? 'expand_less' : 'expand_more'}
            </span>
          </div>
          {showBody.value && (
            <FullBody emailId={email.id} />
          )}
          {!showBody.value && (
            <div class="email-body-text" style="opacity:.6;font-style:italic">
              点击展开原始邮件…
            </div>
          )}
        </div>

        {/* Result message */}
        {resultMsg.value === 'sent' && (
          <div style="padding:12px 16px;background:var(--c-low-bg);color:var(--c-low);border-radius:var(--r-md);margin-bottom:16px;font-size:13px;font-weight:500">
            ✓ Reply sent successfully
          </div>
        )}
        {resultMsg.value === 'ignored' && (
          <div style="padding:12px 16px;background:var(--surface-3);color:var(--text-muted);border-radius:var(--r-md);margin-bottom:16px;font-size:13px">
            已忽略此邮件
          </div>
        )}
        {resultMsg.value.startsWith('error:') && (
          <div style="padding:12px 16px;background:var(--c-critical-bg);color:var(--c-critical);border-radius:var(--r-md);margin-bottom:16px;font-size:13px">
            {resultMsg.value.slice(6)}
          </div>
        )}

        {/* Suggested Replies */}
        {!readOnly && !isDone && mailAccount && aliases.value.length > 0 && (
          <label class="mailbox-panel mailbox-from">
            <span>发件人</span>
            <select class="md-input" value={fromAddress.value}
              onChange={(event) => { fromAddress.value = event.currentTarget.value; }}>
              <option value="">{mailAccount.email_address}</option>
              {aliases.value.map((address) => <option key={address} value={address}>{address}</option>)}
            </select>
          </label>
        )}

        {!readOnly && !isDone && replies.length > 0 && editIdx.value === null && (
          <div class="replies-section">
            <div class="replies-label">建议回复</div>
            {replies.map((r, i) => (
              <ReplyCard
                key={i}
                reply={r}
                isSending={sending.value}
                onSend={() => sendReply(r.body)}
                onEdit={() => { editIdx.value = i; editBody.value = r.body; }}
              />
            ))}
          </div>
        )}

        {/* Edit mode */}
        {!readOnly && editIdx.value !== null && (
          <div style="margin-bottom:20px">
            <div class="replies-label">编辑回复</div>

            {/* AI rewrite instruction */}
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;margin-bottom:10px">
              <div style="font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.4px;margin-bottom:6px">
                AI 改写
              </div>
              <div style="display:flex;gap:8px">
                <input
                  class="md-input"
                  style="flex:1;height:32px;font-size:12px"
                  value={aiInstruct.value}
                  onInput={(e) => { aiInstruct.value = (e.target as HTMLInputElement).value; }}
                  onKeyDown={(e) => { if (e.key === 'Enter') regenerate(); }}
                  placeholder="例如，缩短内容、调整语气或翻译成中文…"
                />
                <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:12px"
                  onClick={regenerate}
                  disabled={regenerating.value || !aiInstruct.value.trim()}>
                  <span class="material-symbols-rounded" style="font-size:14px">
                    {regenerating.value ? 'sync' : 'auto_awesome'}
                  </span>
                  {regenerating.value ? '改写中…' : '改写'}
                </button>
              </div>
            </div>

            <textarea
              class="edit-area"
              value={editBody.value}
              onInput={(e) => { editBody.value = (e.target as HTMLTextAreaElement).value; }}
            />
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onClick={() => sendReply(editBody.value)} disabled={sending.value || !editBody.value.trim()}>
                <span class="material-symbols-rounded">send</span>
                {sending.value ? '发送中…' : '发送回复'}
              </button>
              <button class="btn btn-outline" onClick={() => { editIdx.value = null; }}>取消</button>
            </div>
          </div>
        )}

        {/* No replies empty state */}
        {!readOnly && !isDone && replies.length === 0 && (
          <div style="padding:16px;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:16px;font-size:13px;color:var(--text-muted)">
            暂无建议回复。
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!readOnly && !isDone && (
        <div class="action-bar">
          {replies.length > 0 && editIdx.value === null && (
            <button class="btn btn-primary" onClick={() => sendReply(replies[0].body)} disabled={sending.value}>
              <span class="material-symbols-rounded">send</span>
              {sending.value ? '发送中…' : `发送：${replies[0].label}`}
            </button>
          )}
          {editIdx.value === null && (
            <button class="btn btn-outline" onClick={() => {
              editIdx.value = 0;
              editBody.value = replies[0]?.body ?? '';
            }}>
              <span class="material-symbols-rounded">edit</span>
              Edit & Send
            </button>
          )}
          <div style="flex:1" />
          <button class="btn btn-ghost btn-danger" onClick={ignore}>
            <span class="material-symbols-rounded">block</span>
            忽略
          </button>
        </div>
      )}
    </div>
  );
}

// lazy-loads full email body
function FullBody({ emailId }: { emailId: string }) {
  const body    = useSignal<string | null>(null);
  const loading = useSignal(true);
  useEffect(() => {
    api.emails.get(emailId)
      .then((d) => { body.value = d.body ?? '(no body)'; })
      .catch(() => { body.value = '(could not load)'; })
      .finally(() => { loading.value = false; });
  }, [emailId]);
  if (loading.value) return <div class="email-body-text" style="opacity:.5">加载中…</div>;
  return <div class="email-body-text">{body.value}</div>;
}

// ── Inbox ──────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<Filter, string> = { all: '全部', pending: '待处理', critical: '紧急', high: '高', done: '已处理' };
const FILTERS: Filter[] = ['all', 'pending', 'critical', 'high', 'done'];

export function Inbox() {
  const selectedId  = useSignal<string | null>(null);
  const page        = useSignal(1);
  const hasMore     = useSignal(false);
  const filter      = useSignal<Filter>('pending');
  const showDetail  = useSignal(false); // mobile: whether detail pane is visible

  const scope = combinedMailbox.value ? 'all' : selectedAccount.value;
  const requestId = useRef(0);
  const error = useSignal('');

  const loadEmails = (p: number) => {
    if (!scope) return;
    const request = ++requestId.current;
    loading.value = true;
    error.value = '';
    api.emails.list(scope, p).then((data) => {
      if (request !== requestId.current) return;
      emails.value = p === 1 ? data : [...emails.value, ...data];
      hasMore.value = data.length === 20 && p < 1000;
      page.value = p;
    }).catch((err) => {
      if (request === requestId.current) error.value = err.message;
    }).finally(() => {
      if (request === requestId.current) loading.value = false;
    });
  };

  useEffect(() => {
    page.value = 1;
    hasMore.value = false;
    emails.value = [];
    selectedId.value = null;
    showDetail.value = false;
    loadEmails(1);
    return () => { ++requestId.current; loading.value = false; };
  }, [scope]);

  const filtered = emails.value
    .filter((e) => {
      if (filter.value === 'all')     return true;
      if (filter.value === 'pending') return !e.user_action;
      if (filter.value === 'done')    return Boolean(e.user_action);
      return e.priority === filter.value;
    })
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9;
      const pb = PRIORITY_ORDER[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const counts: Record<string, number> = {
    all:      emails.value.length,
    pending:  emails.value.filter((e) => !e.user_action).length,
    critical: emails.value.filter((e) => e.priority === 'critical').length,
    high:     emails.value.filter((e) => e.priority === 'high').length,
    done:     emails.value.filter((e) => Boolean(e.user_action)).length,
  };

  const selectedEmail = filtered.find((e) => e.id === selectedId.value) ?? null;

  // Auto-select first email whenever the list loads or filter changes
  useEffect(() => {
    if (selectedId.value === null && filtered.length > 0) {
      selectedId.value = filtered[0].id;
    }
  }, [emails.value, filter.value]);

  return (
    <div class="inbox-shell">
      {/* ── Left: email list ── */}
      <div class="email-list-pane">
        <div class="email-list-header">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="email-list-title">{combinedMailbox.value ? '统一收件箱' : '邮件'}</div>
            <button class="btn btn-ghost" style="height:28px;padding:0 8px;font-size:12px"
              onClick={() => loadEmails(1)} disabled={loading.value}>
              <span class="material-symbols-rounded" style="font-size:14px">refresh</span>
            </button>
          </div>
          <MailboxScope />
          <div class="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f}
                class={`filter-chip${filter.value === f ? ' active' : ''}`}
                onClick={() => { filter.value = f; selectedId.value = null; /* effect auto-selects first */ }}
              >
                {FILTER_LABELS[f]}
                {counts[f] > 0 && <span class="count">({counts[f]})</span>}
              </button>
            ))}
          </div>
        </div>

        <div class="email-list-scroll">
          {error.value && <p role="alert">{error.value}</p>}
          {loading.value && emails.value.length === 0 ? (
            <div class="empty-state" style="padding:32px 16px">
              <span class="material-symbols-rounded" style="font-size:28px">sync</span>
              <p>加载中…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div class="empty-state" style="padding:32px 16px">
              <span class="material-symbols-rounded" style="font-size:28px">
                {filter.value === 'pending' ? 'check_circle' : 'inbox'}
              </span>
              <p>
                {filter.value === 'pending'
                  ? '所有邮件均已处理！'
                  : '这里暂无邮件'}
              </p>
            </div>
          ) : (
            <>
              {filtered.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  source={combinedMailbox.value ? accounts.value.find(a => a.account_id === e.account_id)?.email_address : undefined}
                  selected={selectedId.value === e.id}
                  onClick={() => { selectedId.value = e.id; showDetail.value = true; }}
                />
              ))}
            </>
          )}
              {hasMore.value && (
                <div style="padding:12px;text-align:center">
                  <button class="btn btn-ghost" style="font-size:12px"
                    onClick={() => loadEmails(page.value + 1)} disabled={loading.value}>
                    {loading.value ? '加载中…' : '加载更多'}
                  </button>
                </div>
              )}
        </div>
      </div>

      {/* ── Right: detail pane ── */}
      <div class={`detail-pane-wrapper${showDetail.value ? ' visible' : ''}`}>
        <DetailPane
          email={selectedEmail}
          readOnly={combinedMailbox.value}
          onBack={() => { showDetail.value = false; }}
          onDone={() => {
            showDetail.value = false;
            loadEmails(1);
          }}
        />
      </div>
    </div>
  );
}
