// BL-021 / BL-059 — which files the bill scan accepts, shared by both ways
// in: the "Scan a bill" upload (POST /api/accounting/bill-scan) and "Scan as
// a bill" on an inbox attachment (lib/inbox/attachment-bill.ts).
//
// Pure: no imports, so the inbox's attachment chip (a client component) can
// decide whether to offer the button, and the server re-decides.

/** Allowed MIME type → stored extension. HEIC is out: no vision endpoint here decodes it. */
export const BILL_ALLOWED_TYPES: ReadonlyMap<string, string> = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['pdf', 'application/pdf'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

export const BILL_WRONG_TYPE = 'Upload the bill as a PDF, JPG, PNG or WebP.'

/**
 * The bill's content type, or null when it is not one the scan reads. A
 * declared type wins (and must be on the list); a missing or generic
 * `application/octet-stream` falls back to the file name's extension.
 */
export function resolveBillContentType(declaredType: string | null | undefined, fileName: string): string | null {
  const declared = (declaredType ?? '').split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return BILL_ALLOWED_TYPES.has(declared) ? declared : null
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return null
  return TYPE_BY_EXTENSION.get(fileName.slice(dot + 1).toLowerCase()) ?? null
}

/** Offer "Scan as a bill" on this attachment? By name only (the chip has no type); the server re-checks. */
export function looksLikeBillFile(fileName: string): boolean {
  return resolveBillContentType(null, fileName) !== null
}
