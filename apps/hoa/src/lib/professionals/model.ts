// BL-168 — professional and officer roles. Pure module: zod and relative
// imports only (no Next, no Supabase, no `@/`), so the approvals inbox,
// the integration suite and unit tests load it directly.
//
// Design: docs/specs/2026-10-26-professional-roles.md. Migration 0070
// (batch M6), behind M6_APPLIED (packages/db/src/m6.ts).
//
// Every contribution from an outside professional is an approval_requests
// row (migration 0060) with action_type 'pro.*' and proposed_by set; the
// board approves, and nothing leaves the building before that.

import { z } from 'zod'

// ─── roles and titles ────────────────────────────────────────────────

export const PRO_ROLES = ['cpa', 'attorney'] as const
export type ProRole = (typeof PRO_ROLES)[number]

export const PRO_ROLE_LABEL: Record<ProRole, string> = { cpa: 'CPA', attorney: 'Attorney' }

export const OFFICER_TITLES = ['president', 'vice_president', 'secretary', 'treasurer', 'director'] as const
export type OfficerTitle = (typeof OFFICER_TITLES)[number]

export const OFFICER_TITLE_LABEL: Record<OfficerTitle, string> = {
  president: 'President',
  vice_president: 'Vice-President',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  director: 'Director',
}

export function readOfficerTitle(raw: unknown): OfficerTitle | null {
  return (OFFICER_TITLES as readonly string[]).includes(raw as string) ? (raw as OfficerTitle) : null
}

// ─── access windows ──────────────────────────────────────────────────

/** Default grant length in days; the board edits it on the invite form. */
export const DEFAULT_EXPIRY_DAYS: Record<ProRole, number> = { cpa: 365, attorney: 180 }
/** The longest grant the form accepts (a year; the database allows 367 days for end-of-day rounding). */
export const MAX_EXPIRY_DAYS = 365

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')

/** Whole days from `today` to `isoDate` (both 'YYYY-MM-DD'), UTC-day arithmetic. */
export function daysBetween(today: string, isoDate: string): number {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** The default expiry date for a role, as 'YYYY-MM-DD'. */
export function defaultExpiry(role: ProRole, today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + DEFAULT_EXPIRY_DAYS[role])
  return d.toISOString().slice(0, 10)
}

/**
 * An expiry must be a real future day within MAX_EXPIRY_DAYS. Returns the
 * message to show, or null when fine. The grant ends at the START of that
 * day in the association's zone, so "today" is already too late.
 */
export function expiryProblem(expiresOn: string, today: string): string | null {
  if (!Iso.safeParse(expiresOn).success || Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`))) return 'Pick an end date.'
  const days = daysBetween(today, expiresOn)
  if (days < 1) return 'The end date must be after today.'
  if (days > MAX_EXPIRY_DAYS) return 'Access can run for at most a year at a time. Renew it later.'
  return null
}

/** "ends in 12 days" / "ended 3 days ago" for the access list. */
export function expiryNote(expiresOn: string | null, today: string): string {
  if (!expiresOn) return 'no end date'
  const days = daysBetween(today, expiresOn.slice(0, 10))
  if (days < 0) return `ended ${-days} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'ends today'
  return `ends in ${days} day${days === 1 ? '' : 's'}`
}

// ─── matters ─────────────────────────────────────────────────────────

export const MATTER_TYPES = ['collections_case', 'violation', 'records_request'] as const
export type MatterType = (typeof MATTER_TYPES)[number]

export const MATTER_LABEL: Record<MatterType, string> = {
  collections_case: 'Collections case',
  violation: 'Violation',
  records_request: 'Records request',
}

export const MatterRefSchema = z.object({
  type: z.enum(MATTER_TYPES),
  id: z.string().uuid(),
})
export type MatterRef = z.infer<typeof MatterRefSchema>

// ─── the invite form ─────────────────────────────────────────────────

export const InviteProfessionalSchema = z
  .object({
    email: z.string().trim().email('Email looks invalid.').max(254),
    fullName: z.string().trim().max(200).nullable().optional(),
    role: z.enum(PRO_ROLES),
    expiresOn: Iso,
    /** Attorney only: governing documents and the compliance record. */
    generalCounsel: z.boolean().default(false),
    /** Attorney only: the matters they start with. */
    matters: z.array(MatterRefSchema).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'cpa' && (v.generalCounsel || v.matters.length > 0)) {
      ctx.addIssue({ code: 'custom', message: 'Matters and general counsel are for attorneys.', path: ['role'] })
    }
  })
export type InviteProfessionalInput = z.input<typeof InviteProfessionalSchema>

// ─── what each role can do ───────────────────────────────────────────

export const CAPABILITIES = [
  'accounting.read',
  'reports.export',
  'period.review',
  'entry.propose',
  'matters.read',
  'note.add',
  'upload.add',
  'letter.draft',
  'governing.read',
  'inbox.read',
  'residents.read',
  'money.write',
  'send',
] as const
export type Capability = (typeof CAPABILITIES)[number]

const CAN: Record<ProRole, readonly Capability[]> = {
  cpa: ['accounting.read', 'reports.export', 'period.review', 'entry.propose'],
  attorney: ['matters.read', 'note.add', 'upload.add', 'letter.draft'],
}

/**
 * What a role may do. `general` is the attorney's general-counsel switch.
 * Money writes, sending, the inbox and the residents list are nobody
 * outside the board's.
 */
export function roleCan(role: string | null | undefined, cap: Capability, opts: { general?: boolean } = {}): boolean {
  if (role === 'admin' || role === 'board') return true
  if (role !== 'cpa' && role !== 'attorney') return false
  if (cap === 'governing.read') return role === 'attorney' && opts.general === true
  return CAN[role].includes(cap)
}

// ─── navigation ──────────────────────────────────────────────────────

export interface ProNavLink {
  href: string
  label: string
}

/** The home of each professional role. */
export const PRO_HOME: Record<ProRole, string> = { cpa: '/pro/accounting', attorney: '/pro/matters' }

/** Sidebar links: only what the role can use. */
export function proNav(role: ProRole, opts: { general?: boolean } = {}): ProNavLink[] {
  if (role === 'cpa') {
    return [
      { href: '/pro/accounting', label: 'Accounting & Reports' },
      { href: '/pro/submissions', label: 'My submissions' },
    ]
  }
  return [
    { href: '/pro/matters', label: 'My matters' },
    ...(opts.general ? [{ href: '/pro/counsel', label: 'Governing documents' }] : []),
    { href: '/pro/submissions', label: 'My submissions' },
  ]
}

/**
 * Path prefixes a professional may open (the (pro) tree only). The
 * dashboard and resident trees are not theirs.
 */
export function proMayOpen(role: ProRole, pathname: string, opts: { general?: boolean } = {}): boolean {
  if (pathname === '/pro' || pathname === '/pro/submissions') return true
  if (role === 'cpa') return pathname === '/pro/accounting' || pathname.startsWith('/pro/accounting/')
  if (pathname === '/pro/matters' || pathname.startsWith('/pro/matters/')) return true
  return opts.general === true && (pathname === '/pro/counsel' || pathname.startsWith('/pro/counsel/'))
}

// ─── proposals (approval_requests rows) ──────────────────────────────

export const PRO_WORKFLOW = 'professionals'
export const PRO_SUBJECT = 'pro_item'

export const PRO_ACTIONS = {
  review: 'pro.cpa_review',
  entry: 'pro.journal_entry',
  note: 'pro.note',
  attachment: 'pro.attachment',
  letter: 'pro.letter_draft',
} as const
export type ProAction = (typeof PRO_ACTIONS)[keyof typeof PRO_ACTIONS]
export const PRO_ACTION_LIST: readonly string[] = Object.values(PRO_ACTIONS)

export function isProAction(a: string | null | undefined): a is ProAction {
  return typeof a === 'string' && PRO_ACTION_LIST.includes(a)
}

/**
 * Money approvals: routed to the Treasurer first and subject to dual
 * control above the board's amount. Keep in step with the list in
 * approval_is_money_action() (migrations/0070_m6_roles.sql); a unit test
 * reads that file and compares.
 */
export const MONEY_ACTIONS: readonly string[] = ['w18.cash_receipt', 'w36.ap_bill', 'accounting.opening_balances', PRO_ACTIONS.entry]

export function isMoneyAction(actionType: string | null | undefined): boolean {
  return typeof actionType === 'string' && MONEY_ACTIONS.includes(actionType)
}

export const PRO_ACTION_LABEL: Record<ProAction, string> = {
  'pro.cpa_review': 'CPA review note',
  'pro.journal_entry': 'Proposed adjusting entry',
  'pro.note': 'Attorney note',
  'pro.attachment': 'Attorney upload',
  'pro.letter_draft': 'Draft letter',
}

const NOTE_MAX = 4000
const LETTER_MAX = 20000

const Uuid = z.string().uuid()

export const ReviewPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('review'),
  fiscalPeriodId: Uuid,
  note: z.string().trim().min(1, 'Add a short note.').max(NOTE_MAX),
})
export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>

export const EntryLineSchema = z
  .object({
    accountId: Uuid,
    fundId: Uuid,
    debit: z.number().nonnegative().max(100_000_000).default(0),
    credit: z.number().nonnegative().max(100_000_000).default(0),
    memo: z.string().trim().max(500).optional(),
  })
  .refine((l) => (l.debit > 0 && l.credit === 0) || (l.credit > 0 && l.debit === 0), 'Each line is a debit or a credit, not both.')

export const EntryPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('entry'),
  associationId: Uuid,
  fiscalPeriodId: Uuid,
  entryDate: Iso,
  memo: z.string().trim().min(1, 'Say why the entry is needed.').max(2000),
  lines: z.array(EntryLineSchema).min(2, 'An entry needs at least two lines.').max(50),
})
export type EntryPayload = z.infer<typeof EntryPayloadSchema>

export const NotePayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('note'),
  matter: MatterRefSchema,
  body: z.string().trim().min(1, 'Write the note.').max(NOTE_MAX),
  /** "Attorney advised" notes the board cites when it performs an override. */
  advice: z.boolean().default(false),
})
export type NotePayload = z.infer<typeof NotePayloadSchema>

export const AttachmentPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('attachment'),
  matter: MatterRefSchema,
  storagePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  mime: z.string().max(100),
})
export type AttachmentPayload = z.infer<typeof AttachmentPayloadSchema>

export const LetterPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('letter'),
  matter: MatterRefSchema,
  subject: z.string().trim().min(1, 'Add a subject line.').max(200),
  body: z.string().trim().min(1, 'Write the letter.').max(LETTER_MAX),
})
export type LetterPayload = z.infer<typeof LetterPayloadSchema>

export type ProPayload = ReviewPayload | EntryPayload | NotePayload | AttachmentPayload | LetterPayload

const SCHEMA_BY_ACTION = {
  'pro.cpa_review': ReviewPayloadSchema,
  'pro.journal_entry': EntryPayloadSchema,
  'pro.note': NotePayloadSchema,
  'pro.attachment': AttachmentPayloadSchema,
  'pro.letter_draft': LetterPayloadSchema,
} as const

/** The payload of a pro.* row, or null when it does not parse (never a guess). */
export function readProPayload(actionType: string, raw: unknown): ProPayload | null {
  if (!isProAction(actionType)) return null
  const parsed = SCHEMA_BY_ACTION[actionType].safeParse(raw)
  return parsed.success ? (parsed.data as ProPayload) : null
}

/** An entry's total debits in dollars (the approval's amount), rounded to cents. */
export function entryTotal(lines: ReadonlyArray<{ debit: number; credit: number }>): number {
  return Math.round(lines.reduce((n, l) => n + l.debit * 100, 0)) / 100
}

/** Balanced overall and per fund; returns the message to show, or null. */
export function entryProblem(lines: ReadonlyArray<{ fundId: string; debit: number; credit: number }>): string | null {
  const total = (xs: ReadonlyArray<{ debit: number; credit: number }>, k: 'debit' | 'credit') =>
    Math.round(xs.reduce((n, l) => n + l[k] * 100, 0))
  if (total(lines, 'debit') !== total(lines, 'credit')) return 'Debits and credits must be equal.'
  for (const fund of new Set(lines.map((l) => l.fundId))) {
    const inFund = lines.filter((l) => l.fundId === fund)
    if (total(inFund, 'debit') !== total(inFund, 'credit')) return 'Debits and credits must be equal within each fund.'
  }
  return null
}

/** A one-line description for the approvals card. Ids and counts, no free text from residents. */
export function proDetail(actionType: string, payload: ProPayload): string {
  switch (payload.kind) {
    case 'review':
      return 'Marks the fiscal period as reviewed by the CPA, with their note.'
    case 'entry':
      return `${payload.lines.length} lines dated ${payload.entryDate}. Approving posts it to the ledger.`
    case 'note':
      return payload.advice
        ? 'Records the attorney’s advice on the matter. You perform any override, citing this note.'
        : 'Adds the attorney’s note to the matter.'
    case 'attachment':
      return `File “${payload.fileName}” for the matter. Approving files it with the matter.`
    case 'letter':
      return 'A draft letter. Approving marks the draft approved; nothing is sent.'
  }
  return actionType
}

// ─── Treasurer routing and dual control ──────────────────────────────

export interface Signer {
  userId: string
  role: 'admin' | 'board'
  title: OfficerTitle | null
}

export interface RouteInput {
  actionType: string
  /** The request's amount in dollars (approval_requests.amount); null when none. */
  amount: number | null
  /** associations.dual_control_cents, the lowest set in the org; null = no dual control. */
  thresholdCents: number | null
  /** The org has an active board member titled treasurer. */
  treasurerExists: boolean
  /** Sign-offs already recorded on the request. */
  signoffs: readonly Signer[]
  /** The person deciding now. */
  signer: Signer
}

export type RouteStep =
  /** Approve now: every requirement is met once this signer is counted. */
  | { kind: 'approve' }
  /** Record this sign-off; more are needed before the item is approved. */
  | { kind: 'signoff'; remaining: number; message: string }
  /** Not this person's turn: the Treasurer goes first. */
  | { kind: 'wait'; message: string }

const isTreasurerOrAdmin = (s: Signer) => s.title === 'treasurer' || s.role === 'admin'

/** How many distinct sign-offs a money item needs. */
export function signoffsNeeded(amount: number | null, thresholdCents: number | null): 1 | 2 {
  if (thresholdCents === null) return 1
  // An amount-less money item cannot be shown to be under the limit.
  if (amount === null) return 2
  return Math.round(amount * 100) > thresholdCents ? 2 : 1
}

/**
 * Where a money approval stands when `signer` decides. Non-money items are
 * always 'approve'. With a Treasurer on the board, a money item needs the
 * Treasurer (or an admin standing in) among its sign-offs, and the first
 * sign-off must be theirs. Above the board's amount two different
 * board/admin members must sign (the database enforces that count too).
 */
export function routeApproval(input: RouteInput): RouteStep {
  if (!isMoneyAction(input.actionType)) return { kind: 'approve' }
  const others = input.signoffs.filter((s) => s.userId !== input.signer.userId)
  const all = [...others, input.signer]
  const needed = signoffsNeeded(input.amount, input.thresholdCents)

  if (input.treasurerExists && !all.some(isTreasurerOrAdmin)) {
    return {
      kind: 'wait',
      message: 'Money approvals go to the Treasurer first. Ask the Treasurer (or an admin) to sign this one off.',
    }
  }
  if (all.length >= needed) return { kind: 'approve' }
  const remaining = needed - all.length
  return {
    kind: 'signoff',
    remaining,
    message: `Your sign-off is recorded. This amount needs ${needed} board members; ${remaining} more must approve it.`,
  }
}

// ─── audit ───────────────────────────────────────────────────────────

/** Audit actions this feature writes. Metadata is ids and codes only. */
export const PRO_AUDIT = {
  granted: 'pro.granted',
  renewed: 'pro.renewed',
  revoked: 'pro.revoked',
  inviteSent: 'pro.invite_sent',
  inviteCancelled: 'pro.invite_cancelled',
  inviteAccepted: 'pro.invite_accepted',
  matterAssigned: 'pro.matter_assigned',
  matterUnassigned: 'pro.matter_unassigned',
  matterViewed: 'pro.matter_viewed',
  accountingViewed: 'pro.accounting_viewed',
  proposed: 'pro.proposed',
  titleSet: 'officer.title_set',
  dualControlSet: 'dual_control.set',
  signoff: 'approval.signoff',
} as const
