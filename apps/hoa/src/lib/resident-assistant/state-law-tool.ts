// The resident assistant's state-law tool.
//
// The resident assistant must never answer a state-law question from the
// model's memory. This tool is the only way it gets state law: the W30
// State Law Brain, grounded in state_statutes. When the resident's state has
// no statute text on file (FL / CA / TX before their first refresh), the
// tool says so in a fixed shape, and agent.ts replaces whatever the model
// wrote with the plain "not loaded yet" message.
//
// All reads run on the resident's own RLS-bound client: their association
// rows, and the public statute count.

import { askStateLaw, isStateLoaded, stateNotLoadedMessage, STATE_LAW_NAMES } from '@homeowner-portal/workflows/W30'
import { redactContactPII } from '@homeowner-portal/ai/pii'
import { ToolFailure } from '@/lib/community-qa/tools'
import type { LoopTool } from '@/lib/community-qa/loop'
import type { ResidentScope } from './reads'

type LawState = keyof typeof STATE_LAW_NAMES
const LAW_STATES = Object.keys(STATE_LAW_NAMES) as LawState[]

export const STATE_LAW_TOOL_NAME = 'state_law'

export type StateLawToolResult =
  | {
      available: true
      state: LawState
      answer: string
      confidence: 'HIGH' | 'MEDIUM' | 'LOW'
      citations: Array<{ codeCitation: string; title: string }>
      disclaimer: string
    }
  | { available: false; reason: 'state_not_loaded'; state: LawState; message: string }
  | { available: false; reason: 'state_not_covered' | 'state_ambiguous' }

export function isStateNotLoaded(v: unknown): v is Extract<StateLawToolResult, { reason: 'state_not_loaded' }> {
  return !!v && typeof v === 'object' && (v as { reason?: unknown }).reason === 'state_not_loaded'
}

interface Ctx {
  scope: ResidentScope
  associationId: string | null
}

/** The law that governs the resident's home(s): governing_law_state, else
 *  state, as everywhere else (F spec §4). One state or none. */
async function residentLawState({ scope, associationId }: Ctx): Promise<LawState | 'ambiguous' | null> {
  const ids = associationId
    ? [associationId]
    : [...new Set(scope.units.map((u) => u.association_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return null
  const { data, error } = await scope.db
    .from('associations')
    .select('id, state, governing_law_state')
    .eq('organization_id', scope.orgId)
    .in('id', ids)
  if (error) throw new ToolFailure('lookup_failed', error)
  const states = new Set(
    ((data ?? []) as Array<{ id: string; state: string | null; governing_law_state: string | null }>)
      .filter((a) => ids.includes(a.id))
      .map((a) => (a.governing_law_state ?? a.state ?? '').trim().toUpperCase())
      .filter(Boolean),
  )
  if (states.size > 1) return 'ambiguous'
  const [only] = [...states]
  return only && (LAW_STATES as string[]).includes(only) ? (only as LawState) : null
}

async function liveStatutes(scope: ResidentScope, state: LawState): Promise<number> {
  const { count, error } = await scope.db
    .from('state_statutes')
    .select('id', { count: 'exact', head: true })
    .eq('state', state)
    .is('superseded_at', null)
  if (error || count === null) throw new ToolFailure('lookup_failed', error ?? undefined)
  return count
}

export const stateLawTool: LoopTool<Ctx> = {
  def: {
    name: STATE_LAW_TOOL_NAME,
    description:
      "Answers a question about the state's HOA law (statutes) from the official statute text, with citations: e.g. how much notice a fine hearing needs under state law, owners' rights to inspect records, limits on fines, foreclosure, flags or solar panels. Use this for ANY question about what the law says — never answer state law from memory. If it returns available:false with reason state_not_loaded, the state's law is not in the portal yet.",
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The legal question only, with no names, addresses or contact details.',
        },
      },
      required: ['question'],
    },
  },
  async execute(args, ctx): Promise<StateLawToolResult> {
    // W30 records its question in ai_runs: a legal topic, not a person.
    const question = redactContactPII(String(args.question ?? '')).trim().slice(0, 500)
    if (question.length < 3) throw new ToolFailure('invalid_args')

    const state = await residentLawState(ctx)
    if (state === 'ambiguous') return { available: false, reason: 'state_ambiguous' }
    if (!state) return { available: false, reason: 'state_not_covered' }

    // Checked before any model call: with no statute text, there is nothing
    // to ground an answer in.
    if (!isStateLoaded(await liveStatutes(ctx.scope, state))) {
      return { available: false, reason: 'state_not_loaded', state, message: stateNotLoadedMessage(state) }
    }

    const out = await askStateLaw(question, state, { organizationId: ctx.scope.orgId })
    if (out.stateLoaded === false) {
      return { available: false, reason: 'state_not_loaded', state, message: stateNotLoadedMessage(state) }
    }
    return {
      available: true,
      state,
      answer: out.answer,
      confidence: out.confidence,
      citations: out.citations.map((c) => ({ codeCitation: c.codeCitation, title: c.title })),
      disclaimer: out.disclaimer,
    }
  },
}
