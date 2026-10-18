// The property page's derived views (P2 "360"): aging, people, the
// "Needs action" strip, the merged activity timeline and the waiting-list
// position. Pure — no Supabase, React or Next — so vitest's node harness
// runs it, and so the page and its previews compute exactly the same thing.
//
// Inputs are the rows property-360.ts reads; every function takes "today"
// or "now" explicitly so a test can pin it.

import { cureBy, cureState, isClosedViolation, type CureSource } from '@/lib/violation-cure'
import { collectionStatusLabel, isTerminal, type CollectionStatus } from '@/lib/collections/statuses'
import type { PropertyResidentRow } from '@/lib/property-residents'
import type { PropertyEventRow } from '@/lib/property-events'
import { formatDay } from '@/lib/money/format'
import { ownershipStatus } from './sale-rules'

// ─── Row shapes (as read) ────────────────────────────────────────────

export interface ViolationRow extends CureSource {
  id: string
  description: string
  severity: string | null
  resolved_at?: string | null
}

export interface OpenAssessmentRow {
  id: string
  due_date: string
  amount: number | string
  status: string
  assessment_type: string
  payments: { amount: number | string }[] | null
}

export interface LedgerAssessmentRow {
  id: string
  due_date: string
  amount: number | string
  status: string
  assessment_type: string
}

export interface PaymentRow {
  id: string
  amount: number | string
  paid_at: string
  payment_method: string
}

export interface PaymentPlanRow {
  id: string
  status: string
  installment_amount: number | string
  installment_count: number
  total_amount: number | string
  start_date: string
  created_at: string
}

export interface CollectionCaseRow {
  id: string
  status: CollectionStatus
  opened_on: string
  closed_on: string | null
}

export interface ArcRow {
  id: string
  summary: string
  category: string
  status: string
  submitted_at: string
  board_response_at: string | null
}

export interface ThreadRow {
  id: string
  subject: string | null
  status: string
  lastMessageAt: string | null
}

export interface NoticeRow {
  id: string
  communicationId: string
  subject: string
  category: string | null
  channel: string
  deliveryStatus: string
  at: string
}

export interface OwnershipRow {
  id: string
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  owner_user_id: string | null
  ownership_pct: number | null
  valid_from: string
  valid_to: string | null
}

export interface TenancyRow {
  id: string
  tenant_name: string | null
  tenant_email: string | null
  tenant_phone: string | null
  tenant_user_id: string | null
  lease_start: string
  lease_end: string | null
  status: string
}

// ─── Money: aging ────────────────────────────────────────────────────

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'

export const AGING_LABEL: Record<AgingBucket, string> = {
  current: 'Not yet due',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
}

const BUCKETS: readonly AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

const dayMs = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))

/** Whole days from `day` to `today` (both 'YYYY-MM-DD'); positive = past. */
export function daysPast(day: string, today: string): number {
  return Math.round((dayMs(today) - dayMs(day)) / 86_400_000)
}

export function agingBucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

export interface Aging {
  total: number
  buckets: Record<AgingBucket, number>
  /** The bucket of the oldest unpaid charge, or null when nothing is owed. */
  oldest: AgingBucket | null
}

/**
 * What is owed, by how late it is. Same rule as the list view's balance
 * (hoa_property_list_v): open and partial charges, amount less payments.
 */
export function agingBuckets(rows: readonly OpenAssessmentRow[], today: string): Aging {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>
  let total = 0
  let oldest: AgingBucket | null = null
  for (const a of rows) {
    const paid = (a.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const owed = Math.round((Number(a.amount) - paid) * 100) / 100
    if (owed <= 0) continue
    const b = agingBucketFor(daysPast(a.due_date, today))
    buckets[b] = Math.round((buckets[b] + owed) * 100) / 100
    total = Math.round((total + owed) * 100) / 100
    if (oldest === null || BUCKETS.indexOf(b) > BUCKETS.indexOf(oldest)) oldest = b
  }
  return { total, buckets, oldest }
}

// ─── People ──────────────────────────────────────────────────────────

export interface Owner {
  key: string
  name: string | null
  email: string | null
  phone: string | null
  primary: boolean
  /** True = has a portal login; false = none; null = not knowable here. */
  portal: boolean | null
  since: string | null
  until: string | null
  pct: number | null
  /** 'ownership' = the lot record; 'property' = only the owner fields on the home. */
  source: 'ownership' | 'property'
}

export interface LeaseTenant {
  key: string
  name: string | null
  email: string | null
  phone: string | null
  portal: boolean
  leaseStart: string
  leaseEnd: string | null
}

export interface People {
  owners: Owner[]
  previousOwners: Owner[]
  /** Tenants on an active lease who are NOT already listed as residents. */
  leaseTenants: LeaseTenant[]
  residents: PropertyResidentRow[]
  movedOut: PropertyResidentRow[]
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function isCurrent(from: string, to: string | null, today: string): boolean {
  return from.slice(0, 10) <= today && (to === null || to.slice(0, 10) >= today)
}

/**
 * Who belongs to this home. Owners come from `ownerships` (the lot
 * record, which knows co-owners and sale dates); when there is none the
 * home's own owner fields stand in, marked as such. The primary owner is
 * the one the home's owner fields name (where notices go), else the
 * first. Residents are the board's own list (property_residents).
 */
export function buildPeople(input: {
  property: { owner_name: string | null; owner_email: string | null; owner_phone: string | null }
  ownerships: readonly OwnershipRow[]
  tenancies: readonly TenancyRow[]
  residents: readonly PropertyResidentRow[]
  today: string
}): People {
  const { property, today } = input
  const toOwner = (o: OwnershipRow): Owner => ({
    key: o.id,
    name: o.owner_name,
    email: o.owner_email,
    phone: o.owner_phone,
    primary: false,
    portal: o.owner_user_id !== null,
    since: o.valid_from,
    until: o.valid_to,
    pct: o.ownership_pct,
    source: 'ownership',
  })
  // Ownership periods are [valid_from, valid_to): on a sale's settlement
  // day the seller is a previous owner and the buyer the owner — not two
  // co-owners (lib/properties/sale.ts ownershipStatus).
  const current = input.ownerships.filter((o) => ownershipStatus(o, today) === 'current').map(toOwner)
  const previousOwners = input.ownerships
    .filter((o) => ownershipStatus(o, today) === 'past')
    .sort((a, b) => (b.valid_to ?? '').localeCompare(a.valid_to ?? '') || b.valid_from.localeCompare(a.valid_from))
    .map(toOwner)

  let owners = current
  if (owners.length === 0 && (property.owner_name?.trim() || property.owner_email?.trim())) {
    owners = [
      {
        key: 'property-owner',
        name: property.owner_name,
        email: property.owner_email,
        phone: property.owner_phone,
        primary: true,
        portal: null,
        since: null,
        until: null,
        pct: null,
        source: 'property',
      },
    ]
  } else if (owners.length > 0) {
    const match = owners.findIndex(
      (o) =>
        (norm(property.owner_email) !== '' && norm(o.email) === norm(property.owner_email)) ||
        (norm(property.owner_name) !== '' && norm(o.name) === norm(property.owner_name)),
    )
    const primaryIndex = match === -1 ? 0 : match
    owners = owners.map((o, i) => ({ ...o, primary: i === primaryIndex }))
    // Primary first, the rest in the order read.
    owners = [owners[primaryIndex]!, ...owners.filter((_, i) => i !== primaryIndex)]
  }

  const residents = input.residents.filter((r) => r.moved_out_at === null)
  const movedOut = input.residents.filter((r) => r.moved_out_at !== null)
  const listed = (name: string | null, email: string | null) =>
    residents.some(
      (r) => (norm(email) !== '' && norm(r.email) === norm(email)) || (norm(name) !== '' && norm(r.full_name) === norm(name)),
    )
  const leaseTenants = input.tenancies
    .filter((t) => t.status === 'active' && isCurrent(t.lease_start, t.lease_end, today))
    .filter((t) => !listed(t.tenant_name, t.tenant_email))
    .map((t) => ({
      key: t.id,
      name: t.tenant_name,
      email: t.tenant_email,
      phone: t.tenant_phone,
      portal: t.tenant_user_id !== null,
      leaseStart: t.lease_start,
      leaseEnd: t.lease_end,
    }))

  return { owners, previousOwners, leaseTenants, residents, movedOut }
}

// ─── Leases ──────────────────────────────────────────────────────────

/** The active lease covering today, else the most recent one, else null. */
export function currentLease(tenancies: readonly TenancyRow[], today: string): { lease: TenancyRow; current: boolean } | null {
  const active = tenancies.find((t) => t.status === 'active' && isCurrent(t.lease_start, t.lease_end, today))
  if (active) return { lease: active, current: true }
  const latest = [...tenancies].sort((a, b) => (a.lease_start < b.lease_start ? 1 : -1))[0]
  return latest ? { lease: latest, current: false } : null
}

/**
 * Where this home stands in the association's lease waiting list: 1 =
 * next. Queue order is request time (then id), the order /leases shows.
 */
export function waitingPosition(
  queue: readonly { id: string; property_id: string; requested_at: string }[],
  propertyId: string,
): { position: number; of: number; requestedAt: string } | null {
  const ordered = [...queue].sort((a, b) => a.requested_at.localeCompare(b.requested_at) || a.id.localeCompare(b.id))
  const i = ordered.findIndex((e) => e.property_id === propertyId)
  return i === -1 ? null : { position: i + 1, of: ordered.length, requestedAt: ordered[i]!.requested_at }
}

// ─── Needs action ────────────────────────────────────────────────────

export interface ActionItem {
  key: 'violations' | 'balance' | 'arc' | 'mail'
  tone: 'danger' | 'warning' | 'neutral'
  title: string
  detail?: string
  href: string
  cta: string
}

/** A section's data, or that it failed (null = no unit linked, nothing to check). */
export type Loaded<T> = { ok: true; data: T } | { ok: false }

export const OPEN_ARC = new Set(['submitted', 'in_review'])
export const MAIL_AWAITING = new Set(['needs_review', 'open'])

/**
 * The strip at the top of the page: only what someone must act on, each
 * linking to where it gets fixed. A source that failed to load says it
 * couldn't be checked — never silently drops out (that would read as
 * "nothing to do").
 */
export function needsAction(input: {
  propertyId: string
  now: Date
  violations: Loaded<readonly ViolationRow[]>
  stats: Loaded<{ balance: number; daysOverdue: number; threadsNeedingReply: number } | null>
  aging: Loaded<Aging> | null
  collectionCase: Loaded<CollectionCaseRow | null> | null
  arc: Loaded<readonly ArcRow[]> | null
  threads: Loaded<readonly ThreadRow[]> | null
  hrefs: { violations: string; dues: string; compliance: string; communications: string }
}): ActionItem[] {
  const out: ActionItem[] = []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  if (!input.violations.ok) {
    out.push({ key: 'violations', tone: 'neutral', title: 'Couldn’t check violations', href: input.hrefs.violations, cta: 'Open violations' })
  } else {
    const past = input.violations.data.filter((v) => cureState(v, input.now) === 'past')
    if (past.length > 0) {
      const oldest = past.map((v) => cureBy(v)!).sort((a, b) => a.getTime() - b.getTime())[0]!
      out.push({
        key: 'violations',
        tone: 'danger',
        title: `${plural(past.length, 'violation', 'violations')} past the cure date`,
        detail: `Cure date passed ${Math.max(1, Math.floor((input.now.getTime() - oldest.getTime()) / 86_400_000))} days ago`,
        href: past.length === 1 ? `/violations/${past[0]!.id}` : input.hrefs.violations,
        cta: past.length === 1 ? 'Open the violation' : 'Review violations',
      })
    }
  }

  if (!input.stats.ok) {
    out.push({ key: 'balance', tone: 'neutral', title: 'Couldn’t check the balance', href: input.hrefs.dues, cta: 'Open dues' })
  } else if (input.stats.data && input.stats.data.balance > 0 && input.stats.data.daysOverdue > 0) {
    const s = input.stats.data
    const bucket = input.aging?.ok && input.aging.data.oldest ? AGING_LABEL[input.aging.data.oldest].toLowerCase() : null
    const caseRow = input.collectionCase?.ok ? input.collectionCase.data : null
    out.push({
      key: 'balance',
      tone: 'danger',
      title: `${s.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} overdue`,
      detail: [
        bucket ? `Oldest charge ${bucket} late` : `${plural(s.daysOverdue, 'day', 'days')} overdue`,
        caseRow && !isTerminal(caseRow.status) ? `Collections: ${collectionStatusLabel(caseRow.status)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: input.hrefs.dues,
      cta: 'Record a payment',
    })
  }

  if (input.arc) {
    if (!input.arc.ok) {
      out.push({ key: 'arc', tone: 'neutral', title: 'Couldn’t check ARC requests', href: input.hrefs.compliance, cta: 'See compliance' })
    } else {
      const open = input.arc.data.filter((a) => OPEN_ARC.has(a.status))
      if (open.length > 0) {
        out.push({
          key: 'arc',
          tone: 'warning',
          title: `${plural(open.length, 'ARC request', 'ARC requests')} awaiting a decision`,
          detail: open.length === 1 ? open[0]!.summary : undefined,
          href: open.length === 1 ? `/arc/${open[0]!.id}` : input.hrefs.compliance,
          cta: open.length === 1 ? 'Decide' : 'Review requests',
        })
      }
    }
  }

  if (input.threads) {
    if (!input.threads.ok) {
      out.push({ key: 'mail', tone: 'neutral', title: 'Couldn’t check the mailbox', href: input.hrefs.communications, cta: 'See communications' })
    } else {
      const waiting = input.threads.data.filter((t) => MAIL_AWAITING.has(t.status))
      if (waiting.length > 0) {
        out.push({
          key: 'mail',
          tone: 'warning',
          title: `${plural(waiting.length, 'email', 'emails')} awaiting a reply`,
          detail: waiting.length === 1 ? (waiting[0]!.subject ?? '(no subject)') : undefined,
          href: waiting.length === 1 ? `/inbox/${waiting[0]!.id}` : input.hrefs.communications,
          cta: waiting.length === 1 ? 'Reply' : 'See emails',
        })
      }
    }
  }
  return out
}

// ─── Activity timeline ───────────────────────────────────────────────

export type ActivityTone = 'brand' | 'neutral' | 'danger' | 'success' | 'warning'

export interface ActivityItem {
  id: string
  at: string
  kind: 'history' | 'note' | 'violation' | 'arc' | 'payment' | 'mail' | 'notice' | 'collections'
  title: string
  body?: string
  href?: string
  tone: ActivityTone
}

const money = (n: number | string) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The record-history sentence for a property_events row. */
export function describeEvent(event: PropertyEventRow, tenureLabels: Record<string, string>): string {
  const p = (event.payload ?? {}) as Record<string, unknown>
  const tenureLabel = (v: unknown) => (typeof v === 'string' ? (tenureLabels[v] ?? v.replace(/_/g, '-')) : '?')
  switch (event.kind) {
    case 'tenure_changed':
      return `Tenure changed from ${tenureLabel(p.from)} to ${tenureLabel(p.to)}`
    case 'ownership_changed': {
      if (p.reason !== 'sale') return 'Ownership changed'
      const n = typeof p.buyers === 'number' ? p.buyers : null
      const day = typeof p.settlement_date === 'string' ? p.settlement_date : null
      return `Sale recorded${day ? `, settled ${formatDay(day)}` : ''}${n && n > 1 ? ` · ${n} buyers` : ''}`
    }
    case 'resident_added':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} added${
        typeof p.role === 'string' ? ` as ${p.role.replace(/_/g, ' ')}` : ''
      }`
    case 'resident_removed':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} moved out`
    case 'lease_started':
      return 'Lease started'
    case 'lease_ended':
      return 'Lease ended'
    case 'waiting_list_added':
      return 'Added to lease waiting list'
    case 'waiting_list_resolved': {
      const outcome = typeof p.outcome === 'string' ? p.outcome : 'resolved'
      return `Waiting list entry ${outcome}`
    }
    case 'note':
      return 'Note'
  }
}

/**
 * One timeline for the home, newest first: record history and notes,
 * violations (reported, notice sent, resolved), ARC (submitted, decided),
 * payments, mail, notices sent, and collections cases opened. Each source
 * is optional — a failed source simply contributes nothing, and the page
 * says which ones it couldn't read.
 */
export function buildTimeline(
  input: {
    events?: readonly PropertyEventRow[]
    violations?: readonly ViolationRow[]
    arc?: readonly ArcRow[]
    payments?: readonly PaymentRow[]
    threads?: readonly ThreadRow[]
    notices?: readonly NoticeRow[]
    cases?: readonly CollectionCaseRow[]
    tenureLabels: Record<string, string>
  },
  limit = 40,
): ActivityItem[] {
  const out: ActivityItem[] = []
  for (const e of input.events ?? []) {
    out.push({
      id: `event-${e.id}`,
      at: e.occurred_at,
      kind: e.kind === 'note' ? 'note' : 'history',
      title: describeEvent(e, input.tenureLabels),
      body: e.notes ?? undefined,
      tone: e.kind === 'resident_removed' || e.kind === 'lease_ended' ? 'neutral' : 'brand',
    })
  }
  for (const v of input.violations ?? []) {
    if (v.created_at)
      out.push({ id: `violation-${v.id}`, at: v.created_at, kind: 'violation', title: `Violation reported: ${v.description}`, href: `/violations/${v.id}`, tone: 'warning' })
    if (v.notice_sent_at)
      out.push({ id: `violation-notice-${v.id}`, at: v.notice_sent_at, kind: 'violation', title: `Violation notice sent: ${v.description}`, href: `/violations/${v.id}`, tone: 'warning' })
    if (v.resolved_at && isClosedViolation(v.status))
      out.push({ id: `violation-closed-${v.id}`, at: v.resolved_at, kind: 'violation', title: `Violation closed: ${v.description}`, href: `/violations/${v.id}`, tone: 'success' })
  }
  for (const a of input.arc ?? []) {
    out.push({ id: `arc-${a.id}`, at: a.submitted_at, kind: 'arc', title: `ARC request submitted: ${a.summary}`, href: `/arc/${a.id}`, tone: 'brand' })
    if (a.board_response_at && !OPEN_ARC.has(a.status))
      out.push({
        id: `arc-decided-${a.id}`,
        at: a.board_response_at,
        kind: 'arc',
        title: `ARC request ${a.status === 'approved' ? 'approved' : a.status === 'denied' ? 'denied' : a.status}: ${a.summary}`,
        href: `/arc/${a.id}`,
        tone: a.status === 'approved' ? 'success' : a.status === 'denied' ? 'danger' : 'neutral',
      })
  }
  for (const p of input.payments ?? []) {
    out.push({ id: `payment-${p.id}`, at: p.paid_at, kind: 'payment', title: `Payment received: ${money(p.amount)} (${p.payment_method.replace(/_/g, ' ')})`, tone: 'success' })
  }
  for (const t of input.threads ?? []) {
    if (t.lastMessageAt)
      out.push({ id: `mail-${t.id}`, at: t.lastMessageAt, kind: 'mail', title: `Email: ${t.subject || '(no subject)'}`, href: `/inbox/${t.id}`, tone: 'brand' })
  }
  for (const n of input.notices ?? []) {
    out.push({ id: `notice-${n.id}`, at: n.at, kind: 'notice', title: `Notice sent: ${n.subject}`, href: `/communications/${n.communicationId}`, tone: 'neutral' })
  }
  for (const c of input.cases ?? []) {
    out.push({ id: `case-${c.id}`, at: c.opened_on, kind: 'collections', title: 'Collections case opened', tone: 'danger' })
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id)).slice(0, limit)
}
