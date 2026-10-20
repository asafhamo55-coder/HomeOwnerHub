/**
 * Vendor COI reminder copy (BL-083): the board's in-app notice. Pure.
 *
 * There is no vendor email here any more (owner rule 2026-10-20: nothing
 * goes outside the board automatically). The notice points the board at
 * the vendor page, where "Request updated certificate" drafts that email
 * for them to review and send (@homeowner-portal/workflows/vendor-coi).
 */

import { whenPhrase, type CoiMilestone } from './milestones'

/** "October 25, 2026" for a date-only value — formatted in UTC so the
 *  calendar date never shifts a day (BL-043). */
export function formatCalendarDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

export function renderBoardNotice(i: {
  vendorName: string
  expiresOn: string
  milestone: CoiMilestone
  daysLeft: number
}): { title: string; body: string } {
  const title =
    i.milestone === 'expired'
      ? i.daysLeft === 0
        ? `${i.vendorName}: insurance expires today`
        : `${i.vendorName}: insurance has expired`
      : `${i.vendorName}: insurance expires ${whenPhrase(i.daysLeft)}`
  const when = `Certificate of insurance ${i.daysLeft < 0 ? 'expired' : 'expires'} ${formatCalendarDate(i.expiresOn)}.`
  return {
    title,
    body: `${when} Nothing has been sent to the vendor. Open the vendor to request an updated certificate.`,
  }
}
