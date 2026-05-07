export type TaskType =
  | 'classify_violation'
  | 'draft_violation_letter'
  | 'parse_document'
  | 'meeting_summary'
  | 'daily_digest'
  | 'compliance_check'
  | 'draft_eviction_notice'
  | 'photo_analysis'
  | 'classify_intent'

export type AgentId = 'fast' | 'main' | 'reason' | 'vision' | 'cpu' | 'cloud'

// Static routing — picking the right model is cheap and avoids LLM-in-the-loop overhead.
export const TASK_ROUTING: Record<TaskType, AgentId> = {
  classify_violation: 'reason',
  draft_violation_letter: 'main',
  parse_document: 'reason',
  meeting_summary: 'main',
  daily_digest: 'cloud',
  compliance_check: 'reason',
  draft_eviction_notice: 'main',
  photo_analysis: 'vision',
  classify_intent: 'fast',
}

export function agentFor(task: TaskType): AgentId {
  return TASK_ROUTING[task]
}
