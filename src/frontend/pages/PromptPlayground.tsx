// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { selectedAccount } from '../signals/store.ts';
import { api } from '../api/client.ts';

const SAMPLE_EMAIL = `From: client@example.com
Subject: Follow up on the proposal

Hi,

I wanted to follow up on the proposal you sent last week.
Could you let me know if there's any update or if you need additional information?

Best regards,
John`;

const DEFAULT_PROMPT = `You are a professional email assistant. Analyze the email below and draft a concise, helpful reply.

Keep the tone {{tone}} and the response under {{max_words}} words.

Email:
{{email_body}}`;

export function PromptPlayground() {
  const [prompt, setPrompt]           = useState(DEFAULT_PROMPT);
  const [sampleEmail, setSampleEmail] = useState(SAMPLE_EMAIL);
  const [result, setResult]           = useState('');
  const [tokens, setTokens]           = useState<number | null>(null);
  const [running, setRunning]         = useState(false);
  const [error, setError]             = useState('');

  const accountId = selectedAccount.value;

  async function run() {
    if (!accountId) { setError('请先选择邮箱账号。'); return; }
    setRunning(true);
    setError('');
    setResult('');
    setTokens(null);
    try {
      const res = await api.playground.run(accountId, prompt, sampleEmail);
      setResult(res.result);
      setTokens(res.tokens);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div class="page-playground" style="padding:16px;max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0">提示词调试台</h2>
        <span style="font-size:13px;color:var(--text-muted)">
          先用示例邮件测试提示词，再应用到你的账号。
        </span>
      </div>

      {error && (
        <div style="background:var(--c-critical-bg);color:var(--c-critical);padding:12px 14px;border-radius:var(--r-md);margin-bottom:12px;font-size:13px">
          {error}
        </div>
      )}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div class="field-label" style="margin-bottom:6px;font-weight:600">系统提示词</div>
          <textarea
            class="edit-area"
            rows={14}
            style="width:100%;font-family:var(--mono);font-size:13px"
            value={prompt}
            onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          />
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            支持的变量： {'{{tone}}'}, {'{{max_words}}'}, {'{{email_body}}'}, {'{{sender_name}}'}
          </div>
        </div>

        <div>
          <div class="field-label" style="margin-bottom:6px;font-weight:600">示例邮件</div>
          <textarea
            class="edit-area"
            rows={14}
            style="width:100%;font-family:var(--mono);font-size:13px"
            value={sampleEmail}
            onInput={(e) => setSampleEmail((e.target as HTMLTextAreaElement).value)}
          />
        </div>
      </div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" onClick={run} disabled={running}>
          {running ? '运行中…' : '运行'}
        </button>
      </div>

      {(result || tokens !== null) && (
        <div style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div class="field-label" style="font-weight:600">结果</div>
            {tokens !== null && (
              <span style="font-size:12px;color:var(--text-muted)">{tokens} tokens used</span>
            )}
          </div>
          <div style="background:var(--surface-2);border-radius:var(--r-md);padding:16px;white-space:pre-wrap;font-size:14px;line-height:1.6">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}
