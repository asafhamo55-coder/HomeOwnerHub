/**
 * BL-132: the association's insurance policies and fidelity bond
 * (migration 0068 part 1, insurance_policies; M4_APPLIED).
 *
 * Pure and import-free: the dashboard, the /insurance page and the daily
 * digest (packages/jobs/src/daily-digest.ts, by relative path) all use it.
 * No clock: callers pass the association's today (YYYY-MM-DD).
 *
 * Board-facing only. Nothing here is sent to a resident.
 *
 * The coverage check quotes ONLY statute text kept in the repo
 * (scripts/fixtures/state-law), checked word for word by model.test.ts:
 *   FL — flsenate-ch720-2026.html: Fla. Stat. § 720.3033(5).
 *   CA — ca-civ-davis-stirling-2026.txt: Civ. Code § 5300(b)(9).
 * Cal. Civ. Code § 5806 (the fidelity minimum) is NOT in the fixtures, so
 * the app says "check your governing documents" for it instead.
 */

// ─── kinds ───────────────────────────────────────────────────────────

/** Same list as insurance_policies.kind's CHECK (migrations/0068). */
export const POLICY_KINDS = [
  'property',
  'liability',
  'directors_officers',
  'fidelity',
  'flood',
  'earthquake',
  'umbrella',
  'workers_comp',
  'other',
] as const
export type PolicyKind = (typeof POLICY_KINDS)[number]

export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  property: 'Master / property',
  liability: 'General liability',
  directors_officers: 'Directors & officers (D&O)',
  fidelity: 'Fidelity / crime bond',
  flood: 'Flood',
  earthquake: 'Earthquake',
  umbrella: 'Umbrella',
  workers_comp: 'Workers’ comp',
  other: 'Other',
}

export function isPolicyKind(v: unknown): v is PolicyKind {
  return typeof v === 'string' && (POLICY_KINDS as readonly string[]).includes(v)
}

export const INSURANCE_TABLE = 'insurance_policies'

/** What a write says while M4_APPLIED is off. */
export const INSURANCE_NOT_LIVE = 'Insurance tracking turns on after an update to the database. Nothing was saved.'
export const INSURANCE_COLUMNS =
  'id, organization_id, association_id, kind, carrier, policy_number, coverage_limit_cents, deductible_cents, premium_cents, effective_on, expires_on, document_id, notes, created_at, updated_at'

export interface InsurancePolicy {
  id: string
  associationId: string | null
  kind: PolicyKind
  carrier: string
  policyNumber: string | null
  coverageLimitCents: number | null
  deductibleCents: number | null
  premiumCents: number | null
  effectiveOn: string | null
  expiresOn: string
  documentId: string | null
  notes: string | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** A raw insurance_policies row → the model; null when it is unusable. */
export function policyFromRow(r: Record<string, unknown>): InsurancePolicy | null {
  if (typeof r.id !== 'string' || !isPolicyKind(r.kind) || typeof r.expires_on !== 'string') return null
  return {
    id: r.id,
    associationId: str(r.association_id),
    kind: r.kind,
    carrier: typeof r.carrier === 'string' ? r.carrier : '',
    policyNumber: str(r.policy_number),
    coverageLimitCents: num(r.coverage_limit_cents),
    deductibleCents: num(r.deductible_cents),
    premiumCents: num(r.premium_cents),
    effectiveOn: str(r.effective_on),
    expiresOn: r.expires_on.slice(0, 10),
    documentId: str(r.document_id),
    notes: str(r.notes),
  }
}

// ─── days ────────────────────────────────────────────────────────────

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}
/** Whole days from `a` to `b`; null when either is unreadable. */
export function daysFrom(a: string, b: string): number | null {
  const x = dayMs(a)
  const y = dayMs(b)
  return x === null || y === null ? null : Math.round((y - x) / 86_400_000)
}

/** In force on `today`: started (or no start recorded) and not yet expired. */
export function isActive(p: Pick<InsurancePolicy, 'effectiveOn' | 'expiresOn'>, today: string): boolean {
  const left = daysFrom(today, p.expiresOn)
  if (left === null || left < 0) return false
  if (p.effectiveOn) {
    const since = daysFrom(p.effectiveOn, today)
    if (since === null || since < 0) return false
  }
  return true
}

// ─── expiry reminders ────────────────────────────────────────────────

/** Reminders start this many days before a policy expires. */
export const REMINDER_THRESHOLDS = [90, 60, 30] as const
export const REMINDER_WINDOW_DAYS = 90

export type ReminderTone = 'expired' | '30' | '60' | '90'

export interface PolicyReminder {
  policyId: string
  kind: PolicyKind
  carrier: string
  expiresOn: string
  /** Negative once expired. */
  daysLeft: number
  tone: ReminderTone
}

function toneFor(daysLeft: number): ReminderTone | null {
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return '30'
  if (daysLeft <= 60) return '60'
  if (daysLeft <= 90) return '90'
  return null
}

/**
 * A later policy of the same kind and association that runs past this
 * one's expiry: the renewal is recorded, so this one needs no reminder.
 */
function isRenewed(p: InsurancePolicy, all: readonly InsurancePolicy[]): boolean {
  return all.some((q) => {
    if (q.id === p.id || q.kind !== p.kind || q.associationId !== p.associationId) return false
    const later = daysFrom(p.expiresOn, q.expiresOn)
    if (later === null || later <= 0) return false
    // The renewal must start no later than the day after this one expires.
    if (!q.effectiveOn) return true
    const gap = daysFrom(p.expiresOn, q.effectiveOn)
    return gap !== null && gap <= 1
  })
}

/** Policies expiring within 90 days or already expired, and not renewed; soonest first. */
export function policyReminders(policies: readonly InsurancePolicy[], today: string): PolicyReminder[] {
  const out: PolicyReminder[] = []
  for (const p of policies) {
    const daysLeft = daysFrom(today, p.expiresOn)
    if (daysLeft === null) continue
    const tone = toneFor(daysLeft)
    if (!tone || isRenewed(p, policies)) continue
    out.push({ policyId: p.id, kind: p.kind, carrier: p.carrier, expiresOn: p.expiresOn, daysLeft, tone })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function reminderLabel(r: Pick<PolicyReminder, 'daysLeft'>): string {
  if (r.daysLeft < 0) {
    const d = -r.daysLeft
    return `Expired ${d} day${d === 1 ? '' : 's'} ago`
  }
  if (r.daysLeft === 0) return 'Expires today'
  return `Expires in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`
}

/** One short digest line per reminder: the kind and the countdown. No carrier, no policy number. */
export function reminderDigestLine(r: PolicyReminder): string {
  return `${POLICY_KIND_LABELS[r.kind]} policy: ${reminderLabel(r).toLowerCase()}`
}

/** The digest block's headline: counts only. */
export function remindersSummary(reminders: readonly PolicyReminder[]): string {
  const expired = reminders.filter((r) => r.tone === 'expired').length
  const soon = reminders.length - expired
  const parts: string[] = []
  if (expired > 0) parts.push(`${expired} insurance polic${expired === 1 ? 'y has' : 'ies have'} expired`)
  if (soon > 0) parts.push(`${soon} insurance polic${soon === 1 ? 'y expires' : 'ies expire'} within ${REMINDER_WINDOW_DAYS} days`)
  return parts.join('; ')
}

// ─── coverage check ──────────────────────────────────────────────────

export interface InsuranceCitation {
  cite: string
  /** Verbatim from the fixture. */
  quote: string
  fixture: string
}

const FL_FILE = 'flsenate-ch720-2026.html'
const CA_FILE = 'ca-civ-davis-stirling-2026.txt'

export const FL_3033_BOND: InsuranceCitation = {
  cite: 'Fla. Stat. § 720.3033(5)',
  quote: 'The association shall maintain insurance or a fidelity bond for all persons who control or disburse funds of the association.',
  fixture: FL_FILE,
}
export const FL_3033_AMOUNT: InsuranceCitation = {
  cite: 'Fla. Stat. § 720.3033(5)',
  quote:
    'The insurance policy or fidelity bond must cover the maximum funds that will be in the custody of the association or its management agent at any one time.',
  fixture: FL_FILE,
}
export const FL_3033_WAIVER: InsuranceCitation = {
  cite: 'Fla. Stat. § 720.3033(5)',
  quote:
    'If annually approved by a majority of the voting interests present at a properly called meeting of the association, an association may waive the requirement of obtaining an insurance policy or fidelity bond for all persons who control or disburse funds of the association.',
  fixture: FL_FILE,
}
export const CA_5300_SUMMARY: InsuranceCitation = {
  cite: 'Cal. Civ. Code § 5300(b)(9)',
  quote:
    'A summary of the association’s property, general liability, earthquake, flood, and fidelity insurance policies. For each policy, the summary shall include the name of the insurer, the type of insurance, the policy limit, and the amount of the deductible, if any.',
  fixture: CA_FILE,
}

export const ALL_INSURANCE_CITATIONS: readonly InsuranceCitation[] = [FL_3033_BOND, FL_3033_AMOUNT, FL_3033_WAIVER, CA_5300_SUMMARY]

export const CHECK_GOVERNING_DOCUMENTS =
  'HomeownerHub has no loaded statute text on insurance for this. Check your governing documents and ask your insurance agent or the association’s attorney.'

export const INSURANCE_NOT_LEGAL_ADVICE = 'General information from the statute text, not legal advice.'

/** What the coverage check does not check, by state, because the text is not loaded. */
export const INSURANCE_NOT_LOADED: Record<string, string[]> = {
  CA: [
    'Cal. Civ. Code § 5806 fidelity minimum: the section text is not loaded, so the app does not check how much fidelity coverage is required. Check your governing documents.',
  ],
  FL: [],
}

/** The kinds § 5300(b)(9) asks the annual budget report to summarize. */
export const CA_SUMMARY_KINDS: readonly PolicyKind[] = ['property', 'liability', 'earthquake', 'flood', 'fidelity']

export type CoverageSeverity = 'warn' | 'info'

export interface CoverageFinding {
  code: string
  severity: CoverageSeverity
  message: string
  citations: InsuranceCitation[]
}

export interface CoverageCheck {
  state: string | null
  findings: CoverageFinding[]
  notLoaded: string[]
}

function normaliseState(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase()
  if (s === 'FLORIDA') return 'FL'
  if (s === 'CALIFORNIA') return 'CA'
  return /^[A-Z]{2}$/.test(s) ? s : null
}

/**
 * What the loaded statute text says about the policies on record. Warnings
 * only: the app can't see the declarations page or what the association
 * voted, so nothing here blocks anything.
 */
export function coverageCheck(state: string | null | undefined, policies: readonly InsurancePolicy[], today: string): CoverageCheck {
  const st = normaliseState(state)
  const active = policies.filter((p) => isActive(p, today))
  const findings: CoverageFinding[] = []

  if (st === 'FL') {
    const bonds = active.filter((p) => p.kind === 'fidelity')
    if (bonds.length === 0) {
      findings.push({
        code: 'fl_fidelity_missing',
        severity: 'warn',
        message:
          'No fidelity bond or crime policy in force is recorded. Florida requires one for everyone who controls or disburses the association’s money, unless the members vote each year to waive it. If they did, keep the minutes with your records.',
        citations: [FL_3033_BOND, FL_3033_WAIVER],
      })
    } else {
      findings.push({
        code: 'fl_fidelity_amount',
        severity: 'info',
        message:
          'The fidelity bond must cover the most money the association or its manager holds at any one time. Compare the bond’s limit with your highest combined bank and reserve balance of the year.',
        citations: [FL_3033_AMOUNT],
      })
    }
  } else if (st === 'CA') {
    for (const kind of CA_SUMMARY_KINDS) {
      if (!active.some((p) => p.kind === kind)) {
        findings.push({
          code: `ca_summary_missing_${kind}`,
          severity: 'warn',
          message: `No ${POLICY_KIND_LABELS[kind].toLowerCase()} policy in force is recorded. The annual budget report summarizes this kind of policy; record it here, or say in the summary that the association doesn’t carry it.`,
          citations: [CA_5300_SUMMARY],
        })
      }
    }
    const incomplete = active.filter(
      (p) => CA_SUMMARY_KINDS.includes(p.kind) && (p.coverageLimitCents === null || p.deductibleCents === null),
    )
    if (incomplete.length > 0) {
      findings.push({
        code: 'ca_summary_incomplete',
        severity: 'warn',
        message: `${incomplete.length === 1 ? 'One policy is' : `${incomplete.length} policies are`} missing the limit or the deductible. The annual budget report summary lists the insurer, the type, the limit and the deductible for each policy.`,
        citations: [CA_5300_SUMMARY],
      })
    }
    findings.push({
      code: 'ca_fidelity_minimum',
      severity: 'info',
      message: `How much fidelity coverage is required: ${CHECK_GOVERNING_DOCUMENTS}`,
      citations: [],
    })
  } else {
    findings.push({ code: 'check_governing_documents', severity: 'info', message: CHECK_GOVERNING_DOCUMENTS, citations: [] })
  }

  return { state: st, findings, notLoaded: st ? (INSURANCE_NOT_LOADED[st] ?? []) : [] }
}

// ─── money ───────────────────────────────────────────────────────────

/** "1,250.50" / "$1,250" / 1250.5 → cents; null when blank; NaN when unreadable. */
export function dollarsToCents(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : Number.NaN
  const s = String(v).replace(/[$,\s]/g, '')
  if (s === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN
  return Math.round(Number(s) * 100)
}

export function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}
