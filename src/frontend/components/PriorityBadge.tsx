// Modified for Simplified Chinese localization with OpenAI GPT.
import { h } from 'preact';

const LABELS: Record<string, string> = {
  critical: '紧急',
  high:     '高',
  medium:   '中',
  low:      '低',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span class={`priority-badge ${priority}`}>
      {LABELS[priority] ?? priority}
    </span>
  );
}
