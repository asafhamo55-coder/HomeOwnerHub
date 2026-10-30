import { dropUnresolvedMarkers, markersToImgHtml, toIdMarkers } from '@/lib/announcements/inline-images'
import { plainTextToHtml } from '@/lib/communications/plain-text'

/** The review step's email HTML: the send's own conversion, so the preview
 *  matches the real email. Text is escaped by plainTextToHtml; only the
 *  strict id markers become images. */
export function buildEmailPreviewHtml(
  text: string,
  idByName: Record<string, string>,
  orgId: string | null,
  origin: string,
): string {
  const html = plainTextToHtml(dropUnresolvedMarkers(toIdMarkers(text, idByName)))
  return orgId ? markersToImgHtml(html, { origin, orgId }) : html
}

/** The Send button's label, with how many homes get it. */
export function sendButtonLabel(when: 'now' | 'later', homes: number): string {
  return when === 'later' ? 'Schedule it' : `Send to ${homes} ${homes === 1 ? 'home' : 'homes'}`
}
