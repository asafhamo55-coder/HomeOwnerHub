// Pure helpers for the "Latest activity" list on /resident/requests.
// No server imports on purpose: unit-testable and safe to import anywhere.

export type ActivityKind = 'ticket' | 'arc' | 'report'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  title: string
  status: string
  /** ISO timestamp the item is sorted and labelled by. */
  at: string
  href: string
}

interface TicketIn { id: string; subject: string; status: string; created_at: string }
interface ArcIn { id: string; summary: string; status: string; submitted_at: string; board_response_at?: string | null }
interface ReportIn { id: string; description: string; status: string; submitted_at: string }

export const ACTIVITY_LIMIT = 5

function ms(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function clip(text: string, max = 80): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

/** Merge the three lists, newest first, capped. A null list (failed read) adds nothing. */
export function buildLatestActivity(
  input: { tickets: TicketIn[] | null; arc: ArcIn[] | null; reports: ReportIn[] | null },
  limit: number = ACTIVITY_LIMIT,
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...(input.tickets ?? []).map((t): ActivityItem => ({
      id: t.id, kind: 'ticket', title: clip(t.subject), status: t.status, at: t.created_at,
      href: `/resident/tickets/${t.id}`,
    })),
    ...(input.arc ?? []).map((a): ActivityItem => ({
      id: a.id, kind: 'arc', title: clip(a.summary), status: a.status,
      // A board decision is newer news than the submission itself.
      at: a.board_response_at && ms(a.board_response_at) > ms(a.submitted_at) ? a.board_response_at : a.submitted_at,
      href: `/resident/arc/${a.id}`,
    })),
    ...(input.reports ?? []).map((r): ActivityItem => ({
      id: r.id, kind: 'report', title: clip(r.description), status: r.status, at: r.submitted_at,
      href: `/resident/violations/${r.id}`,
    })),
  ]
  return items.sort((x, y) => ms(y.at) - ms(x.at)).slice(0, limit)
}

/** "just now", "5 minutes ago", "3 days ago", then a short date. */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - ms(iso)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(ms(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
