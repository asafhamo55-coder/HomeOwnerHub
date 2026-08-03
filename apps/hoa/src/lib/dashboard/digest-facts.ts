/**
 * The digest's deterministic half.
 *
 * Division of labour with the tiles: the TILES own current numbers, the
 * DIGEST owns what changed and what to do first. Bulleting "32 emails need
 * a reply" directly above a tile reading "Needs a reply 32" is the
 * duplication this redesign exists to remove, so none of these bullets
 * restates a tile.
 *
 * Both change-bullets are computed LIVE rather than by subtracting stored
 * counts. A net subtraction reports "0 new" on a day when three arrived and
 * three were answered, which is false. The snapshot table exists for
 * point-in-time comparison the live data cannot reconstruct — "down 4 from
 * yesterday" and, later, trend arrows.
 */

export interface DigestCounts {
  needsReply: number
  oldestWaitingDays: number | null
  untriaged: number
  approvalsPending: number
  /** Whole US dollars — the unit getDashboardKpis already returns. */
  duesOutstandingUsd: number
}

export interface DigestFacts {
  bullets: string[]
  counts: DigestCounts
}

export interface BulletInput {
  /** Null when no prior-day snapshot exists — the bullet is then omitted. */
  newSinceBaseline: number | null
  waitingOverThree: number
  /** Pre-formatted by `formatNextMeeting`, or null to omit. */
  nextMeeting: string | null
}

export function buildBullets(input: BulletInput): string[] {
  const bullets: string[] = []

  // Omitted rather than shown as "0 new": with no baseline there is
  // nothing to compare against, and claiming zero would be a claim we
  // cannot support.
  if (input.newSinceBaseline !== null && input.newSinceBaseline > 0) {
    bullets.push(
      input.newSinceBaseline === 1
        ? '1 new resident email since yesterday'
        : `${input.newSinceBaseline} new resident emails since yesterday`,
    )
  }

  if (input.waitingOverThree > 0) {
    bullets.push(
      input.waitingOverThree === 1
        ? '1 has now waited over 3 days'
        : `${input.waitingOverThree} have now waited over 3 days`,
    )
  }

  if (input.nextMeeting !== null) {
    bullets.push(input.nextMeeting)
  }

  return bullets
}

/**
 * `getNextMeeting` returns `{ id, meetingDate, meetingType, daysUntil,
 * status }` and falls back to the most recent PAST meeting when nothing is
 * upcoming, so `daysUntil` can be negative. A past meeting is dropped —
 * "Next meeting: 5 days ago" is nonsense on a card about today.
 */
export function formatNextMeeting(
  meeting: { meetingType: string | null; daysUntil: number } | null,
): string | null {
  if (meeting === null) return null
  if (meeting.daysUntil < 0) return null

  const type = meeting.meetingType ? `${meeting.meetingType} ` : ''
  if (meeting.daysUntil === 0) return `Next meeting: ${type}today`
  if (meeting.daysUntil === 1) return `Next meeting: ${type}tomorrow`
  return `Next meeting: ${type}in ${meeting.daysUntil} days`
}

/**
 * A snapshot is a valid delta baseline only if it was captured on an
 * EARLIER day. Same-day rows are rejected so the card's own refreshes
 * cannot walk the baseline forward and flatten the delta to zero.
 *
 * Both arguments are ISO date strings (YYYY-MM-DD), which compare
 * correctly with `<` lexicographically — no Date parsing, no timezone.
 */
export function isBaselineRow(capturedOn: string, today: string): boolean {
  return capturedOn < today
}
