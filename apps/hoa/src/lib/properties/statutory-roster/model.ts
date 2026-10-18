import { calendarDaysBetween, dayOf } from '@/lib/association-time'

/**
 * Properties P5 (PR-12): the statutory owner roster and voter list.
 *
 * Pure: the loader (load.ts) reads the rows, this decides who owned each
 * home on the as-of date, what they owed then, and what the CSV says. No
 * database, no clock — the caller passes the association's calendar day.
 *
 * Rules, each pinned by model.test.ts:
 *   - An ownership period is [valid_from, valid_to) (sale-rules.ts): on a
 *     settlement day the buyer owns and the seller does not.
 *   - A home with no ownership history at all falls back to the owner on
 *     the home's own record, labelled as such (its dates are unknown).
 *   - The mailing address is a "Mailing address: …" note (written by the
 *     import and by Record a sale) on a current owner household or on the
 *     unit; otherwise the property address, labelled as the fallback.
 *     FL § 720.303(4)(a)7 makes the property address the designated
 *     mailing address unless the owner asked in writing for another.
 *   - Days past due: the oldest charge due BEFORE the date that was still
 *     unpaid ON the date, counting only payments made by the date (in the
 *     association's zone). Unapplied unit payments cover the oldest
 *     charges first. Waived and written-off charges never count.
 *   - Voter list: one vote per home (no voting rule is stored). Florida
 *     homes more than 90 days past due are flagged "may be suspended":
 *     § 720.305(4) lets the association suspend, and § 720.305(5) needs a
 *     board vote at a properly noticed meeting, so nothing is suspended
 *     here. California homes are never flagged.
 */

export type RosterKind = 'owners' | 'voters'

export interface RosterHome {
  propertyId: string
  address: string
  unitNumber: string | null
  /** The canonical unit (resolve.ts), whose ownerships are read. */
  unitId: string | null
  /** Every unit bridged to the home; charges on any of them count. */
  unitIds: string[]
  lotNumber: string | null
  unitNotes: string | null
  /** Two-letter state of the home's association (governing law). */
  state: string | null
  /** The owner fields on the home's own record (hoa_properties). */
  recordOwner: { name: string | null; email: string | null; phone: string | null } | null
}

export interface RosterOwnership {
  unitId: string
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  ownershipPct: number | null
  validFrom: string
  validTo: string | null
}

export interface RosterResident {
  propertyId: string
  role: string
  notes: string | null
  movedOutAt: string | null
}

export interface RosterCharge {
  id: string
  unitId: string
  amount: number
  dueDate: string
  status: string
}

export interface RosterPayment {
  assessmentId: string | null
  unitId: string | null
  amount: number
  paidAt: string
}

export interface RosterInput {
  homes: RosterHome[]
  ownerships: RosterOwnership[]
  residents: RosterResident[]
  /** Only read for the voter list; empty for the owner roster. */
  charges: RosterCharge[]
  payments: RosterPayment[]
  timeZone: string
}

export interface RosterOwner {
  name: string
  email: string | null
  phone: string | null
  share: string
  /** YYYY-MM-DD, or null when the owner comes from the home record. */
  since: string | null
}

export type OwnerSource = 'ownership_history' | 'home_record' | 'none'

export interface OwnerRosterRow {
  propertyId: string
  address: string
  unitNumber: string | null
  lotNumber: string | null
  state: string | null
  owners: RosterOwner[]
  ownerSource: OwnerSource
  /** "Shares add up to 80%", or null when they add up (or are not recorded). */
  sharesWarning: string | null
  mailing: { text: string; source: 'on_file' | 'property_address' }
}

export interface OwnerRoster {
  asOf: string
  rows: OwnerRosterRow[]
  counts: { homes: number; owners: number; noOwner: number; fromHomeRecord: number; mailingOnFile: number }
}

export interface Delinquency {
  daysPastDue: number
  oldestDueDate: string | null
  pastDueCents: number
}

export type VoterFlag = 'none' | 'may_be_suspended'

export interface VoterRow extends OwnerRosterRow {
  votes: number
  delinquency: Delinquency
  flag: VoterFlag
}

export interface VoterList {
  asOf: string
  rows: VoterRow[]
  votingRule: { kind: 'one_per_home'; stored: false }
  counts: { homes: number; totalVotes: number; noOwner: number; mayBeSuspended: number; fromHomeRecord: number }
  /** Florida only (§ 720.306(1)(a)); null elsewhere. */
  quorum: {
    state: 'FL'
    pct: number
    totalVotes: number
    needed: number
    ifAllFlaggedSuspended: { totalVotes: number; needed: number }
  } | null
}

/** More than this many days past due may be suspended in Florida. */
export const FL_SUSPENSION_DAYS = 90
/** § 720.306(1)(a): 30% of the voting interests unless the bylaws set lower. */
export const FL_QUORUM_PCT = 30

const NEVER_OWED = new Set(['waived', 'written_off', 'void', 'voided', 'cancelled', 'canceled'])
const MAILING_NOTE = /Mailing address:\s*([^·\n]+)/i

const day = (s: string) => s.slice(0, 10)

export function isOwnerOn(o: { validFrom: string; validTo: string | null }, asOf: string): boolean {
  return day(o.validFrom) <= asOf && (o.validTo == null || day(o.validTo) > asOf)
}

export function shareLabel(pct: number | null, ownerCount: number): string {
  if (pct == null) return ownerCount === 1 ? '100%' : 'Share not recorded'
  return `${Number(pct.toFixed(2))}%`
}

export function mailingAddressFromNotes(notes: string | null | undefined): string | null {
  const m = notes ? MAILING_NOTE.exec(notes) : null
  const text = m?.[1]?.trim()
  return text ? text : null
}

function homeLabel(h: { address: string; unitNumber: string | null }): string {
  return h.unitNumber ? `${h.address}, Unit ${h.unitNumber}` : h.address
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (k == null) continue
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

function ownersFor(home: RosterHome, history: RosterOwnership[], asOf: string): { owners: RosterOwner[]; source: OwnerSource; sharesWarning: string | null } {
  if (history.length === 0) {
    const name = home.recordOwner?.name?.trim()
    if (!name) return { owners: [], source: 'none', sharesWarning: null }
    return {
      owners: [{ name, email: home.recordOwner?.email ?? null, phone: home.recordOwner?.phone ?? null, share: '100%', since: null }],
      source: 'home_record',
      sharesWarning: null,
    }
  }
  const current = history
    .filter((o) => isOwnerOn(o, asOf))
    .sort(
      (a, b) =>
        (b.ownershipPct ?? -1) - (a.ownershipPct ?? -1) ||
        day(a.validFrom).localeCompare(day(b.validFrom)) ||
        (a.ownerName ?? '').localeCompare(b.ownerName ?? ''),
    )
  if (current.length === 0) return { owners: [], source: 'none', sharesWarning: null }
  const owners = current.map((o) => ({
    name: o.ownerName?.trim() || 'Name not recorded',
    email: o.ownerEmail?.trim() || null,
    phone: o.ownerPhone?.trim() || null,
    share: shareLabel(o.ownershipPct, current.length),
    since: day(o.validFrom),
  }))
  const recorded = current.map((o) => o.ownershipPct).filter((p): p is number => p != null)
  const total = Number(recorded.reduce((s, p) => s + p, 0).toFixed(2))
  const sharesWarning = recorded.length > 0 && Math.abs(total - 100) > 0.01 ? `Shares add up to ${total}%` : null
  return { owners, source: 'ownership_history', sharesWarning }
}

function mailingFor(home: RosterHome, residents: RosterResident[], asOf: string): OwnerRosterRow['mailing'] {
  for (const r of residents) {
    if (r.role !== 'owner') continue
    if (r.movedOutAt && day(r.movedOutAt) <= asOf) continue
    const text = mailingAddressFromNotes(r.notes)
    if (text) return { text, source: 'on_file' }
  }
  const fromUnit = mailingAddressFromNotes(home.unitNotes)
  if (fromUnit) return { text: fromUnit, source: 'on_file' }
  return { text: homeLabel(home), source: 'property_address' }
}

function sortHomes<T extends { address: string; unitNumber: string | null }>(rows: T[]): T[] {
  return rows.sort(
    (a, b) =>
      a.address.localeCompare(b.address, 'en', { numeric: true, sensitivity: 'base' }) ||
      (a.unitNumber ?? '').localeCompare(b.unitNumber ?? '', 'en', { numeric: true }),
  )
}

export function buildOwnerRoster(input: RosterInput, asOf: string): OwnerRoster {
  const byUnit = groupBy(input.ownerships, (o) => o.unitId)
  const residentsByHome = groupBy(input.residents, (r) => r.propertyId)
  const rows = sortHomes(
    input.homes.map((home): OwnerRosterRow => {
      const history = home.unitId ? (byUnit.get(home.unitId) ?? []) : []
      const { owners, source, sharesWarning } = ownersFor(home, history, asOf)
      return {
        propertyId: home.propertyId,
        address: home.address,
        unitNumber: home.unitNumber,
        lotNumber: home.lotNumber,
        state: home.state,
        owners,
        ownerSource: source,
        sharesWarning,
        mailing: mailingFor(home, residentsByHome.get(home.propertyId) ?? [], asOf),
      }
    }),
  )
  return {
    asOf,
    rows,
    counts: {
      homes: rows.length,
      owners: rows.reduce((n, r) => n + r.owners.length, 0),
      noOwner: rows.filter((r) => r.owners.length === 0).length,
      fromHomeRecord: rows.filter((r) => r.ownerSource === 'home_record').length,
      mailingOnFile: rows.filter((r) => r.mailing.source === 'on_file').length,
    },
  }
}

const cents = (n: number) => Math.round(Number(n) * 100)

export function delinquencyAsOf(charges: readonly RosterCharge[], payments: readonly RosterPayment[], asOf: string, timeZone: string): Delinquency {
  const paidByDate = payments.filter((p) => {
    const d = dayOf(p.paidAt, timeZone)
    return d != null && d <= asOf
  })
  const applied = new Map<string, number>()
  let unapplied = 0
  for (const p of paidByDate) {
    if (p.assessmentId) applied.set(p.assessmentId, (applied.get(p.assessmentId) ?? 0) + cents(p.amount))
    else unapplied += cents(p.amount)
  }
  const open = charges
    .filter((c) => !NEVER_OWED.has(c.status) && day(c.dueDate) < asOf)
    .map((c) => ({ due: day(c.dueDate), owed: cents(c.amount) - (applied.get(c.id) ?? 0) }))
    .filter((c) => c.owed > 0)
    .sort((a, b) => a.due.localeCompare(b.due))
  for (const c of open) {
    const take = Math.min(c.owed, Math.max(unapplied, 0))
    c.owed -= take
    unapplied -= take
  }
  const still = open.filter((c) => c.owed > 0)
  if (still.length === 0) return { daysPastDue: 0, oldestDueDate: null, pastDueCents: 0 }
  const oldest = still[0].due
  return {
    daysPastDue: calendarDaysBetween(oldest, asOf),
    oldestDueDate: oldest,
    pastDueCents: still.reduce((s, c) => s + c.owed, 0),
  }
}

/** Florida only: more than 90 days past due. Never a suspension, only a flag. */
export function voterFlag(state: string | null, d: Delinquency): VoterFlag {
  return state?.toUpperCase() === 'FL' && d.daysPastDue > FL_SUSPENSION_DAYS ? 'may_be_suspended' : 'none'
}

export function buildVoterList(input: RosterInput, asOf: string): VoterList {
  const roster = buildOwnerRoster(input, asOf)
  const homeById = new Map(input.homes.map((h) => [h.propertyId, h]))
  const chargesByUnit = groupBy(input.charges, (c) => c.unitId)
  const rows = roster.rows.map((r): VoterRow => {
    const home = homeById.get(r.propertyId)
    const unitIds = new Set(home?.unitIds ?? [])
    const charges = [...unitIds].flatMap((u) => chargesByUnit.get(u) ?? [])
    const chargeIds = new Set(charges.map((c) => c.id))
    // Applied payments follow their charge; unapplied ones their unit.
    const payments = input.payments.filter((p) => (p.assessmentId ? chargeIds.has(p.assessmentId) : p.unitId != null && unitIds.has(p.unitId)))
    const delinquency = delinquencyAsOf(charges, payments, asOf, input.timeZone)
    return { ...r, votes: 1, delinquency, flag: voterFlag(r.state, delinquency) }
  })
  const totalVotes = rows.reduce((n, r) => n + r.votes, 0)
  const mayBeSuspended = rows.filter((r) => r.flag === 'may_be_suspended').length
  const allFlorida = rows.length > 0 && rows.every((r) => r.state?.toUpperCase() === 'FL')
  const needed = (n: number) => Math.ceil((n * FL_QUORUM_PCT) / 100)
  return {
    asOf,
    rows,
    votingRule: { kind: 'one_per_home', stored: false },
    counts: {
      homes: rows.length,
      totalVotes,
      noOwner: roster.counts.noOwner,
      mayBeSuspended,
      fromHomeRecord: roster.counts.fromHomeRecord,
    },
    quorum: allFlorida
      ? {
          state: 'FL',
          pct: FL_QUORUM_PCT,
          totalVotes,
          needed: needed(totalVotes),
          ifAllFlaggedSuspended: { totalVotes: totalVotes - mayBeSuspended, needed: needed(totalVotes - mayBeSuspended) },
        }
      : null,
  }
}

// ─── CSV ───────────────────────────────────────────────────────────────

const OWNER_SOURCE_LABEL: Record<OwnerSource, string> = {
  ownership_history: 'Ownership history',
  home_record: 'Home record (no ownership dates on file)',
  none: 'No owner on record on this date',
}

export const MAILING_SOURCE_LABEL: Record<OwnerRosterRow['mailing']['source'], string> = {
  on_file: 'Mailing address on file',
  property_address: 'Property address (no other mailing address on file)',
}

export const FLAG_LABEL: Record<VoterFlag, string> = {
  none: '',
  may_be_suspended: 'More than 90 days past due: may be suspended only if the board voted the suspension',
}

const ownersCell = (owners: RosterOwner[]) => owners.map((o) => `${o.name} (${o.share})`).join('; ')
const contactCell = (owners: RosterOwner[], pick: (o: RosterOwner) => string | null) =>
  owners
    .filter((o) => pick(o))
    .map((o) => `${o.name}: ${pick(o)}`)
    .join('; ')

export function ownerRosterCsv(roster: OwnerRoster): { header: string[]; rows: unknown[][] } {
  return {
    header: [
      'Property address',
      'Unit',
      'Lot',
      'Owners (share)',
      'Owner since',
      'Mailing address',
      'Mailing address source',
      'Owner emails',
      'Owner phones',
      'Owner source',
    ],
    rows: roster.rows.map((r) => [
      r.address,
      r.unitNumber ?? '',
      r.lotNumber ?? '',
      ownersCell(r.owners),
      r.owners.map((o) => o.since ?? 'unknown').join('; '),
      r.mailing.text,
      MAILING_SOURCE_LABEL[r.mailing.source],
      contactCell(r.owners, (o) => o.email),
      contactCell(r.owners, (o) => o.phone),
      OWNER_SOURCE_LABEL[r.ownerSource],
    ]),
  }
}

export function voterListCsv(list: VoterList): { header: string[]; rows: unknown[][] } {
  return {
    header: ['Property address', 'Unit', 'Lot', 'Votes', 'Eligible owners', 'Days past due', 'Past due', 'Flag'],
    rows: list.rows.map((r) => [
      r.address,
      r.unitNumber ?? '',
      r.lotNumber ?? '',
      r.votes,
      r.owners.length > 0 ? ownersCell(r.owners) : OWNER_SOURCE_LABEL.none,
      r.delinquency.daysPastDue,
      (r.delinquency.pastDueCents / 100).toFixed(2),
      FLAG_LABEL[r.flag],
    ]),
  }
}

// ─── URL params ────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarDate(s: string): boolean {
  if (!DATE_ONLY.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function parseRosterParams(
  raw: { kind?: string | string[]; asOf?: string | string[] },
  today: string,
): { kind: RosterKind | null; asOf: string; dateError: string | null } {
  const k = first(raw.kind)
  const kind: RosterKind | null = k === 'owners' || k === 'voters' ? k : null
  const a = first(raw.asOf)?.trim()
  if (!a) return { kind, asOf: today, dateError: null }
  if (!isCalendarDate(a)) return { kind, asOf: today, dateError: 'That date does not exist. Showing today instead.' }
  return { kind, asOf: a, dateError: null }
}

export function rosterFilename(kind: RosterKind, asOf: string): string {
  return `${kind === 'owners' ? 'owner-roster' : 'voter-list'}-as-of-${asOf}.csv`
}

/** The page's URL for a choice (the form submits the same params). */
export function rosterHref(kind: RosterKind | null, asOf?: string): string {
  const q = new URLSearchParams()
  if (kind) q.set('kind', kind)
  if (asOf) q.set('asOf', asOf)
  const s = q.toString()
  return `/properties/roster${s ? `?${s}` : ''}`
}

export function rosterCsvHref(kind: RosterKind, asOf: string): string {
  return `/properties/roster/export?${new URLSearchParams({ kind, asOf }).toString()}`
}

// ─── One report, either kind ───────────────────────────────────────────

export type RosterReport = { kind: 'owners'; roster: OwnerRoster } | { kind: 'voters'; list: VoterList }

export function buildReport(kind: RosterKind, input: RosterInput, asOf: string): RosterReport {
  return kind === 'owners' ? { kind, roster: buildOwnerRoster(input, asOf) } : { kind, list: buildVoterList(input, asOf) }
}

/** Counts for the audit row: numbers only. */
export function reportCounts(r: RosterReport): { homes: number; owners?: number; noOwner: number; mayBeSuspended?: number } {
  return r.kind === 'owners'
    ? { homes: r.roster.counts.homes, owners: r.roster.counts.owners, noOwner: r.roster.counts.noOwner }
    : { homes: r.list.counts.homes, noOwner: r.list.counts.noOwner, mayBeSuspended: r.list.counts.mayBeSuspended }
}

/** The CSV's header and cells; the route writes them with lib/csv.ts. */
export function reportTable(r: RosterReport): { header: string[]; rows: unknown[][] } {
  return r.kind === 'owners' ? ownerRosterCsv(r.roster) : voterListCsv(r.list)
}
