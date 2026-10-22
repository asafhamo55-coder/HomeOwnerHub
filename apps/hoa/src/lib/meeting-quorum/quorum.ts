/**
 * BL-122 — the annual meeting quorum kit.
 *
 * For a meeting of the members (meeting_type 'annual', or a 'special'
 * meeting the board confirms is a members' meeting): a printable sign-in
 * sheet, a printable proxy form per home, a "no proxy yet" chase list and
 * a live quorum counter. Board-facing only: nothing here is ever sent to a
 * resident. No e-voting (BL-023, M2).
 *
 * STORAGE. No migration: there is no proxy or check-in table, and
 * hoa_meeting_minutes has no metadata column (`attendees` is the minutes'
 * own free-text list, shown and edited on the meeting page; `motions` and
 * `action_items` belong to the minutes). So the kit lives in the primary
 * association's compliance_settings[QUORUM_KITS_KEY], keyed by meeting id,
 * next to arc_decision_clock and pay_by_zelle. Every write keeps the other
 * keys.
 *
 * WHY SIGNED. Same reason as lib/arc-review/clock.ts: until 0063 is applied
 * any org member can PATCH compliance_settings with their own session, so
 * only a kit whose HMAC verifies with the server-only secret is the
 * board's. A kit that does not verify reads as empty and the page says so.
 *
 * LIMITS (the price of no migration):
 *   - What is stored is property ids, a proxy kind and timestamps — never a
 *     name, email, phone or proxy holder. compliance_settings may be
 *     readable by any org member, so nothing personal goes in it.
 *   - Last write wins: two board members tapping at the same instant can
 *     overwrite each other's tap (the whole compliance_settings object is
 *     read, changed and written back). The page re-reads after each save.
 *   - At most MAX_STORED_KITS meetings keep a kit; the oldest-updated kit
 *     is dropped when a new one is saved.
 *   - One vote per home: no voting-weight rule is stored (the statutory
 *     roster says the same). Ownership shares are printed where recorded.
 *
 * QUORUM %. Entered by the board. The governing-docs brain (W1) does not
 * extract a quorum figure, so there is no parsed default: the field starts
 * blank and is required before the counter shows "needed". The statute
 * figure (FL § 720.306(1)(a), 30% unless the bylaws set lower; GA
 * § 44-3-228, more than one-third unless the instrument or bylaws say
 * otherwise) is shown as context, and the board may pick it with one tap
 * (./law.ts `statuteQuorum`); it is never applied on its own.
 *
 * Pure, and safe in the browser. Signing and storage: ./store.ts (node:crypto).
 */

/** A sanity cap on stored home entries per kit (well above any HOA we serve). */
export const MAX_KIT_HOMES = 5000


export type ProxyKind = 'general' | 'limited'

export interface HomeEntry {
  /** Proxy received: its kind and when the board recorded it. */
  proxy: { kind: ProxyKind; at: string } | null
  /** Checked in in person at the meeting, and when. */
  presentAt: string | null
}

export interface QuorumKit {
  /** The board confirmed this (special) meeting is a meeting of the members. */
  memberMeeting: boolean
  /** Percent of the total votes needed, entered by the board; null until it is. */
  quorumPct: number | null
  homes: Record<string, HomeEntry>
}

export const EMPTY_KIT: QuorumKit = { memberMeeting: false, quorumPct: null, homes: {} }

// ─── Validation ──────────────────────────────────────────────────────

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 0 < pct ≤ 100, at most two decimals. */
export function isValidQuorumPct(pct: unknown): pct is number {
  return (
    typeof pct === 'number' &&
    Number.isFinite(pct) &&
    pct > 0 &&
    pct <= 100 &&
    Math.abs(Math.round(pct * 100) - pct * 100) < 1e-9
  )
}

/** Parses the board's typed figure ("25", "33.33", "25%"); null if invalid. */
export function parseQuorumPct(raw: unknown): number | null {
  if (typeof raw === 'number') return isValidQuorumPct(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/%$/, '').trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return isValidQuorumPct(n) ? n : null
}

export function isProxyKind(v: unknown): v is ProxyKind {
  return v === 'general' || v === 'limited'
}

export function isIsoish(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
}

// ─── Changes (pure) ──────────────────────────────────────────────────

export type KitChange =
  | { kind: 'quorum_pct'; pct: number | null }
  | { kind: 'member_meeting'; value: boolean }
  | { kind: 'proxy'; propertyId: string; proxy: ProxyKind | null }
  | { kind: 'present'; propertyId: string; present: boolean }

/** The kit after one change. `now` is an ISO instant. Never mutates. */
export function applyKitChange(kit: QuorumKit, change: KitChange, now: string): QuorumKit {
  switch (change.kind) {
    case 'quorum_pct':
      return { ...kit, quorumPct: change.pct }
    case 'member_meeting':
      return { ...kit, memberMeeting: change.value }
    case 'proxy': {
      const prev = kit.homes[change.propertyId] ?? { proxy: null, presentAt: null }
      const proxy = change.proxy ? { kind: change.proxy, at: prev.proxy?.kind === change.proxy ? prev.proxy.at : now } : null
      return { ...kit, homes: withEntry(kit.homes, change.propertyId, { ...prev, proxy }) }
    }
    case 'present': {
      const prev = kit.homes[change.propertyId] ?? { proxy: null, presentAt: null }
      const presentAt = change.present ? (prev.presentAt ?? now) : null
      return { ...kit, homes: withEntry(kit.homes, change.propertyId, { ...prev, presentAt }) }
    }
  }
}

function withEntry(homes: Record<string, HomeEntry>, id: string, entry: HomeEntry): Record<string, HomeEntry> {
  const next = { ...homes }
  if (entry.proxy === null && entry.presentAt === null) delete next[id]
  else next[id] = entry
  return next
}

// ─── Eligibility ─────────────────────────────────────────────────────

export type KitEligibility = 'annual' | 'special_confirmed' | 'special_unconfirmed' | 'not_member_meeting'

/** Annual meetings always; a special meeting once the board confirms it is the members'. */
export function kitEligibility(meetingType: string | null, kit: Pick<QuorumKit, 'memberMeeting'>): KitEligibility {
  if (meetingType === 'annual') return 'annual'
  if (meetingType === 'special') return kit.memberMeeting ? 'special_confirmed' : 'special_unconfirmed'
  return 'not_member_meeting'
}

export function kitIsOpen(e: KitEligibility): boolean {
  return e === 'annual' || e === 'special_confirmed'
}

/** "Annual meeting" / "Special meeting of the members". */
export function kitMeetingLabel(meetingType: string | null): string {
  return meetingType === 'annual' ? 'Annual meeting' : 'Special meeting of the members'
}

// ─── Quorum math ─────────────────────────────────────────────────────

export interface KitHome {
  propertyId: string
  /** One per home: no voting-weight rule is stored. */
  votes: number
}

export interface QuorumCount {
  totalHomes: number
  totalVotes: number
  /** Votes checked in in person. */
  presentVotes: number
  /** Votes represented by a proxy only (the owner did not also check in). */
  proxyOnlyVotes: number
  /** present ∪ proxy, each home once. */
  representedVotes: number
  proxiesReceived: number
  pct: number | null
  /** ceil(totalVotes × pct / 100); null until the board enters a percent. */
  needed: number | null
  reached: boolean | null
  shortBy: number | null
  /** Stored entries for homes no longer on the roster; not counted. */
  ignoredEntries: number
}

export function quorumNeeded(totalVotes: number, pct: number): number {
  // Integer arithmetic on hundredths so 33.33% of 300 doesn't float to 99.99000001.
  return Math.ceil((totalVotes * Math.round(pct * 100)) / 10000)
}

export function countQuorum(homes: readonly KitHome[], kit: QuorumKit): QuorumCount {
  const onRoster = new Set(homes.map((h) => h.propertyId))
  let totalVotes = 0
  let presentVotes = 0
  let proxyOnlyVotes = 0
  let proxiesReceived = 0
  for (const h of homes) {
    totalVotes += h.votes
    const e = kit.homes[h.propertyId]
    if (!e) continue
    if (e.proxy) proxiesReceived += 1
    if (e.presentAt) presentVotes += h.votes
    else if (e.proxy) proxyOnlyVotes += h.votes
  }
  const ignoredEntries = Object.keys(kit.homes).filter((id) => !onRoster.has(id)).length
  const representedVotes = presentVotes + proxyOnlyVotes
  const pct = kit.quorumPct
  const needed = pct === null ? null : quorumNeeded(totalVotes, pct)
  return {
    totalHomes: homes.length,
    totalVotes,
    presentVotes,
    proxyOnlyVotes,
    representedVotes,
    proxiesReceived,
    pct,
    needed,
    reached: needed === null ? null : totalVotes > 0 && representedVotes >= needed,
    shortBy: needed === null ? null : Math.max(0, needed - representedVotes),
    ignoredEntries,
  }
}

/** Homes with no proxy and no in-person check-in, in roster order. */
export function chaseList<T extends KitHome>(homes: readonly T[], kit: QuorumKit): T[] {
  return homes.filter((h) => {
    const e = kit.homes[h.propertyId]
    return !e || (e.proxy === null && e.presentAt === null)
  })
}

// ─── Printable rows (names and addresses only) ───────────────────────

const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONEISH = /(\+?\d[\d\s().-]{6,}\d)/

/**
 * A name fit for paper: never an email or phone number, even when one was
 * typed into the name field. Anything that looks like one is replaced.
 */
export function printableName(name: string | null | undefined): string {
  const t = (name ?? '').trim()
  if (!t || EMAILISH.test(t) || PHONEISH.test(t)) return 'Name not recorded'
  return t
}

export interface RosterLikeRow {
  propertyId: string
  address: string
  unitNumber: string | null
  lotNumber: string | null
  owners: Array<{ name: string; share: string; email?: string | null; phone?: string | null }>
}

/** What the sign-in sheet and the proxy forms print. No email, no phone. */
export interface PrintableHome {
  propertyId: string
  home: string
  lot: string | null
  owners: Array<{ name: string; share: string }>
  votes: number
}

export function homeLabel(r: { address: string; unitNumber: string | null }): string {
  const a = r.address.trim() || 'Address not recorded'
  return r.unitNumber ? `${a}, Unit ${r.unitNumber}` : a
}

export function printableHomes(rows: readonly RosterLikeRow[]): PrintableHome[] {
  return rows.map((r) => ({
    propertyId: r.propertyId,
    home: homeLabel(r),
    lot: r.lotNumber,
    // Only the two fields we name are copied: email and phone never reach paper.
    owners: r.owners.map((o) => ({ name: printableName(o.name), share: o.share })),
    votes: 1,
  }))
}

/** Whether any owner has a recorded share other than the single-owner 100%. */
export function sharesWorthPrinting(homes: readonly PrintableHome[]): boolean {
  return homes.some((h) => h.owners.length > 1 || h.owners.some((o) => o.share !== '100%'))
}

// ─── Reminder text (copied by the board; never sent from here) ───────

export function proxyReminderText(input: { associationName: string | null; meetingDate: string; meetingLabel: string }): {
  subject: string
  body: string
} {
  const who = input.associationName?.trim() || 'the association'
  return {
    subject: `Reminder: please return your proxy for the ${input.meetingLabel.toLowerCase()} on ${input.meetingDate}`,
    body: [
      `The ${input.meetingLabel.toLowerCase()} of ${who} is on ${input.meetingDate}. The meeting can only do business if enough owners are present or represented by proxy (the quorum).`,
      'We have not yet received a proxy from your home. If you plan to attend in person, no proxy is needed. If you cannot attend, please fill in, sign and date the proxy form and return it to a board member before the meeting.',
      'A proxy only lets the person you name vote on your behalf at this meeting, and you can revoke it at any time before it is used.',
      'Thank you for helping the meeting reach quorum.',
    ].join('\n\n'),
  }
}
