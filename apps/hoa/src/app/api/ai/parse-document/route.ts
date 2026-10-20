import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseCCRDocument } from '@homeowner-portal/ai'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { MAX_ARRAY_ITEMS, MAX_DOCUMENT_TEXT, MAX_LONG_TEXT, MAX_SHORT_TEXT } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { requireAiQuota } from '@/lib/api/rate-limit'

const TOO_LONG = `The document text is over the ${MAX_DOCUMENT_TEXT.toLocaleString('en-US')} character limit.`

// rawText is not trimmed: it is stored verbatim as parsed_text.
const Body = z.object({
  documentId: zUuid,
  rawText: z
    .string()
    .min(200, 'Need at least ~200 characters of text to extract sections.')
    .max(MAX_DOCUMENT_TEXT, TOO_LONG),
})

function modelText(max: number) {
  return z.union([z.string(), z.number()]).transform(String).pipe(zText(max)).catch('')
}

// What the model must hand back before we show it to anyone (RC-1: a reply
// we cannot use is 503 upstream_unavailable, not a half-rendered success).
const ModelReply = z.object({
  documentTitle: modelText(MAX_SHORT_TEXT),
  sections: z
    .array(
      // Lenient per field (a model may emit 4 for "4", or drop a summary);
      // only a missing or non-array `sections` makes the reply unusable.
      z.object({
        number: modelText(MAX_SHORT_TEXT),
        title: modelText(MAX_SHORT_TEXT),
        summary: modelText(MAX_LONG_TEXT),
      }),
    )
    .max(MAX_ARRAY_ITEMS * 10),
})

// Nothing is written when the model fails (the save runs only after a usable
// reply), so this does not claim the text was saved.
const AI_DOWN = 'The AI service is not reachable right now. Try extracting sections again in a moment.'

// A pasted document of MAX_DOCUMENT_TEXT characters can exceed the 1 MB JSON
// default once UTF-8 and JSON escaping are counted, so the byte cap is 4x the
// character cap. The character limit itself is enforced by the schema.
const MAX_BODY_BYTES = MAX_DOCUMENT_TEXT * 4

export const POST = withRoute('ai.parse-document', async (request) => {
  // Board-only (0063, RC-4): every caller lives under app/(dashboard).
  const { orgId } = await requireRouteBoardOrAdmin()

  let body: z.output<typeof Body>
  try {
    body = await parseJson(request, Body, { maxBytes: MAX_BODY_BYTES })
  } catch (err) {
    // RC-1: over the string limit is 413, not a 400, and carries the same
    // extra.maxBytes as the byte-cap 413 parseJson throws, so every 413 from
    // this route has one shape. maxChars is the additional, finer limit.
    if (
      err instanceof ApiRouteError &&
      err.code === 'validation_failed' &&
      err.extra?.issues?.some((i) => i.path === 'rawText' && i.message === TOO_LONG)
    ) {
      throw new ApiRouteError('payload_too_large', TOO_LONG, {
        maxBytes: MAX_BODY_BYTES,
        maxChars: MAX_DOCUMENT_TEXT,
      })
    }
    throw err
  }

  // The document must belong to the caller's org (RC-4), not just be visible under RLS.
  await requireOrgOwned('hoa_documents', body.documentId, orgId, { orgColumn: 'org_id' })
  // BL-104: the shared board AI ceiling (RC-13), before the model call.
  await requireAiQuota('board_ai', orgId)

  let raw: unknown
  try {
    raw = await parseCCRDocument({ rawText: body.rawText })
  } catch (err) {
    logRouteFailure('ai.parse-document.model', err, { orgId })
    throw new ApiRouteError('upstream_unavailable', AI_DOWN)
  }
  const reply = ModelReply.safeParse(raw)
  if (!reply.success) {
    logRouteFailure('ai.parse-document.reply', null, { orgId })
    throw new ApiRouteError('upstream_unavailable', AI_DOWN)
  }

  // Persist the latest parse run alongside the raw text. The parsed sections
  // are surfaced inline, not stored (a future hoa_document_sections table
  // could hold them for the Covenant Brain).
  const supabase = await getSupabaseServerClient()
  const { data: saved, error } = await supabase
    .from('hoa_documents')
    .update({ parsed_text: body.rawText, parsed_at: new Date().toISOString() })
    .eq('id', body.documentId)
    .eq('org_id', orgId)
    .select('id')
  checkWrite({ error }, 'ai.parse-document.update', { orgId })
  // RLS refusing an update returns no error and no rows: that is a failed save too (RC-6).
  if (!saved || saved.length === 0) {
    logRouteFailure('ai.parse-document.update', null, { orgId, count: 0 })
    throw new ApiRouteError('internal')
  }

  return NextResponse.json({ documentTitle: reply.data.documentTitle, sections: reply.data.sections })
})
