// BL-106 cost bounds for one board Copilot question (pricing decision,
// "Amendment — BL-106"). No runtime imports, so lib/api/ai-limits.test.ts
// can check its per-call cost estimate against these numbers.
import type { ToolBudget } from './loop'

/**
 * The default budget (8 calls per step, 16 per run; agent.test.ts pins
 * that it matches DEFAULT_TOOL_BUDGET), plus at most 6 docs searches per
 * question: each one is a W1 model call of its own.
 */
export const COPILOT_TOOL_BUDGET: ToolBudget = {
  perStep: 8,
  perRun: 16,
  perTool: { search_governing_docs: 6 },
}

/** Output tokens per model step (sent as max_tokens). */
export const COPILOT_MAX_TOKENS_PER_STEP = 1000
