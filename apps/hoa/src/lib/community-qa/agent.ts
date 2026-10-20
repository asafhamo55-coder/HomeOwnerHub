// Community Q&A agent — the board Copilot's tool-using LLM loop.
//
// The loop itself (plain fetch to the OpenAI-compatible /chat/completions,
// tool results fed back until a final answer, MAX_STEPS bound) lives in
// loop.ts and is shared with the resident assistant. This file supplies
// the board's prompt and toolset (tools.ts) and shapes the result.
//
// Why no openai SDK: it lives in packages/workflows but not apps/hoa.
// Adding it would be one more dep on an already-large package. The
// REST surface we use is ~50 lines of straightforward JSON.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { ContactVault } from './contact-placeholders'
import { publicArgs, runToolLoop, type RawToolCall as LoopRawToolCall } from './loop'
import { COPILOT_MAX_TOKENS_PER_STEP, COPILOT_TOOL_BUDGET } from './copilot-budget'
import {
  TOOLS,
  COPILOT_STATE_LAW_CAP,
  STATE_LAW_TOOL_NAME,
  isBoardStateNotLoaded,
  type BoardStateLawResult,
  isToolFailed,
  type DocsCitation,
  type DocsToolResult,
  type ToolContext,
} from './tools'

type Db = SupabaseClient<Database>

const SYSTEM_PROMPT = `You are a community-data assistant for an HOA management platform.

Three kinds of questions, three kinds of tools:

1. RULES / POLICIES ("Can I do X?", "What's the limit on Y?", "Process for Z?") → use search_governing_docs. The answer must come from the community's CC&Rs / bylaws / rules — don't infer from numbers.

2. DATA ("How many", "Who is", "List", "When was") → use the typed DB tools (count_units_by_tenure, list_overdue_dues, get_unit_owner, count_open_violations, list_recent_meetings, count_properties). They return live database state.

3. STATE LAW ("What does Florida law say about…?", "Is that legal?", notice or fine limits under state law, records-inspection rights, liens and foreclosure, open meetings, elections, flags, solar) → use state_law. Answer state law ONLY from its result, and name the statute sections it cites. Never answer state law from general knowledge or memory, even when you think you know it. The governing docs are not state law: a docs answer does not tell you what the statute says.

Some questions need BOTH — e.g. "How many violations do we have and what's the fine schedule?" → call count_open_violations AND search_governing_docs, then synthesize.

State law results:
- If state_law returns available:false with reason "state_not_loaded", say plainly that the state's law isn't loaded in the portal yet and you can't answer it. Do not answer from memory.
- If it returns reason "state_not_covered" or "state_ambiguous", say the portal can't tell which state's law applies (or doesn't cover it) and don't answer from memory.
- If state_law returns {"failed": true, ...}, say state law couldn't be looked up right now. Never fill the gap with what you remember.
- State-law answers are informational, not legal advice; suggest the association's attorney for a decision.

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
- Pretend a rule exists when search_governing_docs returns LOW confidence with no relevant citations; say "I don't see that in your governing docs" instead.
- State what a state statute says unless state_law returned it in this conversation.`

/** Said instead of any state-law answer when every state_law lookup failed:
 *  the model must not fill the gap from memory. */
export const STATE_LAW_UNAVAILABLE_MESSAGE =
  "I couldn't look up state law right now, so I can't answer that part. Answers about state law come only from " +
  'the statute text, never from general knowledge. Try again in a minute.'

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
  /** Statute citations from any state_law lookups (W30). Absent when the
   *  state_law tool returned none. */
  statuteCitations?: Array<{ state: string; codeCitation: string; title: string }>
  /** Real owner contact behind the tokens in `answer` (BL-062). Server-side
   *  only: the route fills the answer from it for a caller who may see
   *  contact, and never puts the vault itself in the response. */
  contactVault: ContactVault
}

export async function askCommunity(
  question: string,
  ctx: { db: Db; orgId: string; associationId?: string | null; canSeeOwnerContact: boolean },
): Promise<AgentResult> {
  // One vault per question: tokens are numbered within this answer only.
  const contactVault = new ContactVault()
  const toolCtx = { ...ctx, contactVault }

  const { answer, steps, log } = await runToolLoop<ToolContext>({
    systemPrompt: SYSTEM_PROMPT,
    turns: [{ role: 'user', content: question }],
    tools: TOOLS,
    ctx: toolCtx,
    logTag: 'ai.ask-community.tool',
    logIds: { orgId: ctx.orgId },
    // state_law calls count against the run budget like every tool, and are
    // capped per question on top (each is a W30 model call + ai_runs row).
    budget: {
      ...COPILOT_TOOL_BUDGET,
      perTool: { ...COPILOT_TOOL_BUDGET.perTool, [STATE_LAW_TOOL_NAME]: COPILOT_STATE_LAW_CAP },
    },
    maxTokensPerStep: COPILOT_MAX_TOKENS_PER_STEP,
  })

  const law = extractStateLawArtifacts(log)

  return {
    // A state with no statute text, or a failed lookup: nothing the model
    // wrote about the law can be grounded, so the answer is the fixed
    // message, never model memory.
    answer:
      law.override ??
      answer ??
      "I couldn't finish answering that within the step budget. Try a more specific question, or break it into smaller pieces.",
    toolCalls: log.map(toPublicCall),
    steps,
    ...extractDocsArtifacts(log),
    ...(law.statuteCitations.length > 0 ? { statuteCitations: law.statuteCitations } : {}),
    contactVault,
  }
}

/**
 * The state_law post-check. `override` is the fixed text that replaces the
 * model's answer: the "<State> state law isn't loaded yet" message when any
 * lookup found the state empty, or STATE_LAW_UNAVAILABLE_MESSAGE when every
 * lookup failed and none answered. Otherwise the model's answer stands, and
 * the statute citations it was given are collected.
 */
export function extractStateLawArtifacts<C>(log: LoopRawToolCall<C>[]): {
  override: string | null
  statuteCitations: NonNullable<AgentResult['statuteCitations']>
} {
  const results = log.filter((c) => c.tool?.def.name === STATE_LAW_TOOL_NAME).map((c) => c.result)
  const statuteCitations: NonNullable<AgentResult['statuteCitations']> = []
  if (results.length === 0) return { override: null, statuteCitations }

  const notLoaded = results.find(isBoardStateNotLoaded)
  if (notLoaded) return { override: notLoaded.message, statuteCitations }

  let answered = false
  for (const r of results) {
    if (isToolFailed(r) || !r || typeof r !== 'object') continue
    const ok = r as BoardStateLawResult
    if (!ok.available) continue
    answered = true
    for (const c of ok.citations) statuteCitations.push({ state: ok.state, ...c })
  }
  if (!answered && results.some(isToolFailed)) return { override: STATE_LAW_UNAVAILABLE_MESSAGE, statuteCitations }
  return { override: null, statuteCitations }
}

type RawToolCall = LoopRawToolCall<ToolContext>

function toPublicCall(c: RawToolCall): PublicToolCall {
  if (!c.tool) return { name: 'unknown', args: {}, result: c.result }
  const result = isToolFailed(c.result) || !c.tool.toPublic ? c.result : c.tool.toPublic(c.result)
  return { name: c.tool.def.name, args: publicArgs(c.tool.def, c.args), result }
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
export function extractDocsArtifacts<C>(
  log: LoopRawToolCall<C>[],
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
