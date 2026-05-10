import { NextResponse } from 'next/server'
import { z } from 'zod'
import { queryGoverningDocs } from '@homeowner-portal/workflows/W1'
import { getCurrentOrg } from '@/lib/orgs'

// W1 — Governing Docs Brain endpoint.
// POST { question: string, associationId?: string }
// → { answer, confidence, citations, runId } | { error }
//
// The runId points at the ai_runs row that captured the call. Future:
// the customer-facing audit log links to it.

const AskDocsSchema = z.object({
  question: z.string().min(3).max(2000),
  associationId: z.string().uuid().nullable().optional(),
})

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

  const parsed = AskDocsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const result = await queryGoverningDocs(parsed.data.question, {
      organizationId: org.id,
      associationId: parsed.data.associationId ?? null,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[ask-docs] workflow failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'The AI service is not reachable right now.',
      },
      { status: 503 },
    )
  }
}
