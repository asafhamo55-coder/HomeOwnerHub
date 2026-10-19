import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runMain } from '@homeowner-portal/ai'
import { translateCommunication } from '@homeowner-portal/workflows/W31-translate'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { MAX_LONG_TEXT } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'
import { requireAiQuota } from '@/lib/api/rate-limit'

// POST /api/ai/translate-communication  (BL-025)
// "Add Spanish version" in the new-communication wizard. Runs W31's
// translation step over the board's English subject + body and returns a
// Spanish draft. Nothing is stored or sent here: the board reviews and edits
// the draft in the wizard, and sendCommunication refuses a Spanish version
// the board has not viewed.
//
// Input  : { subject: string, bodyHtml: string }
// Output : { subject: string, bodyHtml: string }
// Errors : RC-1 envelope — 401, 403 (board-only), 400 invalid_json /
//          validation_failed, 413, 429 rate_limited, 503 upstream_unavailable.
//
// Board-only: the only caller is the wizard under app/(dashboard).

const Schema = z.object({
  subject: zText(255, 1),
  bodyHtml: zText(MAX_LONG_TEXT, 1),
})

export const POST = withRoute('ai.translate_communication', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, Schema)
  await requireAiQuota('translate', orgId)

  let result: Awaited<ReturnType<typeof translateCommunication>>
  try {
    result = await translateCommunication(body, (messages) =>
      runMain(messages, { temperature: 0.2, max_tokens: 3000 }),
    )
  } catch (err) {
    logRouteFailure('ai.translate_communication.model', err, { orgId })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The translation service is not reachable right now. Try again shortly.',
    )
  }

  if (!result.ok) {
    logRouteFailure('ai.translate_communication.unusable_reply', null, { orgId })
    throw new ApiRouteError(
      'upstream_unavailable',
      'The AI returned a translation we could not use. Try again.',
      { reason: result.reason },
    )
  }

  return NextResponse.json({
    subject: result.translation.subject,
    bodyHtml: result.translation.bodyHtml,
  })
})
