import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  chunkByMarkdownSection,
  chunkPlainText,
} from '@homeowner-portal/workflows/chunker'
import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseForm, parseValue } from '@/lib/api/parse'
import { zDateOnly, zText, zUuid } from '@/lib/api/schemas'
import { MAX_DOCUMENT_TEXT, MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { extractPdfText } from '@/lib/pdf/extract-text'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// POST /api/governing-docs/upload — board-only (RC-4).
//
// multipart/form-data:
//   - file: PDF / TXT / MD (required unless `pastedText` is provided)
//   - pastedText: raw text alternative for users who can't upload
//   - title: human-readable title (required, ≤ 200)
//   - type: 'declaration' | 'bylaws' | 'rules' | 'amendment' | 'policy'
//   - effectiveDate: YYYY-MM-DD (optional)
//   - associationId: uuid of an association in the caller's org (required)
//
// Pipeline (RC-3 order, every write checked, partial writes compensated):
//   1. Board gate → parse form → validate fields → association belongs to org
//   2. Extract text (PDF parse, plain text passthrough, or pasted) and chunk
//      it — everything that can refuse the request runs before any write
//   3. Upload the original file to Storage — a failure is a 500 and nothing
//      is written (RC-6: no success after a failed step)
//   4. Insert governing_documents (user client, RLS); on failure remove the
//      stored object
//   5. Insert governing_document_chunks (admin client: bulk insert into the
//      chunk table); on failure delete the doc row, then the stored object
//
// 201 { documentId, chunkCount, embeddedCount, embeddingStatus, parserVersion }

const TypeEnum = z.enum(['declaration', 'bylaws', 'rules', 'amendment', 'policy'])

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const Fields = z.object({
  title: zText(200, 1),
  type: TypeEnum,
  associationId: zUuid,
  effectiveDate: z.preprocess(emptyToUndefined, zDateOnly.optional()),
  pastedText: z.preprocess(emptyToUndefined, zText(MAX_DOCUMENT_TEXT).optional()),
})

const STORAGE_BUCKET = 'governing-docs'

const PDF_TYPES = new Set(['application/pdf'])
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown'])
/** Browsers often send no type (or a generic one) for .md; fall back to the extension then. */
const UNTYPED = new Set(['', 'application/octet-stream'])

function fileKind(file: File): 'pdf' | 'text' | null {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase().split(';')[0]!.trim()
  if (PDF_TYPES.has(type)) return 'pdf'
  if (TEXT_TYPES.has(type)) return 'text'
  if (UNTYPED.has(type)) {
    if (name.endsWith('.pdf')) return 'pdf'
    if (name.endsWith('.txt') || name.endsWith('.md')) return 'text'
  }
  return null
}

/** The document-text cap, in UTF-8 bytes (the unit the 413's `maxBytes` reports). */
function overTextLimit(text: string): boolean {
  return Buffer.byteLength(text, 'utf8') > MAX_DOCUMENT_TEXT
}

export const maxDuration = 60 // seconds — PDF parse + insert can run long

export const POST = withRoute('governing-docs.upload', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const form = await parseForm(request)

  // Over the document limit is a size problem (413), not a schema miss (RC-1).
  // Measured in UTF-8 bytes so `maxBytes` means what it says; bytes ≥ chars,
  // so this also runs before zText's character cap can turn it into a 400.
  const pasted = form.get('pastedText')
  if (typeof pasted === 'string' && overTextLimit(pasted)) {
    throw new ApiRouteError('payload_too_large', 'This text is longer than we can index.', {
      maxBytes: MAX_DOCUMENT_TEXT,
      reason: 'text_too_long',
    })
  }

  const fields = parseValue(Fields, {
    title: form.get('title') ?? undefined,
    type: form.get('type') ?? undefined,
    associationId: form.get('associationId') ?? undefined,
    effectiveDate: form.get('effectiveDate') ?? undefined,
    pastedText: form.get('pastedText') ?? undefined,
  })
  await requireOrgOwned('associations', fields.associationId, orgId)

  const rawFile = form.get('file')
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null

  let extractedText = ''
  let parserVersion = 'paste-1.0.0'
  let buffer: Buffer | null = null
  let contentType = 'application/octet-stream'

  if (file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiRouteError('payload_too_large', undefined, { maxBytes: MAX_UPLOAD_BYTES })
    }
    const kind = fileKind(file)
    if (!kind) {
      throw new ApiRouteError('unsupported_media_type', 'Upload a PDF, .txt or .md file.')
    }
    buffer = Buffer.from(await file.arrayBuffer())

    if (kind === 'pdf') {
      contentType = 'application/pdf'
      try {
        // Shared hardened extractor (SEC-L7). Governing documents run long
        // (CC&Rs, bylaws), so a wider timeout than the 10 s default.
        const parsed = await extractPdfText(buffer, { maxBytes: MAX_UPLOAD_BYTES, timeoutMs: 20_000 })
        extractedText = parsed.text
        parserVersion = parsed.parserVersion
      } catch (err) {
        logRouteFailure('governing-docs.upload.pdf-parse', err, { orgId, bytes: file.size })
        throw new ApiRouteError(
          'unprocessable',
          'We could not extract text from this PDF. Try the "Paste text" tab, or convert the PDF first.',
          { reason: 'pdf_parse_failed' },
        )
      }
    } else {
      contentType = file.name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain'
      extractedText = buffer.toString('utf8')
      parserVersion = 'text-passthrough-1.0.0'
    }
  } else if (fields.pastedText) {
    extractedText = fields.pastedText
  } else {
    throw new ApiRouteError('validation_failed', 'Either upload a file or paste text.', {
      issues: [{ path: 'file', message: 'Either upload a file or paste text.' }],
    })
  }

  if (overTextLimit(extractedText)) {
    throw new ApiRouteError('payload_too_large', 'This document has more text than we can index.', {
      maxBytes: MAX_DOCUMENT_TEXT,
      reason: 'text_too_long',
    })
  }
  if (extractedText.trim().length < 100) {
    throw new ApiRouteError(
      'unprocessable',
      'Extracted text is under 100 characters; nothing meaningful to chunk.',
      { reason: 'content_too_short' },
    )
  }

  // Markdown gets the section-aware chunker; everything else (PDF text,
  // plain text) gets the paragraph chunker. Chunk before writing anything,
  // so a refusal here leaves no orphan object or row behind.
  const isMarkdown = !!file && file.name.toLowerCase().endsWith('.md')
  const chunks = isMarkdown ? chunkByMarkdownSection(extractedText) : chunkPlainText(extractedText)
  if (chunks.length === 0) {
    throw new ApiRouteError('unprocessable', 'Text was extracted but produced zero chunks.', {
      reason: 'no_chunks_produced',
    })
  }

  const supabase = await getSupabaseServerClient()
  const adminDb = createAdminClient()

  // Upload the original file to Storage so the source is preserved. The
  // path is built server-side under `${orgId}/` from a validated, org-owned
  // association id (RC-4). A failed upload is a failed step (RC-6): answer
  // the generic 500 before any row is written, so there is nothing to
  // compensate and the board is never told a file was kept when it was not.
  let storagePath: string | null = null
  if (file && buffer) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const path = `${orgId}/${fields.associationId}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType, upsert: false })
    checkWrite({ error: uploadErr }, 'governing-docs.upload.storage', { orgId })
    storagePath = path
  }

  async function removeStoredObject(): Promise<void> {
    if (!storagePath) return
    // Service role: the path was built server-side under `${orgId}/` above.
    const { error } = await adminDb.storage.from(STORAGE_BUCKET).remove([storagePath])
    // Cannot compensate further. Left behind: the uploaded object at
    // storagePath, with no governing_documents row referencing it. Logged
    // (code + org only) so it can be swept; the caller still gets its 500.
    if (error) logRouteFailure('governing-docs.upload.storage-remove', error, { orgId })
  }

  // The governing_documents row goes through the user client so RLS
  // verifies the caller's org.
  const { data: doc, error: docErr } = await supabase
    .from('governing_documents' as never)
    .insert({
      organization_id: orgId,
      association_id: fields.associationId,
      type: fields.type,
      title: fields.title,
      effective_date: fields.effectiveDate ?? null,
      storage_path: storagePath,
      file_size: file ? file.size : null,
      parsed_text: extractedText,
      parsed_at: new Date().toISOString(),
      parser_version: parserVersion,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (docErr || !doc) {
    await removeStoredObject()
    checkWrite({ error: docErr }, 'governing-docs.upload.insert-doc', { orgId })
    logRouteFailure('governing-docs.upload.insert-doc', null, { orgId, stage: 'no_row' })
    throw new ApiRouteError('internal')
  }

  // Embeddings are generated up-front so they land with the chunks in one
  // round-trip. Failure is non-fatal — the rows go in with NULL embeddings
  // and W1's retrieval falls back to FTS.
  let embeddings: number[][] | null = null
  let embeddingFailed = false
  try {
    if (process.env.HUGGINGFACE_API_TOKEN || process.env.EMBEDDING_BASE_URL) {
      embeddings = await embedTexts(chunks.map((c) => c.text))
    }
  } catch (err) {
    embeddingFailed = true
    logRouteFailure('governing-docs.upload.embed', err, { orgId, documentId: doc.id, count: chunks.length })
  }

  const inserts = chunks.map((c, ordinal) => ({
    organization_id: orgId,
    document_id: doc.id,
    section: c.section,
    page_number: null,
    ordinal,
    text: c.text,
    embedding: embeddings?.[ordinal] ? toPgVector(embeddings[ordinal]) : null,
    metadata: {
      parser_version: parserVersion,
      embedding_status: embeddings ? 'embedded' : 'pending',
    },
  }))

  const { error: chunkErr } = await adminDb
    .from('governing_document_chunks' as never)
    .insert(inserts as never)

  if (chunkErr) {
    // Compensate in reverse order so a retry does not leave a chunkless
    // duplicate document behind (R-19).
    const { error: delErr } = await adminDb
      .from('governing_documents' as never)
      .delete()
      .eq('id', doc.id)
      .eq('organization_id', orgId)
    if (delErr) {
      // Cannot compensate. Left behind: the governing_documents row
      // (documentId) with no chunks, AND its stored object at storage_path.
      // The object is deliberately NOT removed: the surviving row still
      // references it, and removing it would leave storage_path dangling.
      // Logged (code + ids only) so the pair can be cleaned up together.
      logRouteFailure('governing-docs.upload.compensate-doc', delErr, { orgId, documentId: doc.id })
    } else {
      await removeStoredObject()
    }
    checkWrite({ error: chunkErr }, 'governing-docs.upload.insert-chunks', {
      orgId,
      documentId: doc.id,
      count: inserts.length,
    })
    throw new ApiRouteError('internal') // unreachable: checkWrite throws on an error
  }

  return NextResponse.json(
    {
      documentId: doc.id,
      chunkCount: inserts.length,
      embeddedCount: embeddings ? embeddings.length : 0,
      embeddingStatus: embeddings ? 'embedded' : embeddingFailed ? 'failed' : 'skipped',
      parserVersion,
    },
    { status: 201 },
  )
})
