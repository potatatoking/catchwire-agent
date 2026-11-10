/**
 * Agent Chat — conversational interface for inbox management.
 * POST /api/chat  { accountId, message, history? }
 */

import { Router } from 'express';
import { getPool } from '../../../storage/pg-pool.ts';
import { logger } from '../../../utils/logger.ts';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware.ts';
import { isDemoMode } from '../middleware/demo.middleware.ts';

const router = Router();

async function assertOwnsAccount(accountId: string, userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'SELECT 1 FROM email_accounts WHERE id = $1 AND user_id = $2',
    [accountId, userId]
  );
  return (rowCount ?? 0) > 0;
}

router.post('/chat', rateLimitMiddleware('llm_requests'), async (req, res) => {
  const { accountId, message, history = [] } = req.body as {
    accountId?: string;
    message?:   string;
    history?:   Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!accountId || !message?.trim()) {
    res.status(400).json({ error: 'accountId and message are required' });
    return;
  }

  try {
    const userId = (req as any).user?.sub;
    if (!await assertOwnsAccount(accountId, userId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { Encryption }        = await import('../../../security/encryption.ts');
    const { CredentialManager } = await import('../../../security/credential-manager.ts');
    const { PersonaManager }    = await import('../../../persona/persona-manager.ts');
    const enc      = new Encryption(process.env.ENCRYPTION_KEY!);
    const creds    = new CredentialManager(enc);
    const personas = new PersonaManager(creds);
    const persona  = await personas.get(accountId);
    const llmConfig = persona.llmConfig;

    const userLanguage = 'Chinese';

    const { AgentTaskRunner } = await import('../../../services/agent-task-runner.ts');
    const runner = new AgentTaskRunner(llmConfig);

    // Step 1: Try to parse as a task command
    const task = await runner.parseCommand(accountId, message).catch(() => null);

    // Block write actions in demo mode
    const WRITE_ACTIONS = ['unsubscribe_all', 'forward_all', 'ignore_all', 'reply_to_all'];
    if (task?.isTask && WRITE_ACTIONS.includes(task.action) && isDemoMode()) {
      const demoMsg = '演示模式下无法修改邮件。';
      res.json({ reply: demoMsg, action: 'demo_blocked' });
      return;
    }

    if (task?.isTask) {
      // Search: execute immediately
      if (task.action === 'search') {
        const result = await runner.execute(accountId, task, 10, userLanguage);
        let reply: string;
        if (result.processed === 0) {
          reply = '没有找到符合条件的邮件，请换个关键词试试。';
        } else {
          reply = `找到 **${result.processed} 封邮件**：\n\n${result.details.slice(0, 8).join('\n')}`;
        }
        res.json({ reply, action: 'search', result });
        return;
      }

      // Destructive actions: show preview and ask for confirmation
      if (['unsubscribe_all', 'forward_all', 'ignore_all', 'reply_to_all'].includes(task.action)) {
        const { NLSearch } = await import('../../../services/nl-search.ts');
        const searcher = new NLSearch(llmConfig);
        const preview  = await searcher.search(accountId, task.query, 5);
        const count    = preview.length;
        const previewLines = preview.slice(0, 4).map(e =>
          `• ${e.sender_name || e.from_address} — ${e.subject?.slice(0, 50) ?? ''}`
        );
        const proceed = '要继续执行吗？';
        const found   = `找到 **${count} 封**符合条件的邮件：`;
        const reply   = `${task.explanation}\n\n${found}\n${previewLines.join('\n')}${count > 4 ? `\n…and more` : ''}\n\n${proceed}`;
        res.json({ reply, action: 'confirm', task, previewCount: count });
        return;
      }

      // Summarize: execute directly
      if (task.action === 'summarize') {
        const result = await runner.execute(accountId, task, 20, userLanguage);
        const fallback = '没有找到可以总结的邮件。';
        res.json({ reply: result.summary || fallback, action: 'summarize', result });
        return;
      }
    }

    // Fallback: general LLM conversation with email context
    const { LLMRouter } = await import('../../../llm/router.ts');
    const llm = new LLMRouter(llmConfig);

    // Get recent email context (last 5 emails)
    const { rows: recentEmails } = await getPool().query(
      `SELECT from_address, sender_name, subject, summary, intent, priority
       FROM email_log WHERE account_id = $1
       ORDER BY processed_at DESC LIMIT 5`,
      [accountId]
    );

    const contextBlock = recentEmails.length
      ? `最近的邮件：\n${recentEmails.map(e =>
          `- From ${e.sender_name || e.from_address}: "${e.subject}" (${e.intent}, ${e.priority}): ${e.summary ?? ''}`
        ).join('\n')}`
      : '';

    const conversationHistory = history.slice(-6).map(m =>
      `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`
    ).join('\n');

    const prompt = `你是一名邮件助手。请用简体中文协助用户管理收件箱。
${contextBlock}
${conversationHistory ? `\n对话记录：\n${conversationHistory}` : ''}

User: ${message}

用自然、清晰的中文回答。用户问及邮件时，请参考上面的上下文。
用户想执行发信、转发、退订或搜索时，可以告诉他们如何用自然语言发出指令。不要声称已执行尚未执行的操作。
回答保持简短，通常两到四句话。`;

    let reply = (await llm.complete(prompt, { maxTokens: 300, temperature: 0.7, responseFormat: 'text' })).trim();
    // Strip JSON wrapper if LLM returns {"response":"..."} or {"reply":"..."}
    try {
      const parsed = JSON.parse(reply);
      if (typeof parsed === 'object' && parsed !== null) {
        reply = parsed.reply ?? parsed.response ?? parsed.message ?? parsed.text ?? reply;
      }
    } catch { /* not JSON, use as-is */ }
    res.json({ reply, action: 'chat' });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('POST /chat error', { msg, stack: err instanceof Error ? err.stack : undefined });
    res.status(500).json({ error: 'Chat failed' });
  }
});

// Execute a confirmed task
router.post('/chat/execute', rateLimitMiddleware('llm_requests'), async (req, res) => {
  const { accountId, task } = req.body as { accountId?: string; task?: any };
  if (!accountId || !task) {
    res.status(400).json({ error: 'accountId and task are required' }); return;
  }
  try {
    const userId = (req as any).user?.sub;
    if (!await assertOwnsAccount(accountId, userId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { Encryption }        = await import('../../../security/encryption.ts');
    const { CredentialManager } = await import('../../../security/credential-manager.ts');
    const { PersonaManager }    = await import('../../../persona/persona-manager.ts');
    const enc      = new Encryption(process.env.ENCRYPTION_KEY!);
    const creds    = new CredentialManager(enc);
    const personas = new PersonaManager(creds);
    const persona  = await personas.get(accountId);

    const { AgentTaskRunner } = await import('../../../services/agent-task-runner.ts');
    const runner = new AgentTaskRunner(persona.llmConfig);
    const result = await runner.execute(accountId, task, 50, 'Chinese');

    const reply = [
      result.summary,
      result.details.length ? `\n${result.details.slice(0, 10).join('\n')}` : '',
    ].join('');

    res.json({ reply, result });
  } catch (err) {
    logger.error('POST /chat/execute error', { err });
    res.status(500).json({ error: 'Execution failed' });
  }
});

export default router;
