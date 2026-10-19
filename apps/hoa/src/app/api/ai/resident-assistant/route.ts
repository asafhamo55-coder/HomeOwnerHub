import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { requireAiQuota } from '@/lib/api/rate-limit'
import { askResident, MAX_TURNS, type ResidentAnswer } from '@/lib/resident-assistant/agent'
import { resolveResidentAssistant } from '@/lib/resident-assistant/server'

// POST /api/ai/resident-assistant (BL-096) — the resident Ask tab's chat.
// Body: { messages: [{ role: 'user' | 'assistant', content }] }, oldest
//       first, ending with the resident's new message. The conversation
//       lives in the browser (sessionStorage); this route keeps nothing.
// → 200 { answer, citations, confidence?, handoffs, docsUnanswered }
//   handoffs[]: { action: 'ask_board' | 'start_arc', subject, description }
//   — the chat shows each as a button opening a prefilled form. The AI
//   never creates or changes a row.
// → non-2xx: the RC-1 envelope.
//
// Resident only (the effective role, as the resident layout), never while
// an admin impersonates (the tools must run on the resident's own RLS
// client), and only while the board's "Resident assistant" switch is on.
// Rate limited per BL-078 (bucket resident_assistant: 20/hour and 100/day
// per person, a daily cap per community). Logs carry ids and codes only.

const Turn = z.object({
  role: z.enum(['user', 'assistant']),
  content: zText(4000, 1),
})

const Body = z.object({
  messages: z
    .array(Turn)
    .min(1)
    .max(MAX_TURNS * 4)
    .refine((m) => m[m.length - 1]?.role === 'user', { message: 'The last message must be the resident’s.' })
    .refine((m) => (m[m.length - 1]?.content.length ?? 0) >= 2, { message: 'Ask a question.' }),
})

const OFF_MESSAGE = 'The resident assistant isn’t available for your account. Use Ask the Docs instead.'

export const POST = withRoute('ai.resident-assistant', async (request) => {
  const { orgId } = await requireRouteMember()
  const body = await parseJson(request, Body)

  const gate = await resolveResidentAssistant()
  if (!gate.on) {
    if (gate.reason === 'not_configured') {
      throw new ApiRouteError('not_configured', 'The assistant is not set up yet.')
    }
    throw new ApiRouteError('forbidden', OFF_MESSAGE, { reason: gate.reason })
  }
  if (gate.scope.orgId !== orgId) throw new ApiRouteError('forbidden', OFF_MESSAGE)

  await requireAiQuota('resident_assistant', orgId)

  let result: ResidentAnswer
  try {
    result = await askResident(body.messages, {
      scope: gate.scope,
      associationId: gate.associationIds.length === 1 ? gate.associationIds[0]! : null,
    })
  } catch (err) {
    logRouteFailure('ai.resident-assistant', err, { orgId, stage: 'agent' })
    throw new ApiRouteError('upstream_unavailable', 'The assistant is not reachable right now. Try again in a minute.')
  }

  // Fields named one by one so nothing the agent grows later rides along.
  return NextResponse.json({
    answer: result.answer,
    citations: result.citations.map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      docType: c.docType,
      section: c.section,
    })),
    ...(result.confidence ? { confidence: result.confidence } : {}),
    handoffs: result.handoffs.map((h) => ({ action: h.action, subject: h.subject, description: h.description })),
    docsUnanswered: result.docsUnanswered,
  })
})
