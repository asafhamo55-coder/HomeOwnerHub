/**
 * BL-137: the owner notice for a dues change, and its hand-off to the
 * communications wizard. Pure apart from the storage it is given.
 *
 * The rates page writes the subject and HTML body to this tab's
 * sessionStorage and opens /communications/new?from=dues-rate-notice; the
 * wizard reads it back and pre-fills the message (owners only). Nothing is
 * saved on the server and nothing is sent: the board reviews it in the
 * wizard, and the normal send (with the outbound guard) is the only way it
 * leaves. Same shape as lib/budget-notice/draft-handoff.ts.
 *
 * The notice states facts the app holds (old and new amount, the change,
 * the start day). The reason is a bracketed blank the board fills in. No
 * statute is quoted to owners: what the law asks of the board is shown to
 * the board on the rates page (./law.ts).
 */

import { formatDay } from '@/lib/money/format'
import { FREQUENCY_LABELS, centsLabel, pctPhrase, rateLabel, type RateChange } from './model'

export const RATE_NOTICE_FROM = 'dues-rate-notice'
export const RATE_NOTICE_DRAFT_KEY = 'hoh:dues-rate-notice-draft'
export const RATE_NOTICE_WIZARD_HREF = `/communications/new?from=${RATE_NOTICE_FROM}`

export interface RateNoticeDraft {
  rateId: string
  subject: string
  bodyHtml: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function buildRateNotice(input: { associationName: string | null; change: RateChange }): RateNoticeDraft {
  const { change } = input
  const name = input.associationName?.trim() || 'the association'
  const start = formatDay(change.to.effectiveFrom)
  const up = change.pct !== null && change.pct > 0
  const down = change.pct !== null && change.pct < 0
  const subject = `${up ? 'Dues increase' : down ? 'Dues change' : 'Dues'} starting ${start}`

  const lines: string[] = []
  lines.push(`<p>Dear owner,</p>`)
  if (change.from) {
    const phrase = pctPhrase(change.pct)
    lines.push(
      `<p>Starting <strong>${esc(start)}</strong>, dues for ${esc(name)} will be <strong>${esc(rateLabel(change.to))}</strong> per home, ` +
        `${up ? 'up' : down ? 'down' : 'changed'} from ${esc(rateLabel(change.from))}${phrase && change.pct !== 0 ? ` (${esc(phrase)} a year)` : ''}.</p>`,
    )
    if (change.deltaAnnualCents !== null && change.deltaAnnualCents !== 0) {
      lines.push(
        `<p>Over a full year that is ${esc(centsLabel(change.toAnnualCents))} per home instead of ${esc(centsLabel(change.fromAnnualCents ?? 0))}, ` +
          `a difference of ${esc(centsLabel(Math.abs(change.deltaAnnualCents)))}.</p>`,
      )
    }
  } else {
    lines.push(
      `<p>Starting <strong>${esc(start)}</strong>, dues for ${esc(name)} will be <strong>${esc(rateLabel(change.to))}</strong> per home ` +
        `(${esc(centsLabel(change.toAnnualCents))} a year).</p>`,
    )
  }
  lines.push(`<p><strong>Why:</strong> [Explain the reason, for example the adopted budget, insurance or reserves.]</p>`)
  lines.push(
    `<p>Dues are billed ${esc(FREQUENCY_LABELS[change.to.frequency].adverb.toLowerCase())}. You’ll see the new amount on your account from the first bill on or after ${esc(start)}.</p>`,
  )
  lines.push(`<p>If you have questions, reply to this message or contact the board.</p>`)
  lines.push(`<p>The Board of Directors<br />${esc(name)}</p>`)
  return { rateId: change.to.id, subject, bodyHtml: lines.join('\n') }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function writeRateNoticeDraft(storage: StorageLike | null | undefined, draft: RateNoticeDraft): boolean {
  try {
    if (!storage) return false
    storage.setItem(RATE_NOTICE_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readRateNoticeDraft(storage: StorageLike | null | undefined): RateNoticeDraft | null {
  try {
    const raw = storage?.getItem(RATE_NOTICE_DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<RateNoticeDraft>
    if (typeof v.subject !== 'string' || typeof v.bodyHtml !== 'string' || typeof v.rateId !== 'string') return null
    if (!v.subject.trim() || !v.bodyHtml.trim()) return null
    return { rateId: v.rateId, subject: v.subject, bodyHtml: v.bodyHtml }
  } catch {
    return null
  }
}
