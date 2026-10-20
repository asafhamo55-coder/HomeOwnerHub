// The tool-calling loop shared by the board Copilot (agent.ts) and the
// resident assistant (lib/resident-assistant/agent.ts).
//
// Talks to the Groq OpenAI-compatible /chat/completions endpoint via plain
// fetch. The model is given the tool definitions it may call; each tool
// result is fed back as a `tool` message until the model answers with no
// further tool_calls, or MAX_STEPS runs out.
//
// The loop knows nothing about which tools exist: the caller hands in the
// registry. That is what keeps the board's DB tools out of the resident
// assistant — it never sees them, so a model that names one gets
// `unknown_tool`.
//
// TOOL BUDGET (SEC-001). One counted request must not fan out into dozens
// of tool runs (each docs search is a W1 model call, an embedding and an
// ai_runs row, none of them metered by the route's quota). Per step only
// the first `perStep` calls run; per run at most `perRun` run in total;
// `perTool` caps single tools. A call over budget runs nothing and gets
// `toolFailed('budget')` back (every tool_call_id still needs a reply, or
// the provider rejects the next request). Once the run budget is spent the
// model is asked for its answer with tool_choice 'none'.

import { resolveModel } from '@homeowner-portal/ai'
import { logRouteFailure } from '@/lib/api/log'
import { ToolFailure, toolFailed, type ToolDefinition } from './tools'

export const MAX_STEPS = 8

export interface ToolBudget {
  /** Calls that run per model step; the rest of that step's calls get `budget`. */
  perStep: number
  /** Calls that run in the whole loop. */
  perRun: number
  /** Optional per-tool caps for the whole loop, by tool name. */
  perTool?: Readonly<Record<string, number>>
}

/**
 * The board Copilot's budget (the default). Its widest legitimate step asks
 * for every one of its 7 tools at once, so 8 per step and 16 per run keep
 * that working while still bounding a runaway loop (8 steps × N calls).
 */
export const DEFAULT_TOOL_BUDGET: ToolBudget = { perStep: 8, perRun: 16 }

/** A tool as the loop sees it, over any context type. */
export interface LoopTool<C> {
  def: ToolDefinition
  execute: (args: Record<string, unknown>, ctx: C) => Promise<unknown>
  toPublic?: (result: unknown) => unknown
}

/** One prior turn of a conversation. Only user and assistant text. */
export interface LoopTurn {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
  name?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface RawToolCall<C> {
  /** Undefined when the model named a tool that is not in the registry. */
  tool: LoopTool<C> | undefined
  args: Record<string, unknown>
  result: unknown
}

export interface LoopResult<C> {
  /** The model's final text; null when the step budget ran out. */
  answer: string | null
  steps: number
  /** The calls that ran (an unknown tool included). Over-budget calls are not here. */
  log: RawToolCall<C>[]
  /** Calls refused with `budget`, ran nothing. */
  refused: number
}

export async function runToolLoop<C>(opts: {
  systemPrompt: string
  turns: LoopTurn[]
  tools: readonly LoopTool<C>[]
  ctx: C
  /** Log tag for a tool failure, e.g. 'ai.ask-community.tool'. */
  logTag: string
  /** Ids only: they go into the failure log line. */
  logIds: Record<string, string | number | boolean | null>
  maxSteps?: number
  budget?: ToolBudget
  /**
   * Output token ceiling per model step (sent as max_tokens). Absent = no
   * ceiling (the provider's own). The board Copilot sets one (BL-106) so its
   * per-question cost has a real upper bound.
   */
  maxTokensPerStep?: number
}): Promise<LoopResult<C>> {
  const apiKey = process.env.AI_API_KEY
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model = resolveModel()
  if (!apiKey) {
    throw new Error('AI_API_KEY not set on the server.')
  }
  const maxSteps = opts.maxSteps ?? MAX_STEPS
  const budget = opts.budget ?? DEFAULT_TOOL_BUDGET
  let ran = 0
  let refused = 0
  const ranByTool = new Map<string, number>()

  const byName = new Map(opts.tools.map((t) => [t.def.name, t]))
  const tools = opts.tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.def.name,
      description: t.def.description,
      parameters: t.def.parameters,
    },
  }))

  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.turns.map((t) => ({ role: t.role, content: t.content })),
  ]

  const log: RawToolCall<C>[] = []

  for (let step = 1; step <= maxSteps; step++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: ran >= budget.perRun ? 'none' : 'auto',
        temperature: 0.1,
        ...(opts.maxTokensPerStep ? { max_tokens: opts.maxTokensPerStep } : {}),
      }),
    })

    if (!res.ok) {
      // Status only: the provider body can echo the key or the prompt.
      throw new Error(`LLM call failed: HTTP ${res.status}`)
    }

    const body = (await res.json()) as {
      choices: Array<{
        message: {
          role: 'assistant'
          content: string | null
          tool_calls?: ToolCall[]
        }
        finish_reason: string
      }>
    }

    const choice = body.choices?.[0]
    if (!choice) {
      throw new Error('LLM returned no choices.')
    }

    const msg = choice.message
    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls,
    })

    // No tool calls → final answer.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { answer: msg.content?.trim() || '(no answer)', steps: step, log, refused }
    }

    for (const [i, tc] of msg.tool_calls.entries()) {
      const tool = byName.get(tc.function.name)
      const toolCap = tool ? budget.perTool?.[tool.def.name] : undefined
      const toolRan = tool ? (ranByTool.get(tool.def.name) ?? 0) : 0
      if (i >= budget.perStep || ran >= budget.perRun || (toolCap !== undefined && toolRan >= toolCap)) {
        refused++
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(toolFailed('budget')),
        })
        continue
      }
      ran++
      if (tool) ranByTool.set(tool.def.name, toolRan + 1)

      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = tc.function.arguments
          ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
          : {}
      } catch {
        /* fall through with empty args; tool will surface the issue */
      }

      let result: unknown
      if (!tool) {
        result = toolFailed('unknown_tool')
      } else {
        try {
          result = await tool.execute(parsedArgs, opts.ctx)
        } catch (err) {
          // Only the fixed code goes back to the model (and so into its
          // answer) and to the response. The log keeps ids and codes.
          const code = err instanceof ToolFailure ? err.code : 'lookup_failed'
          logRouteFailure(opts.logTag, err, {
            ...opts.logIds,
            tool: tool.def.name,
            toolCode: code,
            dbCode: err instanceof ToolFailure ? (err.dbCode ?? null) : null,
          })
          result = toolFailed(code)
        }
      }

      log.push({ tool, args: parsedArgs, result })

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      })
    }
  }

  return { answer: null, steps: maxSteps, log, refused }
}

const MAX_ARG_TEXT = 200

/** Declared args only, primitives only, strings bounded: the model writes these. */
export function publicArgs(
  def: ToolDefinition,
  args: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(def.parameters.properties)) {
    const v = args[key]
    if (typeof v === 'string') out[key] = v.slice(0, MAX_ARG_TEXT)
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    else if (typeof v === 'boolean') out[key] = v
  }
  return out
}
