import { NextResponse } from 'next/server'
import { z } from 'zod'
import { violationInspector } from '@homeowner-portal/workflows/W3'
import { getCurrentOrg } from '@/lib/orgs'

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
})

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
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
      organizationId: org.id,
    })
    return NextResponse.json({
      runId: result.runId,
      ...result.output,
    })
  } catch (err) {
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
