import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseCCRDocument } from '@homeowner-portal/ai'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  documentId: z.string().uuid(),
  rawText: z.string().min(200, 'Need at least ~200 characters of text to extract sections.'),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const supabase = await getSupabaseServerClient()
  // Just confirm the user can see this document under RLS — the actual data
  // we use is the rawText they sent up. (Document upload already saved the
  // text to parsed_text, but we re-parse on demand so users can iterate.)
  const { data: doc } = await supabase
    .from('hoa_documents')
    .select('id')
    .eq('id', parsed.data.documentId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let result
  try {
    result = await parseCCRDocument({ rawText: parsed.data.rawText })
  } catch (err) {
    console.error('[parse-document] AI failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          'The AI service is not reachable right now. The document text is still saved — try extraction again later.',
      },
      { status: 503 },
    )
  }

  // Persist the latest parse run alongside the raw text. We don't currently
  // store the parsed sections as structured data; they're surfaced for the
  // user inline. A future iteration can add a hoa_document_sections table
  // for the Covenant Brain to query directly.
  await supabase
    .from('hoa_documents')
    .update({
      parsed_text: parsed.data.rawText,
      parsed_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.documentId)

  return NextResponse.json(result)
}
