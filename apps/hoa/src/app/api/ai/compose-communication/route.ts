import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runMain } from '@homeowner-portal/ai'
import { proposeCommunication } from '@homeowner-portal/workflows/W31-propose'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { requireAiQuota } from '@/lib/api/rate-limit'
import { BUILT_IN_TEMPLATES } from '@/lib/communications/built-in-templates'

// POST /api/ai/compose-communication  (BL-102 A2)
// The "What do you want to tell residents?" box on /communications/new.
// Runs W31's proposal step over what the board typed and returns a draft:
// subject, plain-text body, audience kind, urgency, category, a matching
// built-in template, a send time and the facts it could not fill.
//
// Nothing is stored or sent here, and no recipient is picked: the audience
// is a kind from a closed list, which the wizard resolves and counts like
// any other pick. The board reviews every field and sends from the wizard,
// where the outbound guard, preferences and scheduling rules apply as usual.
//
// Input  : { message: string, localNow: "YYYY-MM-DDTHH:mm" }
// Output : { proposal: CommProposal }
// Errors : RC-1 envelope — 401, 403 (board-only), 400 invalid_json /
//          validation_failed, 413, 429 rate_limited, 503 upstream_unavailable.
//
// The board's words are never logged (they can name residents).

const Schema = z.object({
  message: zText(1000, 3),
  localNow: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'localNow must be YYYY-MM-DDTHH:mm'),
})

const TEMPLATE_OPTIONS = BUILT_IN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description }))

export const POST = withRoute('ai.compose_communication', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, Schema)
  await requireAiQuota('compose', orgId)

  let result: Awaited<ReturnType<typeof proposeCommunication>>
  try {
    result = await proposeCommunication(body, TEMPLATE_OPTIONS, (messages) =>
      runMain(messages, { temperature: 0.3, max_tokens: 1500 }),
    )
  } catch (err) {
    logRouteFailure('ai.compose_communication.model', err, { orgId })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The AI drafting service is not reachable right now. Write the message yourself below, or try again shortly.',
    )
  }

  if (!result.ok) {
    logRouteFailure('ai.compose_communication.unusable_reply', null, { orgId })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The AI returned a draft we could not use. Try again, or write the message yourself below.',
      { reason: result.reason },
    )
  }

  return NextResponse.json({ proposal: result.proposal })
})
