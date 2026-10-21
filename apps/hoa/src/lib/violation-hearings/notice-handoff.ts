/**
 * BL-133: hands the drafted hearing notice to the communications composer,
 * the same way the owner budget notice does (lib/budget-notice/draft-handoff.ts).
 *
 * The violation page writes the subject and HTML body to this tab's
 * sessionStorage and opens /communications/new?from=hearing-notice&property=<id>;
 * the composer reads it back, files it under "violation", and starts on
 * that one home. Nothing is saved on the server and nothing is sent: the
 * board reviews it and the normal send (with the outbound guard) is the
 * only way it leaves. Then the board records the day it went out on the
 * hearing card.
 *
 * sessionStorage can be missing or throw, so every access is guarded.
 * Pure apart from the storage it is given. Never logged (the body names
 * the violation).
 */

export const HEARING_NOTICE_FROM = 'hearing-notice'
export const HEARING_NOTICE_DRAFT_KEY = 'hoh:hearing-notice-draft'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function hearingNoticeComposerHref(propertyId: string | null): string {
  const q = new URLSearchParams({ from: HEARING_NOTICE_FROM })
  if (propertyId && UUID_RE.test(propertyId)) q.set('property', propertyId)
  return `/communications/new?${q.toString()}`
}

export interface HearingNoticeDraft {
  violationId: string
  subject: string
  bodyHtml: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function writeHearingNoticeDraft(storage: StorageLike | null | undefined, draft: HearingNoticeDraft): boolean {
  try {
    if (!storage) return false
    storage.setItem(HEARING_NOTICE_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readHearingNoticeDraft(storage: StorageLike | null | undefined): HearingNoticeDraft | null {
  try {
    const raw = storage?.getItem(HEARING_NOTICE_DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<HearingNoticeDraft>
    if (typeof v.subject !== 'string' || typeof v.bodyHtml !== 'string' || typeof v.violationId !== 'string') return null
    if (!v.subject.trim() || !v.bodyHtml.trim()) return null
    return { violationId: v.violationId, subject: v.subject, bodyHtml: v.bodyHtml }
  } catch {
    return null
  }
}
