// The shape of a violation photo's storage key, as POST /api/violations/photo
// builds it: `<orgId>/<epoch ms>-<uuid>.<jpg|png|webp|heic>`. A W3 draft
// carries these keys from the client (BL-028 inspection mode), so the draft
// route and the approval both prove each key is one of THIS org's uploads
// before storing or signing it. Pure.

/** Most photos one draft may carry. */
export const MAX_DRAFT_PHOTOS = 10

const KEY = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/\d{10,16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/

/** True when `path` is a photo key the upload route made for `orgId`. */
export function isOrgPhotoPath(orgId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false
  const m = KEY.exec(path)
  return m !== null && m[1] === orgId.toLowerCase()
}

/** The org's photo keys from an untrusted value, deduplicated and capped. */
export function orgPhotoPaths(orgId: string, value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const p of value) {
    if (isOrgPhotoPath(orgId, p) && !out.includes(p)) out.push(p)
    if (out.length === MAX_DRAFT_PHOTOS) break
  }
  return out
}
