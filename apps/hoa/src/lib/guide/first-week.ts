/**
 * "Your first week" cards (user-guide spec §6.4, phase 2). No migration and
 * nothing server-side beyond a date the app already has:
 *
 *  - Board: shown on the dashboard for an org's first FIRST_WEEK_DAYS days,
 *    from `orgs.created_at`, until dismissed in this browser.
 *  - Resident: shown on /resident for a resident's first visits in this
 *    browser (RESIDENT_FIRST_VISITS visits, within FIRST_WEEK_DAYS of the
 *    first one), until dismissed.
 *
 * Neither card tracks progress. Storage can be missing or throw (private
 * mode, blocked site data), so every access is wrapped: a board card then
 * just can't remember a dismiss, and a resident card stays hidden because
 * a first visit can't be told from a hundredth.
 */
import { guideHref } from './index'

export const FIRST_WEEK_DAYS = 14
export const RESIDENT_FIRST_VISITS = 5

const DAY_MS = 24 * 60 * 60 * 1000
/** Server and browser clocks differ a little; a far-future date is bad data. */
const CLOCK_SKEW_MS = 60 * 60 * 1000
/** Reloads and back-navigation inside this window are one visit. */
const VISIT_GAP_MS = 30 * 60 * 1000

export interface FirstWeekStep {
  key: string
  title: string
  description: string
  /** The row's own link. */
  href: string
  /** A second, smaller link beside it. */
  secondary: { href: string; label: string }
  articleId: string
}

// guideHref('…') literals: guide:check fails CI if an article is renamed.
export const BOARD_FIRST_WEEK_STEPS: readonly FirstWeekStep[] = [
  {
    key: 'approvals',
    title: 'Check the Approvals queue',
    description: 'What the AI drafted waits here until the board approves it.',
    href: guideHref('approvals-queue'),
    secondary: { href: '/approvals', label: 'Open Approvals' },
    articleId: 'approvals-queue',
  },
  {
    key: 'violations',
    title: 'Report a violation and approve the letter',
    description: 'Add photos, and the letter is drafted from your CC&Rs. Nothing goes out until you approve it.',
    href: guideHref('violations-report-and-letter'),
    secondary: { href: '/violations', label: 'Open Violations' },
    articleId: 'violations-report-and-letter',
  },
  {
    key: 'arc',
    title: 'Review an ARC application',
    description: 'Approve it, deny it or ask the owner for more information.',
    href: guideHref('arc-review-application'),
    secondary: { href: '/arc', label: 'Open ARC' },
    articleId: 'arc-review-application',
  },
  {
    key: 'meetings',
    title: 'Schedule a meeting',
    description: 'Put it on the calendar, print the packet, then file the minutes.',
    href: guideHref('meetings-schedule-and-minutes'),
    secondary: { href: '/meetings', label: 'Open Meetings' },
    articleId: 'meetings-schedule-and-minutes',
  },
  {
    key: 'announcement',
    title: 'Send an announcement',
    description: 'One message to residents by email, text and the portal.',
    href: guideHref('communications-send-announcement'),
    secondary: { href: '/communications', label: 'Open Messages' },
    articleId: 'communications-send-announcement',
  },
]

const RESIDENT_GUIDE = guideHref('resident-portal-basics', 'resident')

export const RESIDENT_FIRST_WEEK_STEPS: readonly FirstWeekStep[] = [
  {
    key: 'dues',
    title: 'See and pay your dues',
    description: 'Your balance, every charge, and how to pay with Zelle.',
    href: '/resident/dues',
    secondary: { href: RESIDENT_GUIDE, label: 'How?' },
    articleId: 'resident-portal-basics',
  },
  {
    key: 'arc',
    title: 'Ask to change your home',
    description: 'Paint, a fence, a patio: ask the board before you start.',
    href: '/resident/arc/new',
    secondary: { href: RESIDENT_GUIDE, label: 'How?' },
    articleId: 'resident-portal-basics',
  },
  {
    key: 'request',
    title: 'Report a problem',
    description: 'A repair, a question, or something that needs the board.',
    href: '/resident/tickets/new',
    secondary: { href: RESIDENT_GUIDE, label: 'How?' },
    articleId: 'resident-portal-basics',
  },
  {
    key: 'ask',
    title: 'Ask about the rules',
    description: 'Get an answer from your community’s documents.',
    href: '/resident/ask',
    secondary: { href: RESIDENT_GUIDE, label: 'How?' },
    articleId: 'resident-portal-basics',
  },
]

/** True while `createdAt` is within the org's first FIRST_WEEK_DAYS days. */
export function isWithinFirstWeeks(createdAt: string | null | undefined, now: number): boolean {
  if (!createdAt) return false
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return false
  if (t > now + CLOCK_SKEW_MS) return false
  return now - t < FIRST_WEEK_DAYS * DAY_MS
}

/** The slice of `Storage` used here, so tests can pass a fake. */
export type FirstWeekStorage = Pick<Storage, 'getItem' | 'setItem'>

/** window.localStorage, or null when touching it throws. */
export function browserStorage(): FirstWeekStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function boardFirstWeekKey(orgId: string): string {
  return `hoa.firstWeek.board.${orgId}.dismissed`
}

export function residentFirstWeekKey(scope: string): string {
  return `hoa.firstWeek.resident.${scope}`
}

export function isBoardFirstWeekDismissed(storage: FirstWeekStorage | null, orgId: string): boolean {
  try {
    return storage?.getItem(boardFirstWeekKey(orgId)) === '1'
  } catch {
    return false
  }
}

export function dismissBoardFirstWeek(storage: FirstWeekStorage | null, orgId: string): void {
  try {
    storage?.setItem(boardFirstWeekKey(orgId), '1')
  } catch {
    // Storage blocked: hidden for this page view only.
  }
}

interface ResidentState {
  firstSeen: number
  lastSeen: number
  visits: number
  dismissed: boolean
}

function readResident(storage: FirstWeekStorage, scope: string): ResidentState | null {
  const raw = storage.getItem(residentFirstWeekKey(scope))
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<ResidentState>
    const ok =
      typeof v.firstSeen === 'number' &&
      typeof v.lastSeen === 'number' &&
      typeof v.visits === 'number' &&
      v.visits >= 0 &&
      Number.isFinite(v.firstSeen) &&
      Number.isFinite(v.lastSeen)
    if (!ok) return v.dismissed === true ? { firstSeen: 0, lastSeen: 0, visits: 0, dismissed: true } : null
    return { firstSeen: v.firstSeen!, lastSeen: v.lastSeen!, visits: v.visits!, dismissed: v.dismissed === true }
  } catch {
    return null
  }
}

/**
 * Counts this page view as a visit (unless it is within VISIT_GAP_MS of the
 * last one) and says whether the resident card should show.
 */
export function recordResidentVisit(storage: FirstWeekStorage | null, scope: string, now: number): { show: boolean } {
  if (!storage) return { show: false }
  try {
    const prev = readResident(storage, scope)
    if (prev?.dismissed) return { show: false }
    const next: ResidentState = !prev
      ? { firstSeen: now, lastSeen: now, visits: 1, dismissed: false }
      : now - prev.lastSeen < VISIT_GAP_MS && now >= prev.lastSeen
        ? { ...prev, lastSeen: now }
        : { ...prev, lastSeen: now, visits: prev.visits + 1 }
    storage.setItem(residentFirstWeekKey(scope), JSON.stringify(next))
    const show = next.visits <= RESIDENT_FIRST_VISITS && now - next.firstSeen < FIRST_WEEK_DAYS * DAY_MS
    return { show }
  } catch {
    return { show: false }
  }
}

export function dismissResidentFirstWeek(storage: FirstWeekStorage | null, scope: string, now: number): void {
  try {
    if (!storage) return
    const prev = readResident(storage, scope)
    const next: ResidentState = prev
      ? { ...prev, dismissed: true }
      : { firstSeen: now, lastSeen: now, visits: 0, dismissed: true }
    storage.setItem(residentFirstWeekKey(scope), JSON.stringify(next))
  } catch {
    // Storage blocked: hidden for this page view only.
  }
}
