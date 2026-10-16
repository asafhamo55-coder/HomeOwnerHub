// BL-014 — one approvals inbox. Pure module: no Next, no Supabase, no `@/`
// imports, so unit tests and tests/integration can load it directly.
//
// Three sources feed /approvals today, each READ from where its module
// already keeps it (no migration, no copy of the data):
//
//   w18    approval_requests rows (action_type 'w18.cash_receipt',
//          status 'proposed') — sub-project D, migration 0060.
//   w3     ai_runs rows (workflow_id 'W3', status 'pending_human_approval')
//          — the AI-drafted violation letters.
//   vendor the W21 vendor approval queue (/vendors/approval-queue):
//          compliant prospects plus yellow/red/missing compliance.
//
// Decisions are NOT made here; see decide.ts. An item's `decision` says
// which existing module action can decide it in one click, or is null
// when that module has no decision action (W3 drafts, non-green vendors)
// and the row links to the module's own page instead.

export const APPROVAL_SOURCES = ['w18', 'w3', 'vendor'] as const
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number]
export type ApprovalFilter = 'all' | ApprovalSource

export interface SourceMeta {
  /** Section heading. */
  title: string
  /** Tab / filter label. */
  tab: string
  /** One sentence under the heading. */
  description: string
  /** The module's own queue — where overflow and review-only rows go. */
  queueHref: string
  queueLabel: string
  /** Plural noun for LoadFailed ("Couldn’t load …"). */
  what: string
}

export const SOURCE_META: Record<ApprovalSource, SourceMeta> = {
  w18: {
    title: 'Deposits to post',
    tab: 'Deposits',
    description:
      'The bank matcher paired these deposits with an open charge. Nothing posts, and no charge is marked paid, until a board member approves.',
    queueHref: '/accounting/bank/queue',
    queueLabel: 'Open the matching queue',
    what: 'proposed postings',
  },
  w3: {
    title: 'Violation letters',
    tab: 'Violation letters',
    description: 'Notices drafted by Covenant Brain. Nothing reaches a homeowner until the board reviews it.',
    queueHref: '/violations/approval-queue',
    queueLabel: 'Open the violation drafts',
    what: 'violation drafts',
  },
  vendor: {
    title: 'Vendors',
    tab: 'Vendors',
    description: 'Compliant prospects ready to approve, and vendors whose insurance or documents need a follow-up.',
    queueHref: '/vendors/approval-queue',
    queueLabel: 'Open the vendor queue',
    what: 'the vendor queue',
  },
}

/** Which existing module action decides this item in one click. */
export type InboxDecisionTarget =
  | { kind: 'w18'; approvalRequestId: string }
  | { kind: 'vendor'; vendorId: string }

export interface InboxItem {
  source: ApprovalSource
  id: string
  title: string
  /** A second line: the draft excerpt, the vendor's situation. */
  detail: string | null
  amount: number | null
  /** Qualifies the amount ("per day" for a daily fine). */
  amountNote: string | null
  /** When it started waiting (ISO). */
  createdAt: string | null
  /** The AI's own explanation, verbatim. Null when there is none — never invented. */
  reasoning: string | null
  /** What the AI cited (CC&R sections, deficiency detail). */
  citations: string[]
  confidenceLabel: string | null
  /** The module page for this item. */
  href: string
  decision: InboxDecisionTarget | null
}

export type InboxSection =
  | {
      source: ApprovalSource
      ok: true
      items: InboxItem[]
      /** All pending for the source; may exceed items.length (SECTION_LIMIT). */
      total: number
      /** True when the rows loaded but the AI notes for them did not. */
      notesFailed?: boolean
    }
  | { source: ApprovalSource; ok: false }

/** Rows shown per source; the rest are counted and linked, never dropped silently. */
export const SECTION_LIMIT = 50

// ─── role gate ───────────────────────────────────────────────────────

export function canUseApprovals(role: string | null | undefined): role is 'admin' | 'board' {
  return role === 'admin' || role === 'board'
}

// ─── filter ──────────────────────────────────────────────────────────

export function parseApprovalFilter(raw: string | string[] | undefined): ApprovalFilter {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (APPROVAL_SOURCES as readonly string[]).includes(v ?? '') ? (v as ApprovalSource) : 'all'
}

// ─── source mappers ──────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function excerpt(s: string | null, max = 240): string | null {
  if (!s) return null
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s
}

export interface W18ProposalRow {
  id: string
  subject_id: string
  summary: string
  amount: number | string | null
  proposed_at: string
}

export interface W18RunRow {
  input: unknown
  output: unknown
  created_at: string | null
}

/**
 * W18 proposals, each with the notes of the LATEST W18 run for its bank
 * transaction (how the matching queue finds them too). `runs` null means
 * the notes failed to load: items still render, with no reasoning.
 */
export function w18Items(proposals: W18ProposalRow[], runs: W18RunRow[] | null): InboxItem[] {
  const latest = new Map<string, { at: string; output: Record<string, unknown> }>()
  for (const r of runs ?? []) {
    const txn = str(obj(r.input).bankTransactionId)
    if (!txn) continue
    const at = r.created_at ?? ''
    const prev = latest.get(txn)
    if (!prev || at > prev.at) latest.set(txn, { at, output: obj(r.output) })
  }
  return proposals.map((p) => {
    const out = latest.get(p.subject_id)?.output ?? {}
    const confidence = num(out.confidence)
    return {
      source: 'w18',
      id: p.id,
      title: p.summary,
      detail: null,
      amount: num(p.amount),
      amountNote: null,
      createdAt: p.proposed_at,
      reasoning: str(out.notes),
      citations: [],
      confidenceLabel: confidence === null ? null : `${Math.round(confidence * 100)}% confident`,
      href: '/accounting/bank/queue#proposed-postings',
      decision: { kind: 'w18', approvalRequestId: p.id },
    }
  })
}

export interface W3RunRow {
  id: string
  created_at: string | null
  input: unknown
  output: unknown
  citations: unknown
  reasoning_trace: string | null
}

const W3_CONFIDENCE: Record<string, string> = { HIGH: 'High confidence', MEDIUM: 'Medium confidence', LOW: 'Low confidence' }

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * W3 drafts. No module action decides one today (the W3 queue is
 * review-only), so `decision` is null and the row links to the queue.
 */
export function w3Items(runs: W3RunRow[]): InboxItem[] {
  return runs.map((r) => {
    const input = obj(r.input)
    const output = obj(r.output)
    const cents = num(output.recommendedFineAmountCents)
    const cited = str(output.citedSection)
    const conf = str(output.confidence)?.toUpperCase() ?? null
    return {
      source: 'w3',
      id: r.id,
      title: titleCase(str(input.violationType) ?? 'Violation notice'),
      detail: excerpt(str(output.notice)),
      amount: cents === null ? null : cents / 100,
      amountNote: cents === null ? null : 'per day',
      createdAt: r.created_at,
      reasoning: str(r.reasoning_trace),
      citations: cited ? [cited] : [],
      confidenceLabel: conf ? (W3_CONFIDENCE[conf] ?? null) : null,
      href: '/violations/approval-queue',
      decision: null,
    }
  })
}

export interface VendorQueueRow {
  id: string
  legal_name: string
  status: string
  created_at: string
  compliance: {
    status: string | null
    deficiencies: Array<{ code: string; severity: string; detail: string }> | null
    last_reviewed_at: string | null
  } | null
}

/**
 * The vendor approval queue's rule (/vendors/approval-queue uses this
 * same function): anything that needs a board member's eye.
 */
export function vendorNeedsBoard(v: Pick<VendorQueueRow, 'status' | 'compliance'>): boolean {
  const c = v.compliance?.status
  if (v.status === 'prospect' && c === 'green') return true
  return c === 'yellow' || c === 'red' || c === 'missing'
}

export function vendorReason(vendorStatus: string, compliance: string | null | undefined): string {
  if (vendorStatus === 'prospect' && compliance === 'green') return 'Compliant prospect — ready to approve as an active vendor.'
  if (compliance === 'yellow') return 'Gaps that need follow-up soon — review the deficiencies.'
  if (compliance === 'red') return 'Non-compliant — do not assign work until cured.'
  if (compliance === 'missing') return 'Documents not entered yet — run a compliance check.'
  return ''
}

/** Only a compliant prospect can be approved in one click (approveVendor's own gate). */
export function vendorItems(vendors: VendorQueueRow[]): InboxItem[] {
  return vendors.filter(vendorNeedsBoard).map((v) => {
    const c = v.compliance?.status ?? null
    const deficiencies = v.compliance?.deficiencies ?? []
    const ready = v.status === 'prospect' && c === 'green'
    return {
      source: 'vendor',
      id: v.id,
      title: v.legal_name,
      detail: vendorReason(v.status, c) || null,
      amount: null,
      amountNote: null,
      createdAt: v.compliance?.last_reviewed_at ?? v.created_at,
      reasoning: deficiencies.length > 0 ? deficiencies.map((d) => d.detail).join(' · ') : null,
      citations: [],
      confidenceLabel: null,
      href: `/vendors/${v.id}`,
      decision: ready ? { kind: 'vendor', vendorId: v.id } : null,
    }
  })
}

/** The vendor queue as a section, from listVendorsResult's own result shape. */
export function vendorSection(result: { ok: true; data: VendorQueueRow[] } | { ok: false }): InboxSection {
  if (!result.ok) return { source: 'vendor', ok: false }
  const items = vendorItems(result.data)
  return { source: 'vendor', ok: true, items: items.slice(0, SECTION_LIMIT), total: items.length }
}

// ─── aggregation ─────────────────────────────────────────────────────

export type SourceCounts = Record<ApprovalSource, number | null>

export interface Inbox {
  /** Sections to render, in source order, after the type filter. */
  sections: InboxSection[]
  /** Pending per source; null = that source failed to load (unknown, not 0). */
  counts: SourceCounts
  /** Sum of counts; null when any source failed. */
  total: number | null
  anyFailed: boolean
  /** Every source loaded and every one is empty — the only true inbox zero. */
  allClear: boolean
}

export function buildInbox(sections: InboxSection[], filter: ApprovalFilter): Inbox {
  const bySource = new Map(sections.map((s) => [s.source, s]))
  const ordered = APPROVAL_SOURCES.map((src) => bySource.get(src)).filter((s): s is InboxSection => s !== undefined)
  const counts = Object.fromEntries(
    APPROVAL_SOURCES.map((src) => {
      const s = bySource.get(src)
      return [src, s && s.ok ? s.total : null]
    }),
  ) as SourceCounts
  const anyFailed = APPROVAL_SOURCES.some((src) => counts[src] === null)
  const total = anyFailed ? null : APPROVAL_SOURCES.reduce((n, src) => n + (counts[src] ?? 0), 0)
  return {
    sections: filter === 'all' ? ordered : ordered.filter((s) => s.source === filter),
    counts,
    total,
    anyFailed,
    allClear: total === 0,
  }
}

/**
 * The sidebar badge. Truthful-state rule: an unknown count is never shown
 * as 0. All known → the total (no badge at 0). Some unknown → the known
 * part as a lower bound ("3+"), or no badge if nothing is known.
 */
export function approvalsBadge(counts: SourceCounts): string | null {
  const values = APPROVAL_SOURCES.map((s) => counts[s])
  const known = values.reduce<number>((n, v) => n + (v ?? 0), 0)
  const partial = values.some((v) => v === null)
  if (known <= 0) return null
  if (known > 99) return '99+'
  return partial ? `${known}+` : String(known)
}
