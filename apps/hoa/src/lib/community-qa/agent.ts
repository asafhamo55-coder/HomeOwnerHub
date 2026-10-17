// Community Q&A agent — tool-using LLM loop.
//
// Talks to the Groq OpenAI-compatible /chat/completions endpoint via
// plain fetch (no SDK dep). The LLM is given the tool definitions from
// tools.ts and decides which to call. Each tool result is fed back as
// a `tool` role message until the LLM returns a final assistant
// message with no further tool_calls.
//
// Why no openai SDK: it lives in packages/workflows but not apps/hoa.
// Adding it would be one more dep on an already-large package. The
// REST surface we use is ~50 lines of straightforward JSON.
//
// Loop bound: MAX_STEPS prevents an infinite tool-call cycle when the
// model gets stuck. 8 is plenty for the realistic question depth.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { resolveModel } from '@homeowner-portal/ai'
import { logRouteFailure } from '@/lib/api/log'
import { ContactVault } from './contact-placeholders'
import {
  TOOLS,
  TOOL_BY_NAME,
  ToolFailure,
  isToolFailed,
  toolFailed,
  type DocsCitation,
  type DocsToolResult,
  type Tool,
} from './tools'

type Db = SupabaseClient<Database>

const MAX_STEPS = 8

const SYSTEM_PROMPT = `You are a community-data assistant for an HOA management platform.

Two kinds of questions, two kinds of tools:

1. RULES / POLICIES ("Can I do X?", "What's the limit on Y?", "Process for Z?") → use search_governing_docs. The answer must come from the community's CC&Rs / bylaws / rules — don't infer from numbers.

2. DATA ("How many", "Who is", "List", "When was") → use the typed DB tools (count_units_by_tenure, list_overdue_dues, get_unit_owner, count_open_violations, list_recent_meetings, count_properties). They return live database state.

Some questions need BOTH — e.g. "How many violations do we have and what's the fine schedule?" → call count_open_violations AND search_governing_docs, then synthesize.

Style:
- Be concise — 1–3 sentences for simple questions, a short bulleted list when listing rows.
- Money fields end in "Cents" and are integer cents: divide by 100 for dollars. Show $ amounts as "$1,234" (no decimals unless smaller than $10).
- Show dates as "Jan 15, 2026".
- If a tool returns 0 results or LOW confidence, say so directly — don't make up data.
- If a tool result is {"failed": true, ...}, that lookup is unavailable right now: say so in one short sentence and don't guess its answer.
- When search_governing_docs returns citations, paraphrase the rule and quote the section briefly. The UI shows the full citation separately.
- Owner email and phone appear in tool results only as placeholder tokens such as [OWNER_EMAIL_1] or [OWNER_PHONE_1]. When the user asks how to reach an owner, copy the token exactly as given; the portal replaces it with the real value. Never invent a token, and never guess or make up contact details. If contactOnFile is false, say no contact is on file.

Next steps:
- After answering a rules/policy question that implies the reader wants to DO something, add a short "Recommended next step:" line pointing to the real action available in this portal:
  - Exterior/architectural changes (paint, fence, deck, roof, landscaping, addition, solar, etc.) — even when the docs allow it, most changes still need prior approval, so recommend submitting an ARC (architectural review) application.
  - A rule violation, nuisance, or community problem the reader observed — recommend reporting the concern to the board.
  - A dues/billing question, a maintenance need, or anything requiring a board reply — recommend opening a support ticket.
- Only suggest a next step that genuinely fits the question. Don't invent actions the portal doesn't offer — there is no online dues payment, no event RSVP, and no separate appeal form. For a purely informational question with no implied action, skip the next-step line.

Never:
- Invent data not present in tool results.
- Reference data from other organizations or communities.
- Speculate about reasons for trends — stick to the facts.
- Pretend a rule exists when search_governing_docs returns LOW confidence with no relevant citations; say "I don't see that in your governing docs" instead.`

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

/** One entry of the response's data-sources log: a public, camelCase view. */
export interface PublicToolCall {
  name: string
  args: Record<string, string | number | boolean>
  result: unknown
}

export interface AgentResult {
  answer: string
  /** Built for the HTTP response, not the raw tool log: an unknown tool is
   *  named `unknown`, args are only the tool's declared ones, and each
   *  result goes through the tool's `toPublic`. */
  toolCalls: PublicToolCall[]
  steps: number
  /** Aggregated citations from any search_governing_docs tool calls.
   *  Empty when the agent only used DB tools. */
  citations?: DocsCitation[]
  /** Highest-confidence docs lookup made during this answer.
   *  Undefined when no docs tool was used. W1 uses uppercase. */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Run id from the most recent docs lookup, when applicable. The
   *  audit log links to ai_runs.id for traceability. */
  runId?: string
  /** Real owner contact behind the tokens in `answer` (BL-062). Server-side
   *  only: the route fills the answer from it for a caller who may see
   *  contact, and never puts the vault itself in the response. */
  contactVault: ContactVault
}

export async function askCommunity(
  question: string,
  ctx: { db: Db; orgId: string; associationId?: string | null; canSeeOwnerContact: boolean },
): Promise<AgentResult> {
  const apiKey = process.env.AI_API_KEY
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model = resolveModel()
  if (!apiKey) {
    throw new Error('AI_API_KEY not set on the server.')
  }

  const tools = TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.def.name,
      description: t.def.description,
      parameters: t.def.parameters,
    },
  }))

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ]

  // One vault per question: tokens are numbered within this answer only.
  const contactVault = new ContactVault()
  const toolCtx = { ...ctx, contactVault }

  const toolCallLog: RawToolCall[] = []
  const finish = (answer: string, steps: number): AgentResult => ({
    answer,
    toolCalls: toolCallLog.map(toPublicCall),
    steps,
    ...extractDocsArtifacts(toolCallLog),
    contactVault,
  })

  for (let step = 1; step <= MAX_STEPS; step++) {
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
        tool_choice: 'auto',
        temperature: 0.1,
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
      return finish(msg.content?.trim() || '(no answer)', step)
    }

    // Execute each requested tool, append a `tool` message per call.
    for (const tc of msg.tool_calls) {
      const tool = TOOL_BY_NAME[tc.function.name]
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
          result = await tool.execute(parsedArgs, toolCtx)
        } catch (err) {
          // Only the fixed code goes back to the model (and so into its
          // answer) and to the response. The log keeps ids and codes.
          const code = err instanceof ToolFailure ? err.code : 'lookup_failed'
          logRouteFailure('ai.ask-community.tool', err, {
            orgId: ctx.orgId,
            tool: tool.def.name,
            toolCode: code,
            dbCode: err instanceof ToolFailure ? (err.dbCode ?? null) : null,
          })
          result = toolFailed(code)
        }
      }

      toolCallLog.push({ tool, args: parsedArgs, result })

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      })
    }
  }

  // Loop bound exhausted — model couldn't resolve. Return what we have.
  return finish(
    "I couldn't finish answering that within the step budget. Try a more specific question, or break it into smaller pieces.",
    MAX_STEPS,
  )
}

interface RawToolCall {
  /** Undefined when the model named a tool that does not exist. */
  tool: Tool | undefined
  args: Record<string, unknown>
  result: unknown
}

const MAX_ARG_TEXT = 200

/** Declared args only, primitives only, strings bounded: the model writes these. */
function publicArgs(tool: Tool, args: Record<string, unknown>): PublicToolCall['args'] {
  const out: PublicToolCall['args'] = {}
  for (const key of Object.keys(tool.def.parameters.properties)) {
    const v = args[key]
    if (typeof v === 'string') out[key] = v.slice(0, MAX_ARG_TEXT)
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    else if (typeof v === 'boolean') out[key] = v
  }
  return out
}

function toPublicCall(c: RawToolCall): PublicToolCall {
  if (!c.tool) return { name: 'unknown', args: {}, result: c.result }
  const result = isToolFailed(c.result) || !c.tool.toPublic ? c.result : c.tool.toPublic(c.result)
  return { name: c.tool.def.name, args: publicArgs(c.tool, c.args), result }
}

/**
 * Pull citations + best confidence + runId out of search_governing_docs
 * tool results so the response carries them at the top level. The
 * existing Copilot / AskDocsClient render these without changes.
 *
 * Multiple docs lookups in one answer: citations concatenate, confidence
 * takes the highest level seen, runId comes from the latest call (UI
 * "view audit trail" link).
 */
function extractDocsArtifacts(
  log: RawToolCall[],
): Pick<AgentResult, 'citations' | 'confidence' | 'runId'> {
  const docsCalls = log.filter((c) => c.tool?.def.name === 'search_governing_docs')
  if (docsCalls.length === 0) return {}
  const citations: DocsCitation[] = []
  let bestConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | undefined
  let runId: string | undefined
  // Order: LOW < MEDIUM < HIGH. Pick the max across all docs calls so
  // the UI shows the strongest evidence we found.
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const
  for (const c of docsCalls) {
    if (!c.result || isToolFailed(c.result)) continue
    const ok = c.result as DocsToolResult
    citations.push(...ok.citations)
    if (!bestConfidence || rank[ok.confidence] > rank[bestConfidence]) {
      bestConfidence = ok.confidence
    }
    if (ok.runId) runId = ok.runId
  }
  return {
    citations,
    confidence: bestConfidence,
    runId,
  }
}
