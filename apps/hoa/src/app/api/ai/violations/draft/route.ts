import { NextResponse } from 'next/server'
import { z } from 'zod'
import { violationInspector } from '@homeowner-portal/workflows/W3'
import { RequestedActionSchema, StatuteRuleRefusalError } from '@homeowner-portal/workflows/W3-state-rules'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'

// POST /api/ai/violations/draft
//
// Wraps W3 (Violation Inspector). Caller submits unitId + violationType +
// description + optional reporterNotes; receives the drafted notice +
// citations + recommended severity / fine (cents) / cure period.
//
// W3 persists to ai_runs with status='pending_human_approval' on the
// SERVICE-ROLE client and trusts its caller, so this route is the gate
// (RC-4, R-01): board/admin only, and every client-supplied id is proven to
// belong to the caller's org before W3 sees it (R-06, R-18).

// Bounds mirror W3's ViolationInspectorInputSchema so a request the route
// accepts is one the workflow accepts too.
const DraftSchema = z.object({
  unitId: zUuid,
  violationType: zText(120, 2),
  description: zText(4000, 10),
  reporterNotes: zText(2000).nullable().optional(),
  associationId: zUuid.nullable().optional(),
  requestedAction: RequestedActionSchema.optional(),
})

export const maxDuration = 60

export const POST = withRoute('ai.violations.draft', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, DraftSchema)
  await requireOrgOwned('units', body.unitId, orgId, { message: 'We could not find that unit.' })
  if (body.associationId) {
    await requireOrgOwned('associations', body.associationId, orgId, {
      message: 'We could not find that association.',
    })
  }

  try {
    const result = await violationInspector.execute(body, { organizationId: orgId })
    return NextResponse.json({ runId: result.runId, ...result.output })
  } catch (err) {
    // BL-019: a step the association's state law forbids (e.g. a Florida
    // fine without a committee hearing). Not an outage — tell the board why.
    // `reasons` is rule text from state-rules.ts, never DB or model text.
    const refusal = refusalOf(err)
    if (refusal) {
      throw new ApiRouteError('unprocessable', 'State law does not allow this step yet.', {
        reason: 'statute_refusal',
        jurisdiction: refusal.jurisdiction,
        reasons: refusal.reasons,
      })
    }
    if (isProviderFailure(err)) {
      logRouteFailure('ai.violations.draft', causeOf(err), { orgId, stage: 'provider' })
      throw new ApiRouteError('upstream_unavailable', 'The AI drafting service is not reachable right now. Try again shortly.')
    }
    // Anything else (ai_runs insert, an association lookup) is ours: withRoute
    // logs the code only, reports to Sentry and answers a generic 500.
    throw err
  }
})

/** defineWorkflow wraps run() errors; the original is kept as `cause`. */
function causeOf(err: unknown): unknown {
  return err instanceof Error && err.cause !== undefined ? err.cause : err
}

function refusalOf(err: unknown): StatuteRuleRefusalError | null {
  if (err instanceof StatuteRuleRefusalError) return err
  const cause = causeOf(err)
  return cause instanceof StatuteRuleRefusalError ? cause : null
}

/**
 * The OpenAI-compatible SDK's errors (APIError and its subclasses, including
 * connection / timeout errors) carry `status` and `headers` own properties.
 * apps/hoa does not depend on `openai` directly, so this is duck-typed.
 * W3 coerces an unusable model reply into defaults rather than throwing, so
 * an output-schema miss would be our bug and stays a 500.
 */
function isProviderFailure(err: unknown): boolean {
  const cause = causeOf(err)
  if (!(cause instanceof Error)) return false
  return 'status' in cause && 'headers' in cause
}
