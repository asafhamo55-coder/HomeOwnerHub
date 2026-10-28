/**
 * Images pasted into an announcement's message. Pure and client-safe: the
 * composer, the server action and the tests all import it.
 *
 * Why not the inbox's cid attachments: announcements go out through
 * Resend's batch endpoint (lib/email.ts sendEmailBatch), which does not
 * accept attachments, so there is no inline part to reference. The image is
 * instead hosted by the app itself at an unguessable URL
 * (/api/announcement-image/<org>/<uuid>.<ext>, served from the private
 * storage bucket by that route) and the email carries a plain <img>.
 *
 * Two marker forms, both on a line of their own in the plain-text editor:
 *   [image: pasted-image-20261028-101500.png]   what the board sees; the
 *                                               browser keeps a name → id map
 *   [image: <uuid>.png]                         what is sent to the server
 * Only the second form ever becomes HTML, and only through a regex that
 * matches nothing but a uuid and one of four extensions, so a marker can
 * never inject markup or point anywhere but this app's own image route.
 */

export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES_PER_MESSAGE = 6

const ID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:png|jpg|gif|webp)'
const ID_RE = new RegExp(`^${ID_SRC}$`)
/** Any marker, valid or not (a name the board sees, an id, or junk typed by hand). */
const ANY_MARKER_RE = /\[image: [^\]\n]*\]/g
const ID_MARKER_RE = new RegExp(`\\[image: (${ID_SRC})\\]`, 'g')

export function isAnnouncementImageId(value: string): boolean {
  return ID_RE.test(value)
}

/** The public path of one hosted image. */
export function announcementImagePath(orgId: string, id: string): string {
  return `/api/announcement-image/${orgId}/${id}`
}

/** The content type served for an id's extension; null for anything else. */
export function announcementImageContentType(id: string): string | null {
  if (!isAnnouncementImageId(id)) return null
  const ext = id.slice(id.lastIndexOf('.') + 1)
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
}

/** The markers in a text, in order. */
export function markersIn(text: string): string[] {
  return text.match(ANY_MARKER_RE) ?? []
}

export function countMarkers(text: string): number {
  return markersIn(text).length
}

/** Friendly `[image: name]` markers → `[image: <id>]` for every name the map knows. */
export function toIdMarkers(text: string, idByName: Record<string, string>): string {
  return text.replace(ANY_MARKER_RE, (marker) => {
    const name = marker.slice('[image: '.length, -1)
    const id = Object.prototype.hasOwnProperty.call(idByName, name) ? idByName[name] : undefined
    return id && isAnnouncementImageId(id) ? `[image: ${id}]` : marker
  })
}

/**
 * Removes every marker that is not an id marker (a friendly name whose
 * upload never finished, or text typed by hand), along with the line break
 * it sat on. What is left is safe to hand to plainTextToHtml.
 */
export function dropUnresolvedMarkers(text: string): string {
  return text
    .replace(ANY_MARKER_RE, (marker) => (ID_RE.test(marker.slice('[image: '.length, -1)) ? marker : ''))
    .replace(/\n{3,}/g, '\n\n')
}

/** Removes all markers (for the translator and any text-only use). */
export function stripImageMarkers(text: string): string {
  return text.replace(ANY_MARKER_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * HTML from plainTextToHtml → the same with each id marker replaced by its
 * <img>. Run AFTER escaping, on the whole string: a marker survives
 * escaping unchanged (it has no characters HTML escapes), and nothing but
 * the strict id pattern is replaced.
 */
export function markersToImgHtml(html: string, opts: { origin: string; orgId: string }): string {
  return html.replace(ID_MARKER_RE, (_m, id: string) => {
    const src = `${opts.origin.replace(/\/+$/, '')}${announcementImagePath(opts.orgId, id)}`
    return `<img src="${attr(src)}" alt="Image from your community board" style="display:block;max-width:100%;height:auto;border:0;margin:8px 0;">`
  })
}
