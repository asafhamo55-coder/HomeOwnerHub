import { NextResponse } from 'next/server'
import { z } from 'zod'
import { askCommunity, type AgentResult } from '@/lib/community-qa/agent'
import { ContactVault, fillContactPlaceholders } from '@/lib/community-qa/contact-placeholders'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// POST /api/ai/ask-community
// Body: { question: string, associationId?: uuid | null }
// → 200 { answer, toolCalls, steps, citations?, confidence?, runId? }
//   toolCalls[] is the agent's public data-sources log: { name, args, result }
//   with camelCase results, money in *Cents, failures as { failed, code }
//   and no owner email / phone (lib/community-qa/agent.ts toPublicCall).
//   The model never sees owner email / phone either (BL-062): it answers
//   with tokens like [OWNER_EMAIL_1], filled in here, server-side, from the
//   agent's per-request vault, only for a caller who may see owner contact.
// → non-2xx: the RC-1 envelope { error: { code, message, … } }
//
// Board + admin only (RC-4): every in-app caller (the dashboard Ask page
// and the Copilot) lives under app/(dashboard), and the agent's tools
// read owner names, owner contact and dues balances. A resident gets 403.

const MAX_QUESTION = 2000

const AskSchema = z.object({
  question: zText(MAX_QUESTION, 3),
  /** Optional — narrows search_governing_docs lookups to one
   *  association when the org has multiple. */
  associationId: zUuid.nullable().optional(),
})

export const POST = withRoute('ai.ask-community', async (request) => {
  const { orgId, role } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, AskSchema)
  const associationId = body.associationId ?? null
  if (associationId) await requireOrgOwned('associations', associationId, orgId)

  if (!process.env.AI_API_KEY) {
    throw new ApiRouteError('not_configured', 'The assistant is not set up yet.')
  }

  // Board and admin both see owner contact on the property page and under
  // hoa_properties_select; the gate above admits only them.
  const canSeeOwnerContact = role === 'board' || role === 'admin'

  const db = await getSupabaseServerClient()
  let result: AgentResult
  try {
    result = await askCommunity(body.question, {
      db,
      orgId,
      associationId,
      canSeeOwnerContact,
    })
  } catch (err) {
    logRouteFailure('ai.ask-community', err, { orgId, stage: 'agent' })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The assistant is not reachable right now. Try again in a minute.',
    )
  }

  // Fields named one by one so nothing the agent grows later rides along.
  return NextResponse.json({
    answer: fillContactPlaceholders(
      result.answer,
      canSeeOwnerContact ? (result.contactVault ?? new ContactVault()) : null,
    ),
    toolCalls: result.toolCalls,
    steps: result.steps,
    ...(result.citations ? { citations: result.citations } : {}),
    ...(result.confidence ? { confidence: result.confidence } : {}),
    ...(result.runId ? { runId: result.runId } : {}),
    ...(result.statuteCitations ? { statuteCitations: result.statuteCitations } : {}),
  })
})
