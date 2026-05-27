import { NextResponse } from 'next/server'
import { z } from 'zod'
import { askCommunity } from '@/lib/community-qa/agent'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// POST /api/ai/ask-community
// Body: { question: string }
// → { answer, toolCalls, steps } | { error }
//
// Board + admin only. Residents redirect to /resident in the layout
// guards; this endpoint is the API analogue — 403 if the caller is a
// resident or not a member of any org.

const AskSchema = z.object({
  question: z.string().min(3).max(2000),
  /** Optional — narrows search_governing_docs lookups to one
   *  association when the org has multiple. */
  associationId: z.string().uuid().nullable().optional(),
})

export async function POST(request: Request): Promise<Response> {
  // Role + org context. getCurrentUserRole bundles both and resolves
  // the user's "current" org via the same logic the dashboard uses.
  const ctx = await getCurrentUserRole()
  if (!ctx) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (ctx.role !== 'admin' && ctx.role !== 'board') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = AskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const db = await getSupabaseServerClient()
  try {
    const result = await askCommunity(parsed.data.question, {
      db,
      orgId: ctx.org.id,
      associationId: parsed.data.associationId ?? null,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[ask-community] agent failed', err)
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
