import { NextResponse } from 'next/server'
import { z } from 'zod'
import { violationInspector } from '@homeowner-portal/workflows/W3'
import { RequestedActionSchema, StatuteRuleRefusalError } from '@homeowner-portal/workflows/W3-state-rules'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'

// POST /api/ai/violations/draft
//
// Wraps W3 (Violation Inspector). Caller submits unit_id +
// violation_type + description + optional reporter_notes; receives the
// drafted notice + citations + recommended severity/fine/cure-period.
//
// W3 itself persists to ai_runs with status='pending_human_approval'.
// This endpoint just returns the output + runId; the wizard / board
// approval queue UI consumes that.

const DraftSchema = z.object({
  unitId: z.string().uuid(),
  violationType: z.string().min(2).max(120),
  description: z.string().min(10).max(4000),
  reporterNotes: z.string().max(2000).nullable().optional(),
  associationId: z.string().uuid().nullable().optional(),
  requestedAction: RequestedActionSchema.optional(),
})

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  // Board/admin only (R-01). Residents are org members, so the bare org
  // check let any resident spend AI budget drafting violation notices
  // (and persist ai_runs rows) against their own association.
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) {
    return NextResponse.json({ error: 'forbidden', message: gate.error }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = DraftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const result = await violationInspector.execute(parsed.data, {
      organizationId: gate.orgId,
    })
    return NextResponse.json({
      runId: result.runId,
      ...result.output,
    })
  } catch (err) {
    // BL-019: a step the association's state law forbids (e.g. a Florida
    // fine without a committee hearing). Not an outage — tell the board why.
    const refusal = refusalOf(err)
    if (refusal) {
      return NextResponse.json(
        {
          error: 'statute_refusal',
          jurisdiction: refusal.jurisdiction,
          reasons: refusal.reasons,
        },
        { status: 422 },
      )
    }
    console.error('[w3-draft] workflow failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message: err instanceof Error ? err.message : 'unknown',
      },
      { status: 503 },
    )
  }
}

/** defineWorkflow wraps run() errors; the original is kept as `cause`. */
function refusalOf(err: unknown): StatuteRuleRefusalError | null {
  if (err instanceof StatuteRuleRefusalError) return err
  if (err instanceof Error && err.cause instanceof StatuteRuleRefusalError) return err.cause
  return null
}
