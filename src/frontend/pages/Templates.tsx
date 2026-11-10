// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal, computed } from '@preact/signals';
import { selectedAccount } from '../signals/store.ts';
import { api, type PromptProfile } from '../api/client.ts';

// ── Intent definitions ──────────────────────────────────────────────────────

const INTENTS: Array<{ id: string; label: string; icon: string; color: string; hint: string }> = [
  { id: 'payment',          label: '付款／发票', icon: 'payments',       color: '#D97706', hint: '账单、发票和逾期付款' },
  { id: 'complaint',        label: '投诉／支持', icon: 'support_agent', color: '#DC2626', hint: '问题、投诉和求助' },
  { id: 'meeting_request',  label: '会议／通话',    icon: 'event',          color: '#7C3AED', hint: '日程安排、日历邀请和通话' },
  { id: 'follow_up',        label: '跟进',         icon: 'update',         color: '#0891B2', hint: '提醒和进度查询' },
  { id: 'action_required',  label: '需要处理',   icon: 'task_alt',       color: '#059669', hint: '任务、决策和待审批事项' },
  { id: 'question',         label: '咨询',          icon: 'help',           color: '#1A73E8', hint: '提问、澄清和信息请求' },
  { id: 'deadline',         label: '截止日期',          icon: 'schedule',       color: '#DC2626', hint: '有时限的事项和紧急请求' },
  { id: 'partnership',      label: '合作／销售', icon: 'handshake',    color: '#059669', hint: '商业提案和合作' },
  { id: 'hiring',           label: '招聘／人事',       icon: 'person_add',     color: '#7C3AED', hint: '求职、面试和人事事项' },
  { id: 'fyi',              label: '知会／更新',      icon: 'info',           color: '#94A3B8', hint: '仅供知悉，无需回复' },
];

// ── Default global prompt ───────────────────────────────────────────────────

const DEFAULT_GLOBAL = `你是一名专业的邮件助手。

请识别邮件的优先级、意图和待办事项，按设置的摘要语言提供简洁摘要，并起草清楚、得体的回复。

不要猜测价格、时间或政策，也不要擅自承诺。信息不足时，写出需要澄清的问题。`;

// ── Component ───────────────────────────────────────────────────────────────

export function Templates() {
  const profiles  = useSignal<PromptProfile[]>([]);
  const loading   = useSignal(true);
  const tab       = useSignal<'global' | 'intent'>('global');
  const errMsg    = useSignal('');
  const saving    = useSignal('');       // id or 'new' when saving

  // Global tab state
  const showNewGlobal  = useSignal(false);
  const editingGlobalId = useSignal('');
  const globalName     = useSignal('');
  const globalDesc     = useSignal('');
  const globalBody     = useSignal('');
  const deleteId       = useSignal('');

  // Intent tab state — which intent is being edited
  const editingIntent  = useSignal('');
  const intentBody     = useSignal('');
  const intentName     = useSignal('');

  const load = () => {
    if (!selectedAccount.value) return;
    loading.value = true;
    api.prompts.list(selectedAccount.value)
      .then((data) => { profiles.value = data; })
      .catch((e)   => { errMsg.value = e.message; })
      .finally(()  => { loading.value = false; });
  };

  useEffect(load, [selectedAccount.value]);

  const globalProfiles = computed(() => profiles.value.filter((p) => p.scope === 'global'));
  const intentProfiles = computed(() => profiles.value.filter((p) => p.scope === 'intent'));
  const activeGlobal   = computed(() => globalProfiles.value.find((p) => p.is_active));
  const intentMap      = computed(() => {
    const m: Record<string, PromptProfile> = {};
    for (const p of intentProfiles.value) if (p.intent_type) m[p.intent_type] = p;
    return m;
  });

  // ── Global actions ────────────────────────────────────────────────────────

  const saveGlobal = async (activate: boolean) => {
    if (!globalName.value.trim() || !globalBody.value.trim()) {
      errMsg.value = '请填写名称和提示词正文'; return;
    }
    saving.value = 'new';
    try {
      if (editingGlobalId.value) {
        await api.prompts.update(selectedAccount.value!, editingGlobalId.value, {
          name: globalName.value.trim(), description: globalDesc.value.trim() || undefined,
          system_prompt: globalBody.value.trim(),
        });
        if (activate) await api.prompts.activate(selectedAccount.value!, editingGlobalId.value);
      } else {
        await api.prompts.save(selectedAccount.value!, {
          name: globalName.value.trim(), description: globalDesc.value.trim() || undefined,
          system_prompt: globalBody.value.trim(), scope: 'global', activate,
        });
      }
      showNewGlobal.value = false; editingGlobalId.value = '';
      globalName.value = globalDesc.value = globalBody.value = '';
      load();
    } catch (e: any) { errMsg.value = e.message; }
    finally { saving.value = ''; }
  };

  const activateGlobal = async (id: string) => {
    try { await api.prompts.activate(selectedAccount.value!, id); load(); }
    catch (e: any) { errMsg.value = e.message; }
  };

  const deactivateAll = async () => {
    try { await api.prompts.deactivate(selectedAccount.value!); load(); }
    catch (e: any) { errMsg.value = e.message; }
  };

  const deleteProfile = async (id: string) => {
    try { await api.prompts.delete(selectedAccount.value!, id); deleteId.value = ''; load(); }
    catch (e: any) { errMsg.value = e.message; }
  };

  const startEditGlobal = (p: PromptProfile) => {
    editingGlobalId.value = p.id;
    globalName.value = p.name;
    globalDesc.value = p.description ?? '';
    globalBody.value = p.system_prompt;
    showNewGlobal.value = true;
  };

  // ── Intent actions ────────────────────────────────────────────────────────

  const openIntentEditor = (intentId: string) => {
    const existing = intentMap.value[intentId];
    editingIntent.value = intentId;
    intentName.value    = existing?.name ?? INTENTS.find((i) => i.id === intentId)?.label ?? intentId;
    intentBody.value    = existing?.system_prompt ?? '';
  };

  const saveIntent = async () => {
    if (!intentBody.value.trim()) { errMsg.value = '请填写提示词正文'; return; }
    const intentId = editingIntent.value;
    saving.value   = intentId;
    const existing = intentMap.value[intentId];
    try {
      if (existing) {
        await api.prompts.update(selectedAccount.value!, existing.id, {
          name: intentName.value, system_prompt: intentBody.value.trim(),
        });
      } else {
        await api.prompts.save(selectedAccount.value!, {
          name: intentName.value, system_prompt: intentBody.value.trim(),
          scope: 'intent', intent_type: intentId,
        });
      }
      editingIntent.value = '';
      load();
    } catch (e: any) { errMsg.value = e.message; }
    finally { saving.value = ''; }
  };

  const deleteIntent = async (intentId: string) => {
    const p = intentMap.value[intentId];
    if (!p) return;
    try { await api.prompts.delete(selectedAccount.value!, p.id); load(); }
    catch (e: any) { errMsg.value = e.message; }
  };

  if (!selectedAccount.value) {
    return <div class="empty-state"><span class="material-symbols-rounded">psychology</span><p>请先选择邮箱账号</p></div>;
  }

  return (
    <div style="max-width:740px">

      {/* ── Page header ── */}
      <div style="margin-bottom:20px">
        <div style="font-size:18px;font-weight:700">AI 提示词</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:3px">
          为所有邮件或指定邮件类型配置 AI 的阅读和回复方式
        </div>
      </div>

      {/* ── How it works ── */}
      <div style="background:var(--accent-subtle);border:1px solid var(--accent);border-radius:var(--r-md);padding:12px 14px;margin-bottom:20px;font-size:12px;color:var(--text-secondary);line-height:1.7">
        <strong style="color:var(--accent)">提示词的叠加方式：</strong>
        {' '}每封邮件首先应用<strong>全局提示词</strong>。
        接着叠加与邮件<strong>意图</strong>匹配的提示词，例如付款邮件使用付款规则，投诉邮件使用投诉规则。
        AI 会按组合后的指令处理邮件。
      </div>

      {/* ── Tabs ── */}
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px">
        {(['global', 'intent'] as const).map((t) => (
          <button key={t}
            onClick={() => { tab.value = t; }}
            style={`
              padding:8px 20px;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;
              font-family:var(--font);transition:color 120ms;
              color:${tab.value === t ? 'var(--accent)' : 'var(--text-muted)'};
              border-bottom:2px solid ${tab.value === t ? 'var(--accent)' : 'transparent'};
              margin-bottom:-2px;
            `}>
            {t === 'global' ? '全局提示词' : '按意图设置的提示词'}
            {t === 'global' && activeGlobal.value && (
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--c-low);margin-left:6px;vertical-align:middle" />
            )}
            {t === 'intent' && intentProfiles.value.length > 0 && (
              <span class="chip" style="margin-left:6px;font-size:10px">{intentProfiles.value.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Error ── */}
      {errMsg.value && (
        <div style="padding:10px 14px;background:var(--c-critical-bg);color:var(--c-critical);border-radius:var(--r-md);margin-bottom:16px;font-size:13px;display:flex;justify-content:space-between">
          {errMsg.value}
          <button style="background:none;border:none;cursor:pointer;color:inherit" onClick={() => { errMsg.value = ''; }}>✕</button>
        </div>
      )}

      {/* ══════════ GLOBAL TAB ══════════ */}
      {tab.value === 'global' && (
        <div>
          {/* Active status */}
          <div style={`
            display:flex;align-items:center;gap:12px;padding:12px 14px;
            background:${activeGlobal.value ? 'var(--c-low-bg)' : 'var(--surface-2)'};
            border:1px solid ${activeGlobal.value ? 'var(--c-low)' : 'var(--border)'};
            border-radius:var(--r-md);margin-bottom:16px;
          `}>
            <span class="material-symbols-rounded" style={`color:${activeGlobal.value ? 'var(--c-low)' : 'var(--text-muted)'};font-size:20px`}>
              {activeGlobal.value ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">
                {activeGlobal.value ? `已启用：${activeGlobal.value.name}` : '未设置全局提示词，正在使用内置默认提示词'}
              </div>
              <div style="font-size:11px;color:var(--text-muted)">
                {activeGlobal.value
                  ? '用于此账号的每次 AI 调用'
                  : '创建并启用全局提示词以自定义 AI 行为'}
              </div>
            </div>
            <div style="display:flex;gap:6px">
              {activeGlobal.value && (
                <button class="btn btn-ghost" style="height:28px;font-size:12px" onClick={deactivateAll}>
                  恢复默认
                </button>
              )}
              <button class="btn btn-primary" style="height:32px;font-size:12px"
                onClick={() => {
                  editingGlobalId.value = '';
                  globalName.value = ''; globalDesc.value = '';
                  globalBody.value = globalProfiles.value.length === 0 ? DEFAULT_GLOBAL : '';
                  showNewGlobal.value = true;
                }}>
                <span class="material-symbols-rounded" style="font-size:14px">add</span>
                新建
              </button>
            </div>
          </div>

          {/* Create / Edit form */}
          {showNewGlobal.value && (
            <div class="card" style="margin-bottom:16px">
              <div style="font-weight:600;font-size:13px;margin-bottom:14px">
                {editingGlobalId.value ? '编辑全局提示词' : '新建全局提示词'}
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <div>
                    <div class="field-label">名称 *</div>
                    <input class="md-input" value={globalName.value}
                      onInput={(e: any) => { globalName.value = e.target.value; }}
                      placeholder="例如：默认、正式、重要客户" style="margin-top:5px" />
                  </div>
                  <div>
                    <div class="field-label">说明</div>
                    <input class="md-input" value={globalDesc.value}
                      onInput={(e: any) => { globalDesc.value = e.target.value; }}
                      placeholder="适用场景（可选）" style="margin-top:5px" />
                  </div>
                </div>
                <div>
                  <div class="field-label">系统提示词 *</div>
                  <div style="font-size:11px;color:var(--text-muted);margin:4px 0 6px">
                    这段文字会替换内置的基础指令，AI 会在处理每封邮件时遵循它。
                  </div>
                  <textarea class="edit-area" rows={10}
                    value={globalBody.value}
                    onInput={(e: any) => { globalBody.value = e.target.value; }}
                    placeholder="你是公司的专业邮件助手。请始终…"
                    style="font-family:var(--mono);font-size:12px;line-height:1.6"
                  />
                  <div style="font-size:11px;color:var(--text-muted)">{globalBody.value.length} chars</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn btn-primary" style="height:34px"
                    onClick={() => saveGlobal(true)} disabled={!!saving.value}>
                    <span class="material-symbols-rounded" style="font-size:15px">check</span>
                    {saving.value ? '保存中…' : '保存并启用'}
                  </button>
                  <button class="btn btn-outline" style="height:34px"
                    onClick={() => saveGlobal(false)} disabled={!!saving.value}>
                    仅保存
                  </button>
                  <button class="btn btn-ghost" style="height:34px"
                    onClick={() => { showNewGlobal.value = false; editingGlobalId.value = ''; }}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Saved profiles */}
          {loading.value ? (
            <div class="empty-state"><span class="material-symbols-rounded">sync</span><p>加载中…</p></div>
          ) : globalProfiles.value.length === 0 && !showNewGlobal.value ? (
            <div class="empty-state" style="padding:32px">
              <span class="material-symbols-rounded">psychology</span>
              <p>暂无全局提示词</p>
              <p style="font-size:12px">点击上方的「新建」创建全局提示词。</p>
            </div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:8px">
              {globalProfiles.value.map((p) => (
                <div key={p.id} class="card" style={`padding:0;overflow:hidden;border-color:${p.is_active ? 'var(--c-low)' : 'var(--border)'}`}>
                  <div style="display:flex;align-items:center;gap:10px;padding:12px 16px">
                    <div style={`width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${p.is_active ? 'var(--c-low)' : 'var(--border-strong)'}`} />
                    <div style="flex:1;min-width:0">
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:13px;font-weight:600">{p.name}</span>
                        {p.is_active && <span class="chip" style="background:var(--c-low-bg);color:var(--c-low);font-size:10px">已启用</span>}
                      </div>
                      {p.description && <div style="font-size:11px;color:var(--text-muted)">{p.description}</div>}
                      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                        {p.system_prompt.slice(0, 80)}…
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                      <button class="btn btn-ghost" style="height:28px;padding:0 8px" onClick={() => startEditGlobal(p)} title="编辑">
                        <span class="material-symbols-rounded" style="font-size:16px">edit</span>
                      </button>
                      {!p.is_active && (
                        <button class="btn btn-outline" style="height:28px;font-size:12px;padding:0 10px"
                          onClick={() => activateGlobal(p.id)}>
                          Activate
                        </button>
                      )}
                      {p.is_active && (
                        <button class="btn btn-ghost" style="height:28px;font-size:12px;padding:0 10px" onClick={deactivateAll}>
                          Deactivate
                        </button>
                      )}
                      <button class="btn btn-ghost btn-danger" style="height:28px;padding:0 8px"
                        onClick={() => { deleteId.value = deleteId.value === p.id ? '' : p.id; }}>
                        <span class="material-symbols-rounded" style="font-size:16px">delete</span>
                      </button>
                    </div>
                  </div>
                  {deleteId.value === p.id && (
                    <div style="padding:10px 16px;border-top:1px solid var(--border);background:var(--c-critical-bg);display:flex;align-items:center;gap:10px">
                      <span style="font-size:13px;color:var(--c-critical);flex:1">删除「{p.name}」？</span>
                      <button class="btn" style="height:28px;font-size:12px;background:var(--c-critical);color:#fff;padding:0 12px"
                        onClick={() => deleteProfile(p.id)}>删除</button>
                      <button class="btn btn-ghost" style="height:28px;font-size:12px"
                        onClick={() => { deleteId.value = ''; }}>取消</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ INTENT TAB ══════════ */}
      {tab.value === 'intent' && (
        <div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
            AI 识别到对应的邮件类型时，会自动使用相应规则。
            标记 <span style="color:var(--c-low);font-weight:600">●</span> 的提示词已启用。
          </div>

          {/* Intent grid */}
          <div style="display:flex;flex-direction:column;gap:8px">
            {INTENTS.map((intent) => {
              const existing  = intentMap.value[intent.id];
              const isEditing = editingIntent.value === intent.id;
              const isSaving  = saving.value === intent.id;

              return (
                <div key={intent.id} class="card" style={`padding:0;overflow:hidden;border-color:${existing ? intent.color + '60' : 'var(--border)'}`}>
                  {/* Header row */}
                  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer"
                    onClick={() => {
                      if (isEditing) { editingIntent.value = ''; }
                      else openIntentEditor(intent.id);
                    }}>
                    <div style={`width:32px;height:32px;border-radius:var(--r-md);background:${intent.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0`}>
                      <span class="material-symbols-rounded" style={`font-size:17px;color:${intent.color}`}>{intent.icon}</span>
                    </div>
                    <div style="flex:1;min-width:0">
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:13px;font-weight:600">{intent.label}</span>
                        {existing
                          ? <span style={`width:6px;height:6px;border-radius:50%;background:${intent.color};display:inline-block`} />
                          : <span style="font-size:11px;color:var(--text-muted)">not set</span>
                        }
                      </div>
                      <div style="font-size:11px;color:var(--text-muted)">{intent.hint}</div>
                      {existing && !isEditing && (
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;font-family:var(--mono)">
                          {existing.system_prompt.slice(0, 90)}…
                        </div>
                      )}
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0" onClick={(e) => e.stopPropagation()}>
                      {existing && (
                        <button class="btn btn-ghost btn-danger" style="height:28px;padding:0 8px"
                          onClick={() => deleteIntent(intent.id)} title="移除规则">
                          <span class="material-symbols-rounded" style="font-size:16px">delete</span>
                        </button>
                      )}
                      <button class="btn btn-outline" style="height:28px;font-size:12px;padding:0 10px"
                        onClick={() => {
                          if (isEditing) editingIntent.value = '';
                          else openIntentEditor(intent.id);
                        }}>
                        {isEditing ? '取消' : existing ? '编辑' : '＋ 添加规则'}
                      </button>
                    </div>
                  </div>

                  {/* Editor panel */}
                  {isEditing && (
                    <div style="padding:0 16px 16px;border-top:1px solid var(--border)">
                      <div style="font-size:11px;color:var(--text-muted);margin:10px 0 6px">
                        当邮件意图为「<strong>{intent.label}</strong>」时应用的规则：
                      </div>
                      <textarea class="edit-area" rows={6}
                        value={intentBody.value}
                        onInput={(e: any) => { intentBody.value = e.target.value; }}
                        placeholder={getIntentPlaceholder(intent.id)}
                        style="font-family:var(--mono);font-size:12px;line-height:1.6"
                      />
                      <div style="display:flex;gap:8px;margin-top:8px">
                        <button class="btn btn-primary" style="height:32px;font-size:12px"
                          onClick={saveIntent} disabled={isSaving || !intentBody.value.trim()}>
                          <span class="material-symbols-rounded" style="font-size:14px">check</span>
                          {isSaving ? '保存中…' : '保存规则'}
                        </button>
                        <button class="btn btn-ghost" style="height:32px;font-size:12px"
                          onClick={() => { editingIntent.value = ''; }}>
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getIntentPlaceholder(intentId: string): string {
  const EXAMPLES: Record<string, string> = {
    payment: '核对发票编号、金额和付款期限。没有确认的信息不要承诺。',
    complaint: '先确认对方遇到的问题，再说明可行的下一步。',
    meeting_request: '确认日期、时区和地点。需要改期时提供可选时间。',
    follow_up: '简要说明进展、下一步和已确认的时间。',
    partnership: '确认合作范围和时间，提出一个明确的下一步。',
    hiring: '礼貌确认收到材料，并核对面试时间、方式和参加人员。',
  };
  return EXAMPLES[intentId] ?? `为「${intentId}」类邮件添加规则…`;
}
