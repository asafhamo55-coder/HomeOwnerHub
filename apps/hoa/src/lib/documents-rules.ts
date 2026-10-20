/**
 * The documents library's upload rules, in one pure module so the two ways
 * a file enters the library — the Upload form (lib/documents.ts) and
 * "Save to documents" on an inbox attachment (lib/inbox/attachment-file.ts,
 * BL-101 A8) — validate the same way.
 *
 * `lib/documents.ts` is a 'use server' module and may export only async
 * functions, which is why these constants live here.
 *
 * Pure: no imports, unit-tested.
 */

/** The document types the Upload form offers (hoa_documents.type). */
export const DOCUMENT_UPLOAD_TYPES = ['ccr', 'bylaws', 'rules', 'other'] as const
export type DocumentUploadType = (typeof DOCUMENT_UPLOAD_TYPES)[number]

export const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{ value: DocumentUploadType; label: string }> = [
  { value: 'ccr', label: 'CC&R' },
  { value: 'bylaws', label: 'Bylaws' },
  { value: 'rules', label: 'Rules & regulations' },
  { value: 'other', label: 'Other' },
]

/**
 * Types every resident can open in the portal (0063/0064 RLS; mirrors
 * RESIDENT_VISIBLE_TYPES.hoa in lib/resident-documents/visibility.ts, which
 * a unit test keeps in step). Filing a resident's email attachment under one
 * of these publishes it to the whole community, so the inbox dialog warns.
 */
export const RESIDENT_VISIBLE_UPLOAD_TYPES: readonly DocumentUploadType[] = ['ccr', 'bylaws', 'rules']

export function isResidentVisibleType(type: string): boolean {
  return (RESIDENT_VISIBLE_UPLOAD_TYPES as readonly string[]).includes(type)
}

/**
 * M-3: documents filed from an inbox attachment land under
 * `<org>/from-inbox/<attachmentId>/…` (lib/inbox/attachment-file-rules.ts).
 * A stranger can email the board any PDF, so such a document reaches AI
 * retrieval (W3's CC&R lookup, the C&R count on New violation) only when a
 * board member CONFIRMED it as the association's governing document while
 * filing — that filing is stored one level deeper, under `…/governing/…`.
 * Everything else filed from the inbox is never cited by the AI.
 */
export const INBOX_FILED_SEGMENT = 'from-inbox'
export const INBOX_CONFIRMED_GOVERNING_SEGMENT = 'governing'

/** True when AI features may read this document's text. */
export function isAiEligibleDocumentPath(storagePath: string | null | undefined): boolean {
  if (!storagePath) return true
  const segments = storagePath.split('/')
  const at = segments.indexOf(INBOX_FILED_SEGMENT)
  if (at === -1) return true
  // <org>/from-inbox/<attachmentId>/governing/<name>
  return segments.length === at + 4 && segments[at + 2] === INBOX_CONFIRMED_GOVERNING_SEGMENT
}

/**
 * The PostgREST `.or(...)` filter for isAiEligibleDocumentPath on
 * hoa_documents.storage_path: not filed from the inbox, or filed as a
 * confirmed governing document. LIKE can't count segments, so this is the
 * coarser twin; inbox paths are only ever minted by filedStoragePath.
 */
export const AI_ELIGIBLE_DOCUMENT_FILTER =
  `storage_path.not.like.*/${INBOX_FILED_SEGMENT}/*,storage_path.like.*/${INBOX_FILED_SEGMENT}/*/${INBOX_CONFIRMED_GOVERNING_SEGMENT}/*`

/** The governing-document types (CC&R, bylaws, rules) the AI cites. */
export const GOVERNING_UPLOAD_TYPES: readonly DocumentUploadType[] = ['ccr', 'bylaws', 'rules']

export function isGoverningUploadType(type: string): boolean {
  return (GOVERNING_UPLOAD_TYPES as readonly string[]).includes(type)
}

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024 // 50 MB

/** The Upload form's `accept` list. */
export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md'] as const
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(',')

/** Null when the file can go in the library, else a sentence for the board. */
export function documentFileProblem(file: { fileName: string; sizeBytes: number | null }): string | null {
  const lower = file.fileName.toLowerCase()
  if (!DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return 'The documents library takes PDF, Word (.docx, .doc) or text (.txt, .md) files.'
  }
  if (file.sizeBytes === null) return 'We couldn’t confirm this file’s size, so it wasn’t filed.'
  if (file.sizeBytes <= 0) return 'This file is empty.'
  if (file.sizeBytes > MAX_DOCUMENT_BYTES) return 'Max file size is 50 MB.'
  return null
}

export function isDocumentUploadType(value: unknown): value is DocumentUploadType {
  return typeof value === 'string' && (DOCUMENT_UPLOAD_TYPES as readonly string[]).includes(value)
}

/**
 * Supabase Storage paths must be ASCII-ish. Replace anything weird, keep the
 * extension, and add a timestamp prefix to avoid collisions.
 */
export function sanitizeStorageName(filename: string, now: number = Date.now()): string {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  const safeBase = base.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase().slice(0, 80)
  return `${now}-${safeBase}${ext}`
}
