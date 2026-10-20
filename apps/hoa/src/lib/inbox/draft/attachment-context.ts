/**
 * BL-101 A8 (second half) — let W32's reply draft "see" the text of the
 * resident's own attachments.
 *
 * What goes to the model is a handful of SHORT excerpts, never whole files:
 *   - PDF (via `readPdfTexts`, the extraction documents filing and W33 use),
 *     plain text / CSV, and .docx (word/document.xml, read with node:zlib);
 *   - only attachments on INBOUND messages sent by the verified sender —
 *     the caller loads this only after `checkSenderForUnit` verified them,
 *     so an unverified or `sender_unauthenticated` sender gets nothing;
 *   - caps at every step: 5 files, 5 MB per file, 20k characters extracted
 *     per file, then excerpts of at most 400 characters per file and 1,200
 *     in all, picked by overlap with the resident's latest message.
 *
 * The excerpts are UNTRUSTED, UNCITABLE context: they never become a
 * `RetrievedFragment`, carry no refId, are labelled by position (never by
 * the sender-chosen file name), contact details are stripped, and W32's
 * prompt fences and sanitizes them (prompt.ts rule 7). Citations still
 * resolve only against the HOA's own documents.
 *
 * No extra AI call: the text rides inside the existing W32 call.
 *
 * Never log a file name, a storage path or extracted text — ids and counts
 * only. Every failure is swallowed per file; the whole loader never throws,
 * so an unreadable attachment can only make the draft lose its excerpts.
 */

import { inflateRawSync } from 'node:zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redactContactPII } from '@homeowner-portal/ai/pii'
import { readPdfTexts } from '@/lib/inbox/attachment-pdf'
import { inboxAttachmentPathOk } from '@/lib/inbox/attachment-file-rules'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_CHARS,
} from '@/lib/inbox/vendor/attachment-text'

const BUCKET = 'hoa-documents'

/** Characters kept from any one file's extracted text, before excerpting. */
export const MAX_EXTRACTED_CHARS = MAX_TOTAL_CHARS
/** Characters of excerpt per file, and across all files. */
export const MAX_EXCERPT_CHARS_PER_FILE = 400
export const MAX_EXCERPT_CHARS_TOTAL = 1_200
/** A .docx whose document.xml inflates past this is not read (zip bomb). */
export const MAX_DOCX_XML_BYTES = 4 * 1024 * 1024

export type AttachmentKind = 'pdf' | 'text' | 'docx'

export interface AttachmentContextExcerpt {
  label: string
  excerpt: string
}

export interface AttachmentRow {
  id: string
  message_id: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  storage_path: string | null
  fetch_status: string
}

export interface ContextAttachment {
  id: string
  kind: AttachmentKind
  fileName: string
  storagePath: string
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Which reader a file needs, or null when this feature does not read it. */
export function attachmentKind(fileName: string, contentType: string | null): AttachmentKind | null {
  const type = (contentType ?? '').toLowerCase().split(';')[0]!.trim()
  const name = fileName.toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type === DOCX_TYPE || name.endsWith('.docx')) return 'docx'
  if (type === 'text/plain' || type === 'text/csv' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return 'text'
  }
  return null
}

/**
 * The attachments worth reading: stored, under the per-file byte cap, of a
 * readable kind, on one of `messageIds` (the verified sender's inbound
 * messages), newest message first, at most MAX_ATTACHMENTS.
 */
export function selectContextAttachments(
  rows: AttachmentRow[],
  messageIds: string[],
): ContextAttachment[] {
  const order = new Map(messageIds.map((id, i) => [id, i]))
  const out: ContextAttachment[] = []
  const eligible = rows
    .filter((r) => order.has(r.message_id))
    .filter((r) => r.fetch_status === 'stored' && Boolean(r.storage_path))
    .filter((r) => r.size_bytes === null || (r.size_bytes > 0 && r.size_bytes <= MAX_ATTACHMENT_BYTES))
    .sort((a, b) => order.get(a.message_id)! - order.get(b.message_id)!)
  for (const r of eligible) {
    const kind = attachmentKind(r.file_name, r.content_type)
    if (!kind) continue
    out.push({ id: r.id, kind, fileName: r.file_name, storagePath: r.storage_path as string })
    if (out.length >= MAX_ATTACHMENTS) break
  }
  return out
}

// ─── Extraction ─────────────────────────────────────────────────────────

/** UTF-8 text, decoded leniently and capped. */
export function decodeTextFile(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, MAX_EXTRACTED_CHARS)
}

/**
 * The visible text of a .docx: find `word/document.xml` through the zip's
 * central directory, inflate it under a hard output cap, keep the `<w:t>`
 * runs with paragraph breaks. Returns null for anything that is not a
 * readable, deflated-or-stored docx. Never throws.
 */
export function extractDocxText(buf: Buffer): string | null {
  try {
    // End of central directory: signature 0x06054b50, within the last 64 KB.
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) return null
    const entries = buf.readUInt16LE(eocd + 10)
    let p = buf.readUInt32LE(eocd + 16)
    for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return null
      const method = buf.readUInt16LE(p + 10)
      const compressed = buf.readUInt32LE(p + 20)
      const nameLen = buf.readUInt16LE(p + 28)
      const extraLen = buf.readUInt16LE(p + 30)
      const commentLen = buf.readUInt16LE(p + 32)
      const localOffset = buf.readUInt32LE(p + 42)
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
      p += 46 + nameLen + extraLen + commentLen
      if (name !== 'word/document.xml') continue

      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null
      const start =
        localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
      const data = buf.subarray(start, start + compressed)
      let xml: string
      if (method === 0) {
        if (data.length > MAX_DOCX_XML_BYTES) return null
        xml = data.toString('utf8')
      } else if (method === 8) {
        xml = inflateRawSync(data, { maxOutputLength: MAX_DOCX_XML_BYTES }).toString('utf8')
      } else {
        return null
      }
      return docxXmlToText(xml)
    }
    return null
  } catch {
    return null
  }
}

/** `<w:t>` runs, paragraphs as newlines, entities decoded. */
export function docxXmlToText(xml: string): string {
  const paragraphs = xml.replace(/<w:tab\/>/g, '<w:t> </w:t>').replace(/<w:br\/>/g, '</w:p>').split('</w:p>')
  const text = paragraphs
    .map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (m) => m[1]).join(''))
    .filter((line) => line.trim().length > 0)
    .join('\n')
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .slice(0, MAX_EXTRACTED_CHARS)
}

// ─── Excerpting ─────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'that', 'this', 'with', 'have', 'from', 'your', 'about', 'there', 'their', 'would', 'could',
  'should', 'what', 'when', 'where', 'which', 'will', 'been', 'were', 'they', 'them', 'then',
  'than', 'just', 'like', 'some', 'into', 'also', 'please', 'thanks', 'thank', 'attached',
  'attachment', 'hello', 'regards',
])

function terms(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w)),
  )
}

/**
 * The few sentences of `text` that share the most terms with `query`, in
 * document order, joined with " … ", at most `maxChars`. With no overlap
 * at all, the head of the document (its title and opening usually say what
 * it is). Pure.
 */
export function relevantExcerpt(text: string, query: string, maxChars: number): string {
  const clean = text.replace(/[ \t\f\v]+/g, ' ').trim()
  if (!clean || maxChars <= 0) return ''
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const want = terms(query)
  const scored = sentences.map((s, i) => {
    const have = terms(s)
    let score = 0
    for (const w of want) if (have.has(w)) score++
    return { s, i, score }
  })
  const best = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i)
  if (best.length === 0) return clean.replace(/\s+/g, ' ').slice(0, maxChars).trim()

  const picked: typeof best = []
  let used = 0
  for (const x of best) {
    const cost = Math.min(x.s.length, maxChars) + (picked.length > 0 ? 3 : 0)
    if (used + cost > maxChars) {
      if (picked.length === 0) picked.push({ ...x, s: x.s.slice(0, maxChars) })
      break
    }
    picked.push(x)
    used += cost
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' … ')
    .slice(0, maxChars)
}

/**
 * Per-file texts to the excerpts W32 receives: contact details stripped,
 * labelled by position and kind only, per-file and total caps applied.
 */
export function buildAttachmentContext(
  files: Array<{ kind: AttachmentKind; text: string }>,
  query: string,
): AttachmentContextExcerpt[] {
  const out: AttachmentContextExcerpt[] = []
  let budget = MAX_EXCERPT_CHARS_TOTAL
  for (const f of files) {
    if (budget <= 0) break
    const text = f.text.slice(0, MAX_EXTRACTED_CHARS)
    if (!text.trim()) continue
    const excerpt = redactContactPII(
      relevantExcerpt(text, query, Math.min(MAX_EXCERPT_CHARS_PER_FILE, budget)),
    ).trim()
    if (!excerpt) continue
    budget -= excerpt.length
    out.push({ label: `Attachment ${out.length + 1} (${f.kind.toUpperCase()})`, excerpt })
  }
  return out
}

// ─── I/O ────────────────────────────────────────────────────────────────

export interface AttachmentContextResult {
  excerpts: AttachmentContextExcerpt[]
  /** Readable attachments existed but none yielded text. */
  failed: boolean
}

const EMPTY: AttachmentContextResult = { excerpts: [], failed: false }

/**
 * Load excerpts for one thread. The caller must already have verified the
 * sender; `messageIds` are that sender's inbound messages, newest first.
 * Never throws.
 */
export async function loadAttachmentContext(
  db: SupabaseClient,
  orgId: string,
  threadId: string,
  messageIds: string[],
  query: string,
): Promise<AttachmentContextResult> {
  if (messageIds.length === 0) return EMPTY
  try {
    const { data, error } = await db
      .from('inbox_attachments')
      .select('id, message_id, file_name, content_type, size_bytes, storage_path, fetch_status')
      .eq('organization_id', orgId)
      .eq('thread_id', threadId)
      .in('message_id', messageIds)
    if (error) {
      console.error('loadAttachmentContext: read failed', { orgId, threadId, code: error.code })
      return { excerpts: [], failed: true }
    }
    const picked = selectContextAttachments((data ?? []) as AttachmentRow[], messageIds).filter(
      (a) => inboxAttachmentPathOk(a.storagePath, { orgId, threadId, attachmentId: a.id }),
    )
    if (picked.length === 0) return EMPTY

    const texts = new Map<string, string>()
    const pdfs = picked.filter((a) => a.kind === 'pdf')
    if (pdfs.length > 0) {
      const read = await readPdfTexts(
        db,
        BUCKET,
        pdfs.map((a) => ({ id: a.id, fileName: a.id, storagePath: a.storagePath })),
      )
      // fileName was set to the id above, so results map back without a name.
      for (const r of read) texts.set(r.fileName, r.text)
    }
    for (const a of picked.filter((x) => x.kind !== 'pdf')) {
      try {
        const { data: blob, error: dlError } = await db.storage.from(BUCKET).download(a.storagePath)
        if (dlError || !blob) {
          console.error('loadAttachmentContext: download failed', { orgId, attachmentId: a.id })
          continue
        }
        const buf = Buffer.from(await blob.arrayBuffer())
        if (buf.length > MAX_ATTACHMENT_BYTES) continue
        const text = a.kind === 'docx' ? extractDocxText(buf) : decodeTextFile(buf)
        if (text) texts.set(a.id, text)
      } catch (err) {
        console.error('loadAttachmentContext: parse failed', {
          orgId,
          attachmentId: a.id,
          error: err instanceof Error ? err.name : 'UnknownError',
        })
      }
    }

    const excerpts = buildAttachmentContext(
      picked.map((a) => ({ kind: a.kind, text: texts.get(a.id) ?? '' })),
      query,
    )
    return { excerpts, failed: excerpts.length === 0 }
  } catch (err) {
    console.error('loadAttachmentContext: failed', {
      orgId,
      threadId,
      error: err instanceof Error ? err.name : 'UnknownError',
    })
    return { excerpts: [], failed: true }
  }
}
