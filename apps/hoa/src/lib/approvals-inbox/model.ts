// BL-014 — one approvals inbox. Pure module: no Next, no Supabase, no `@/`
// imports, so unit tests and tests/integration can load it directly.
//
// Four sources feed /approvals today, each READ from where its module
// already keeps it (no migration, no copy of the data):
//
//   w18    approval_requests rows (action_type 'w18.cash_receipt',
//          status 'proposed') — sub-project D, migration 0060.
//   w3     ai_runs rows (workflow_id 'W3', status 'pending_human_approval')
//          — the AI-drafted violation letters.
//   bill   approval_requests rows (action_type 'w36.ap_bill', status
//          'proposed') — vendor bills W36 read from an upload (BL-021).
//   collections approval_requests rows (action_type 'collections.letter',
//          status 'proposed') — collections letters built in code from
//          the ledger and the state rule (BL-089). Approving sends nothing;
//          the board prints the approved letter from the property page.
//   opening approval_requests rows (action_type
//          'accounting.opening_balances', status 'proposed') — the
//          opening-balance wizard (BL-126). Approving posts one journal
//          entry and the homes' opening charges.
//   arc    ai_runs rows (workflow_id 'W37', status 'pending_human_approval')
//          — the AI's review draft for a submitted ARC application
//          (BL-027). Decided by the existing ARC actions, never here.
//   contact tickets a resident filed from /resident/account → My contact
//          details (PR-10, subject CONTACT_SUBJECT, still open). Decided
//          by lib/contact-updates/apply.ts with the board's own client.
//   vendor the W21 vendor approval queue (/vendors/approval-queue):
//          compliant prospects plus yellow/red/missing compliance.
//
// Decisions are NOT made here; see decide.ts. An item's `decision` says
// which existing module action can decide it in one click, or is null
// when that module has no decision for it (a W3 draft with no letter
// text, an active vendor with compliance gaps) and the row links to the
// module's own page instead.

import { billMissing, billNeedsCheck, readBillPayload, type BillProposalPayload } from '../bill-scan/proposal'
import { followUpLabel, followUpOfRunInput } from '../violation-follow-up'
<<<<<<< HEAD
import { LETTER_KIND_CITATIONS, letterHref, letterLawNote, readLetterPayload } from '../collections/letters/proposal'
=======
import { LETTER_KIND_CITATIONS, letterHref, readLetterPayload } from '../collections/letters/proposal'
import { OPENING_HREF, openingDetail, readOpeningPayload } from '../accounting/opening-balances/proposal'
>>>>>>> 6ca4bd79
import {
  SUGGESTION_LABEL,
  citationLabel,
  decisionLetters,
  readArcReviewOutput,
  runSummary,
  type ArcLetterKind,
  type ArcSuggestedDecision,
} from '../arc-review/model'
import { FIELD_LABEL, HELD_REASON, planContactApply } from '../contact-updates/model'
import type { ContactEntry, ContactTicketRow } from '../contact-updates/apply'

export const APPROVAL_SOURCES = ['w18', 'bill', 'opening', 'w3', 'collections', 'arc', 'contact', 'vendor'] as const
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
  bill: {
    title: 'Bills to enter',
    tab: 'Bills',
    description:
      'Vendor bills the AI read from an upload. Nothing is entered in accounting until a board member approves. Anything the AI was unsure of is marked — check it against the bill.',
    queueHref: '/accounting/invoices/new',
    queueLabel: 'Scan or enter a bill',
    what: 'scanned bills',
  },
  opening: {
    title: 'Opening balances',
    tab: 'Opening balances',
    description:
      'Starting balances entered with the opening-balance wizard. Nothing is posted until a board member approves: approving posts one journal entry, balanced in every fund, and adds each home’s opening charge.',
    queueHref: OPENING_HREF,
    queueLabel: 'Open opening balances',
    what: 'opening balances',
  },
  w3: {
    title: 'Violation letters',
    tab: 'Violation letters',
    description: 'Notices drafted by Covenant Brain. Nothing reaches a homeowner until the board reviews it.',
    queueHref: '/violations/approval-queue',
    queueLabel: 'Open the violation drafts',
    what: 'violation drafts',
  },
  collections: {
    title: 'Collections letters',
    tab: 'Collections letters',
    description:
      'Past-due and lien notices drafted from the ledger and the state’s rules — no AI writes them. Approving sends nothing: the board prints the approved letter from the property page and mails it.',
    queueHref: '/dues',
    queueLabel: 'Open dues',
    what: 'collections letters',
  },
  arc: {
    title: 'ARC reviews',
    tab: 'ARC reviews',
    description:
      'The AI’s cited review of each new architectural application, with a suggested decision. It decides nothing: the board approves, denies or asks for more, and the resident sees only what the board sends.',
    queueHref: '/arc',
    queueLabel: 'Open ARC review',
    what: 'ARC reviews',
  },
  contact: {
    title: 'Contact updates',
    tab: 'Contact updates',
    description:
      'Owners and residents asked to change their own phone, notice email or mailing address. Nothing on file changes until a board member approves; approving updates every record for that person on the home.',
    queueHref: '/tickets',
    queueLabel: 'Open requests',
    what: 'contact updates',
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
  /** BL-021: approve enters the bill (enterBill) — only when nothing required is missing; reject records why. */
  | { kind: 'bill'; approvalRequestId: string; canApprove: boolean }
  /** BL-048: approve files the letter (lib/violations approveViolationDraft); reject records why. */
  | { kind: 'w3'; runId: string }
  /** BL-089: approve marks the letter approved for printing (lib/collections/letters/executor.ts); reject records why. */
  | { kind: 'collections'; approvalRequestId: string }
  /** BL-126: approve posts the opening journal entry and the homes' charges (lib/accounting/opening-balances/executor.ts). */
  | { kind: 'opening'; approvalRequestId: string }
  /** A prospect: rejectable always; approvable only when compliance is green (approveVendor's gate). */
  | { kind: 'vendor'; vendorId: string; canApprove: boolean }
  /** BL-027: decided by the ARC actions (respondToArcRequest / requestArcInfo), not decideApproval. */
  | { kind: 'arc'; runId: string; arcId: string }
  /** PR-10: approve applies the resident's own contact change; withheld (canApprove false) when it can't be applied. */
  | { kind: 'contact'; ticketId: string; canApprove: boolean }

/** The id the decision endpoint takes for a target. */
export function decisionId(d: InboxDecisionTarget): string {
  if (d.kind === 'w18' || d.kind === 'bill' || d.kind === 'collections' || d.kind === 'opening') return d.approvalRequestId
  if (d.kind === 'w3' || d.kind === 'arc') return d.runId
  if (d.kind === 'contact') return d.ticketId
  return d.vendorId
}

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
  /** BL-021: the extracted bill, for the card's field list. Absent for other sources and for an unreadable payload. */
  bill?: BillCard
  /** BL-027: what the ARC decision buttons need. Absent for other sources. */
  arc?: ArcCard
  /** PR-10: the requested change, field by field. Absent for other sources. */
  contact?: ContactCard
}

export interface ContactCard {
  ticketId: string
  /** "12 Oak Street"; null when the home couldn't be found. */
  home: string | null
  changes: Array<{ label: string; from: string | null; to: string }>
  /** Resident records this changes, by name. */
  names: string[]
  /** Why part of it won't be applied (e.g. the sign-in email hold). */
  held: string[]
  /** Why it can't be approved at all; null when it can. */
  problem: string | null
}

export interface ArcCard {
  arcId: string
  runId: string
  suggestion: ArcSuggestedDecision | null
  /** BL-079: the full decision letter per action, for the board to edit; '' when there is no review. */
  drafts: Record<ArcLetterKind, string>
  conditions: string[]
  warnings: string[]
}

export interface BillCard {
  payload: BillProposalPayload
  /** Required fields that are empty — approve is withheld while any are. */
  missing: string[]
  /** Filled fields read with less than high confidence. */
  needsCheck: string[]
  /** A short-lived signed link to the uploaded bill; set by the page, null when unavailable. */
  documentUrl: string | null
  /**
   * BL-059: what Edit details may pick from — set by the page; null until
   * then, or when the lists failed to load (the card then says editing is
   * unavailable rather than offering a form that can't validate).
   */
  editOptions: BillEditOptionLists | null
}

export interface BillEditOptionLists {
  vendors: Array<{ id: string; label: string }>
  accounts: Array<{ id: string; label: string }>
  /** The association's today, 'YYYY-MM-DD' — the latest invoice date allowed. */
  today: string
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

export interface BillProposalRow {
  id: string
  summary: string
  amount: number | string | null
  proposed_at: string
  payload: unknown
}

function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * BL-021 bill proposals. Never fills a gap: a missing field withholds
 * approve (and says which) until a board member fills it in with Edit
 * details (BL-059); a low/medium-confidence field is named so the approver
 * checks it against the bill.
 */
export function billItems(rows: BillProposalRow[]): InboxItem[] {
  return rows.map((r) => {
    const payload = readBillPayload(r.payload)
    const base = {
      source: 'bill' as const,
      id: r.id,
      title: r.summary,
      amount: num(r.amount),
      amountNote: null,
      createdAt: r.proposed_at,
      citations: [],
      href: '/accounting/invoices/new',
    }
    if (!payload) {
      return {
        ...base,
        detail: 'This scan couldn’t be read. Reject it and enter the bill by hand.',
        reasoning: null,
        confidenceLabel: null,
        decision: { kind: 'bill', approvalRequestId: r.id, canApprove: false },
      }
    }
    const missing = billMissing(payload)
    const needsCheck = billNeedsCheck(payload)
    const detail =
      missing.length > 0
        ? `Missing ${joinList(missing)}. Fill ${missing.length === 1 ? 'it' : 'them'} in with Edit details, or reject it.`
        : needsCheck.length > 0
          ? `Check the ${joinList(needsCheck)} against the bill before approving.`
          : null
    return {
      ...base,
      detail,
      reasoning: payload.expenseAccount.reasoning,
      confidenceLabel:
        missing.length > 0
          ? 'Incomplete'
          : needsCheck.length > 0
            ? `${needsCheck.length} field${needsCheck.length === 1 ? '' : 's'} to check`
            : 'High confidence',
      decision: { kind: 'bill', approvalRequestId: r.id, canApprove: missing.length === 0 },
      bill: { payload, missing, needsCheck, documentUrl: null, editOptions: null },
    }
  })
}

export interface LetterProposalRow {
  id: string
  summary: string
  amount: number | string | null
  proposed_at: string
  payload: unknown
}

const usdFromCents = (c: number) =>
  `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * BL-089 collections letters. The figures are the code's, from the
 * ledger; the board's own entries (interest, costs) are named so the
 * approver checks them. An unreadable payload gets no one-click decision.
 */
export function letterItems(rows: LetterProposalRow[]): InboxItem[] {
  return rows.map((r) => {
    const payload = readLetterPayload(r.payload)
    const citation = payload ? LETTER_KIND_CITATIONS[payload.kind] : null
    return {
      source: 'collections' as const,
      id: r.id,
      title: r.summary,
      detail: payload
        ? `From the ledger ${usdFromCents(payload.ledgerCents)}${payload.enteredCents > 0 ? `, plus ${usdFromCents(payload.enteredCents)} entered by the board (interest and costs)` : ''}. Drafted ${payload.draftedOn}. Open the letter to read it in full before approving.${letterLawNote(payload) ? ` ${letterLawNote(payload)}` : ''}`
        : 'This letter can’t be read. Open the property to draft it again.',
      amount: num(r.amount),
      amountNote: null,
      createdAt: r.proposed_at,
      reasoning: null,
      citations: citation ? [citation] : [],
      confidenceLabel: null,
      href: payload ? letterHref(payload.propertyId) : '/properties',
      decision: payload ? { kind: 'collections', approvalRequestId: r.id } : null,
    }
  })
}

export interface OpeningProposalRow {
  id: string
  summary: string
  amount: number | string | null
  proposed_at: string
  payload: unknown
}

/**
 * BL-126 opening balances. The figures are the board's own, from the
 * wizard; the card says what approving posts. An unreadable payload gets
 * no one-click decision.
 */
export function openingItems(rows: OpeningProposalRow[]): InboxItem[] {
  return rows.map((r) => {
    const payload = readOpeningPayload(r.payload)
    return {
      source: 'opening' as const,
      id: r.id,
      title: r.summary,
      detail: payload ? openingDetail(payload) : 'These opening balances can’t be read. Reject them and enter them again.',
      amount: num(r.amount),
      amountNote: payload ? 'total debits' : null,
      createdAt: r.proposed_at,
      reasoning: null,
      citations: [],
      confidenceLabel: null,
      href: OPENING_HREF,
      decision: payload ? { kind: 'opening' as const, approvalRequestId: r.id } : null,
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
 * W3 drafts (BL-048): decidable in one click when there is letter text to
 * approve. A draft with none links to the queue instead.
 */
export function w3Items(runs: W3RunRow[]): InboxItem[] {
  return runs.map((r) => {
    const input = obj(r.input)
    const output = obj(r.output)
    const cents = num(output.recommendedFineAmountCents)
    const cited = str(output.citedSection)
    const conf = str(output.confidence)?.toUpperCase() ?? null
    // A follow-up letter for an existing violation (violation page) says
    // which letter it is and links to that violation, not the new-draft queue.
    const followUp = followUpOfRunInput(input)
    const type = titleCase(str(input.violationType) ?? 'Violation notice')
    return {
      source: 'w3',
      id: r.id,
      title: followUp ? `${followUpLabel(followUp)} · ${type}` : type,
      detail: excerpt(str(output.notice)),
      amount: cents === null ? null : cents / 100,
      amountNote: cents === null ? null : 'per day',
      createdAt: r.created_at,
      reasoning: str(r.reasoning_trace),
      citations: cited ? [cited] : [],
      confidenceLabel: conf ? (W3_CONFIDENCE[conf] ?? null) : null,
      href: followUp ? `/violations/${followUp.violationId}` : '/violations/approval-queue',
      decision: str(output.notice) ? { kind: 'w3', runId: r.id } : null,
    }
  })
}

export interface ArcRunRow {
  id: string
  created_at: string | null
  input: unknown
  output: unknown
}

/**
 * BL-027: W37 review drafts. Each links to its application; the decision is
 * the board's, through the ARC actions. A refusal ("no rules apply") still
 * lists, with no suggestion, so the application is not lost.
 */
export function arcItems(runs: ArcRunRow[], ctx: { associationName?: string | null } = {}): InboxItem[] {
  return runs.flatMap((r) => {
    const arcId = str(obj(r.input).arcRequestId)
    if (!arcId) return []
    const out = readArcReviewOutput(r.output)
    const suggestion = out?.suggestion?.decision ?? null
    return [
      {
        source: 'arc' as const,
        id: r.id,
        title: runSummary(r.input) ?? 'ARC application',
        detail: excerpt(out?.summary ?? null),
        amount: null,
        amountNote: null,
        createdAt: r.created_at,
        reasoning: out?.suggestion?.reasoning || null,
        citations: [...new Set((out?.rules ?? []).map(citationLabel))],
        confidenceLabel: suggestion ? `Suggests: ${SUGGESTION_LABEL[suggestion]}` : 'No suggestion',
        href: `/arc/${arcId}`,
        decision: { kind: 'arc' as const, runId: r.id, arcId },
        arc: {
          arcId,
          runId: r.id,
          suggestion,
          drafts: decisionLetters(out, { associationName: ctx.associationName ?? null, title: runSummary(r.input) }),
          conditions: out?.suggestion?.conditions ?? [],
          warnings: out?.warnings ?? [],
        },
      },
    ]
  })
}

/**
 * PR-10: resident contact updates. `entries` are the readable requests
 * with their home's records (lib/contact-updates/apply.ts
 * loadContactEntries); a ticket with the subject but no readable request
 * still lists — with no decision — so the count never exceeds the rows.
 * Approve is offered exactly when planContactApply (the same plan the
 * approval runs) says it can apply.
 */
export function contactItems(tickets: readonly ContactTicketRow[], entries: readonly ContactEntry[]): InboxItem[] {
  const byId = new Map(entries.map((e) => [e.ticket.id, e]))
  return tickets.map((t) => {
    const href = `/tickets/${t.id}`
    const e = byId.get(t.id)
    const base = { source: 'contact' as const, id: t.id, amount: null, amountNote: null, createdAt: t.created_at, reasoning: null, citations: [], confidenceLabel: null, href }
    if (!e) {
      return { ...base, title: 'Contact details update', detail: 'This request couldn’t be read. Open it and reply to the resident.', decision: null }
    }
    const planned = e.context ? planContactApply(e.context) : null
    const problem = !e.context ? 'The home this request is for couldn’t be found. Reply on the request instead.' : planned && !planned.ok ? planned.error : null
    const held = planned?.ok ? planned.plan.held.map((f) => HELD_REASON[f]) : []
    const names = planned?.ok ? planned.plan.names : []
    const changes = (Object.keys(e.request.changes) as Array<keyof typeof e.request.changes>).map((f) => {
      const to = e.request.changes[f]
      return {
        label: FIELD_LABEL[f],
        from: e.current ? e.current[f] : null,
        to: to ?? (f === 'mailing' ? 'Same as the home' : 'Remove'),
      }
    })
    return {
      ...base,
      title: `Contact details — ${e.home ?? 'home not found'}`,
      detail:
        [names.length > 0 ? `From ${names.join(' and ')}` : null, e.request.channel === 'inbox' ? 'Filed from an email in the Inbox' : null]
          .filter(Boolean)
          .join(' · ') || null,
      decision: { kind: 'contact' as const, ticketId: t.id, canApprove: problem === null },
      contact: { ticketId: t.id, home: e.home, changes, names, held, problem },
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

/**
 * Only a compliant prospect can be approved in one click (approveVendor's
 * own gate); any prospect can be rejected (rejectVendor). An active vendor
 * with gaps has no one-click decision — it links to its page.
 */
export function vendorItems(vendors: VendorQueueRow[]): InboxItem[] {
  return vendors.filter(vendorNeedsBoard).map((v) => {
    const c = v.compliance?.status ?? null
    const deficiencies = v.compliance?.deficiencies ?? []
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
      decision: v.status === 'prospect' ? { kind: 'vendor', vendorId: v.id, canApprove: c === 'green' } : null,
    }
  })
}

/** The vendor queue as a section, from listVendorsResult's own result shape. */
export function vendorSection(result: { ok: true; data: VendorQueueRow[] } | { ok: false }): InboxSection {
  if (!result.ok) return { source: 'vendor', ok: false }
  const items = vendorItems(result.data)
  return { source: 'vendor', ok: true, items: items.slice(0, SECTION_LIMIT), total: items.length }
}

/**
 * BL-048: vendors needing the board, per association, for orgs with more
 * than one. Vendor compliance is per association; the list above it shows
 * the primary association (first by name, getPrimaryAssociation), so the
 * others are counted here rather than silently left out. `count` null =
 * that count failed (unknown, not 0).
 */
export interface AssociationVendorCount {
  associationId: string
  name: string
  count: number | null
  primary: boolean
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
