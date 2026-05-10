import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  chunkByMarkdownSection,
  chunkPlainText,
} from '@homeowner-portal/workflows/chunker'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'

// POST /api/governing-docs/upload
//
// Accepts multipart/form-data with fields:
//   - file: PDF / TXT / MD (required unless `pastedText` is provided)
//   - pastedText: raw text alternative for users who can't upload
//   - title: human-readable title (required)
//   - type: 'declaration' | 'bylaws' | 'rules' | 'amendment' | 'policy'
//   - effectiveDate: ISO date string (optional)
//   - associationId: which association this doc governs (required)
//
// Pipeline:
//   1. Auth + org check
//   2. Extract text (PDF parse, plain text passthrough, or pasted)
//   3. Upload original file to Storage (when one was provided)
//   4. Insert governing_documents row
//   5. Chunk text + insert governing_document_chunks (admin client; RLS
//      would block bulk insert under user session because chunks live in
//      a separate org-scoped table)
//
// Returns: { documentId, chunkCount }

const TypeEnum = z.enum([
  'declaration',
  'bylaws',
  'rules',
  'amendment',
  'policy',
])

const STORAGE_BUCKET = 'governing-docs'
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

export const maxDuration = 60 // seconds — PDF parse + insert can run long

export async function POST(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const title = (form.get('title') ?? '').toString().trim()
  const typeRaw = (form.get('type') ?? '').toString()
  const associationId = (form.get('associationId') ?? '').toString().trim()
  const effectiveDate = (form.get('effectiveDate') ?? '').toString().trim()
  const pastedText = (form.get('pastedText') ?? '').toString().trim()
  const file = form.get('file')

  if (!title || title.length > 200) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 })
  }
  const typeParsed = TypeEnum.safeParse(typeRaw)
  if (!typeParsed.success) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
  }
  if (!associationId) {
    return NextResponse.json({ error: 'association_required' }, { status: 400 })
  }

  // Decide where the text comes from.
  let extractedText = ''
  let storagePath: string | null = null
  let fileSize: number | null = null
  let parserVersion = 'paste-1.0.0'

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'file_too_large', maxBytes: MAX_FILE_BYTES },
        { status: 413 },
      )
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    fileSize = file.size

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        // Dynamic import — pdf-parse pulls a heavy native chain we don't
        // want loaded on cold start of unrelated routes.
        const pdfParse = (await import('pdf-parse')).default
        const parsed = await pdfParse(buffer)
        extractedText = parsed.text
        parserVersion = `pdf-parse-${parsed.version ?? 'unknown'}`
      } catch (err) {
        console.error('[upload] pdf parse failed', err)
        return NextResponse.json(
          {
            error: 'pdf_parse_failed',
            message:
              'We could not extract text from this PDF. Try the "Paste text" tab, or convert the PDF first.',
          },
          { status: 422 },
        )
      }
    } else if (
      file.type.startsWith('text/') ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.name.toLowerCase().endsWith('.md')
    ) {
      extractedText = buffer.toString('utf8')
      parserVersion = 'text-passthrough-1.0.0'
    } else {
      return NextResponse.json(
        { error: 'unsupported_file_type' },
        { status: 415 },
      )
    }

    // Upload the original file to Storage so the source is preserved.
    const supabase = await getSupabaseServerClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    storagePath = `${org.id}/${associationId}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (uploadErr) {
      // Storage failure isn't fatal — we still have the extracted text.
      // Log and clear storagePath so the row doesn't reference a missing object.
      console.warn('[upload] storage upload failed:', uploadErr.message)
      storagePath = null
    }
  } else if (pastedText.length > 0) {
    extractedText = pastedText
    parserVersion = 'paste-1.0.0'
  } else {
    return NextResponse.json(
      { error: 'no_content', message: 'Either upload a file or paste text.' },
      { status: 400 },
    )
  }

  if (extractedText.trim().length < 100) {
    return NextResponse.json(
      {
        error: 'content_too_short',
        message:
          'Extracted text is under 100 characters; nothing meaningful to chunk.',
      },
      { status: 422 },
    )
  }

  // Insert the governing_documents row via the regular client so RLS
  // verifies the user actually belongs to the org.
  const supabase = await getSupabaseServerClient()
  const isMarkdown =
    file instanceof File && file.name.toLowerCase().endsWith('.md')

  const { data: doc, error: docErr } = await supabase
    .from('governing_documents' as never)
    .insert({
      organization_id: org.id,
      association_id: associationId,
      type: typeParsed.data,
      title,
      effective_date: effectiveDate || null,
      storage_path: storagePath,
      file_size: fileSize,
      parsed_text: extractedText,
      parsed_at: new Date().toISOString(),
      parser_version: parserVersion,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (docErr || !doc) {
    console.error('[upload] insert governing_documents failed:', docErr?.message)
    return NextResponse.json(
      { error: 'insert_failed', message: docErr?.message },
      { status: 500 },
    )
  }

  // Chunk and insert. Markdown gets the section-aware chunker; everything
  // else (PDF text, plain text) gets the paragraph chunker.
  const chunks = isMarkdown
    ? chunkByMarkdownSection(extractedText)
    : chunkPlainText(extractedText)

  if (chunks.length === 0) {
    return NextResponse.json(
      {
        error: 'no_chunks_produced',
        message: 'Text was extracted but produced zero chunks.',
        documentId: doc.id,
      },
      { status: 422 },
    )
  }

  const adminDb = createAdminClient()

  // Generate embeddings up-front so they land with the chunks in one
  // round-trip. Failure is non-fatal — we still insert the rows with
  // NULL embeddings, and W1's retrieval handles the FTS fallback.
  let embeddings: number[][] | null = null
  let embeddingError: string | null = null
  try {
    if (process.env.HUGGINGFACE_API_TOKEN || process.env.EMBEDDING_BASE_URL) {
      embeddings = await embedTexts(chunks.map((c) => c.text))
    }
  } catch (err) {
    embeddingError = err instanceof Error ? err.message : String(err)
    console.warn('[upload] embedding failed, inserting without:', embeddingError)
  }

  const inserts = chunks.map((c, ordinal) => ({
    organization_id: org.id,
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
    console.error('[upload] insert chunks failed:', chunkErr.message)
    return NextResponse.json(
      {
        error: 'chunks_failed',
        message: chunkErr.message,
        documentId: doc.id,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    documentId: doc.id,
    chunkCount: inserts.length,
    embeddedCount: embeddings ? embeddings.length : 0,
    embeddingStatus: embeddings ? 'embedded' : embeddingError ? 'failed' : 'skipped',
    embeddingError,
    parserVersion,
  })
}
