// BL-081: stop / pause / resume and edit a recurring journal entry. Pure.
//
// THE SCHEMA. recurring_journal_entries has is_active, cadence,
// next_run_date and template_je_id — nothing else. So:
//   - Pause and Stop both set is_active = false (the job only reads active
//     rules). What tells them apart is the rule's latest lifecycle audit
//     row: a stopped rule can't be resumed or edited from the app. (A
//     status column would make this durable on its own — reported in
//     BL-081, not added: no migrations in this change.)
//   - There is no end date column, so an end date can't be set.
//   - The amounts, accounts and memo live on the TEMPLATE entry the job
//     copies. The template is usually a posted entry, and posted entries
//     never change. An edit therefore saves a new DRAFT template (drafts
//     are never on the books) and points the rule at it; entries already
//     posted — the original and every copy — are untouched.

export const RECURRING_AUDIT_ENTITY = 'recurring_journal_entry'
export const RECURRING_AUDIT = {
  paused: 'recurring_je.paused',
  resumed: 'recurring_je.resumed',
  stopped: 'recurring_je.stopped',
  updated: 'recurring_je.updated',
} as const
export const LIFECYCLE_ACTIONS: readonly string[] = [RECURRING_AUDIT.paused, RECURRING_AUDIT.resumed, RECURRING_AUDIT.stopped]

/** entry_number prefix of an edited template — a draft, never posted.
 *  Kept off the JE-YYYY-NNNNN sequence so it never takes a ledger number. */
export const TEMPLATE_ENTRY_PREFIX = 'TPL-'

export function isTemplateEntryNumber(entryNumber: string | null | undefined): boolean {
  return typeof entryNumber === 'string' && entryNumber.startsWith(TEMPLATE_ENTRY_PREFIX)
}

export function templateEntryNumber(ruleId: string, now: Date): string {
  return `${TEMPLATE_ENTRY_PREFIX}${ruleId.slice(0, 8)}-${now.getTime().toString(36)}`
}

export type RecurringState = 'active' | 'paused' | 'stopped'

/** The rule's state from is_active and its newest lifecycle audit action. */
export function recurringState(isActive: boolean, latestLifecycleAction: string | null | undefined): RecurringState {
  if (isActive) return 'active'
  return latestLifecycleAction === RECURRING_AUDIT.stopped ? 'stopped' : 'paused'
}

export type LifecycleAction = 'pause' | 'resume' | 'stop'

/** Which actions a rule in `state` offers. */
export function allowedActions(state: RecurringState): LifecycleAction[] {
  if (state === 'active') return ['pause', 'stop']
  if (state === 'paused') return ['resume', 'stop']
  return []
}

export const CADENCES = ['monthly', 'quarterly', 'annually', 'weekly', 'daily'] as const
export type Cadence = (typeof CADENCES)[number]

export interface EditLine {
  accountId: string
  fundId: string
  debit: number
  credit: number
}

export interface RecurringEditInput {
  memo: string
  cadence: string
  nextRunDate: string
  lines: EditLine[]
}

export interface AccountRef {
  id: string
  /** The account's own fund; null = shared across funds. */
  fundId: string | null
  isActive: boolean
}

const cents = (n: number) => Math.round(Number(n) * 100)
const DAY = /^\d{4}-\d{2}-\d{2}$/

function realDay(s: string): boolean {
  if (!DAY.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/**
 * Field errors for an edit, or {} when it can be saved. Keys:
 * memo, cadence, nextRunDate, lines (the whole entry), lines.<i>.account,
 * lines.<i>.fund, lines.<i>.amount.
 *
 * `today` is the ASSOCIATION's calendar day: a next run before it would
 * post at once for a day already gone; today itself is allowed.
 */
export function validateRecurringEdit(
  input: RecurringEditInput,
  ctx: { accounts: readonly AccountRef[]; fundIds: readonly string[]; today: string },
): Record<string, string> {
  const errors: Record<string, string> = {}
  const memo = input.memo.trim()
  if (!memo) errors.memo = 'Enter a description.'
  else if (memo.length > 2000) errors.memo = 'Keep the description under 2,000 characters.'

  if (!(CADENCES as readonly string[]).includes(input.cadence)) errors.cadence = 'Choose how often it repeats.'

  if (!realDay(input.nextRunDate)) errors.nextRunDate = 'Pick a date.'
  else if (input.nextRunDate < ctx.today) errors.nextRunDate = 'Pick today or a later date.'

  if (input.lines.length < 2) {
    errors.lines = 'An entry needs at least two lines.'
    return errors
  }

  const accounts = new Map(ctx.accounts.map((a) => [a.id, a]))
  const funds = new Set(ctx.fundIds)
  let debits = 0
  let credits = 0
  const perFund = new Map<string, number>()
  input.lines.forEach((l, i) => {
    const acct = accounts.get(l.accountId)
    if (!acct) errors[`lines.${i}.account`] = 'Choose an account in this association’s chart of accounts.'
    else if (!acct.isActive) errors[`lines.${i}.account`] = 'This account is inactive. Choose another.'
    if (!funds.has(l.fundId)) errors[`lines.${i}.fund`] = 'Choose a fund in this association.'
    else if (acct?.fundId && acct.fundId !== l.fundId) errors[`lines.${i}.fund`] = 'This account belongs to a different fund.'
    const d = cents(l.debit)
    const c = cents(l.credit)
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) errors[`lines.${i}.amount`] = 'Enter an amount of $0.01 or more.'
    else if ((d > 0) === (c > 0)) errors[`lines.${i}.amount`] = 'Enter a debit or a credit on each line, not both.'
    debits += Math.max(d, 0)
    credits += Math.max(c, 0)
    perFund.set(l.fundId, (perFund.get(l.fundId) ?? 0) + d - c)
  })

  const lineErrors = Object.keys(errors).some((k) => k.startsWith('lines.'))
  if (!lineErrors) {
    if (debits !== credits) {
      errors.lines = `Debits (${(debits / 100).toFixed(2)}) and credits (${(credits / 100).toFixed(2)}) must be equal.`
    } else if ([...perFund.values()].some((net) => net !== 0)) {
      errors.lines = 'Each fund must balance on its own. Move money between funds with a separate transfer entry.'
    }
  }
  return errors
}

export interface TemplateShape {
  memo: string
  lines: EditLine[]
}

/** True when the memo or any line differs — a new template is needed. */
export function templateChanged(before: TemplateShape, after: TemplateShape): boolean {
  if (before.memo.trim() !== after.memo.trim()) return true
  if (before.lines.length !== after.lines.length) return true
  return before.lines.some((b, i) => {
    const a = after.lines[i]
    return b.accountId !== a.accountId || b.fundId !== a.fundId || cents(b.debit) !== cents(a.debit) || cents(b.credit) !== cents(a.credit)
  })
}

/** A stable line order — debits first, then by account and fund — so the
 *  form and the save compare the same template the same way (the embedded
 *  ledger_entries read has no guaranteed order). */
export function sortLines<T extends Pick<EditLine, 'accountId' | 'fundId' | 'debit'>>(lines: readonly T[]): T[] {
  return [...lines].sort(
    (a, b) =>
      Number(cents(b.debit) > 0) - Number(cents(a.debit) > 0) ||
      a.accountId.localeCompare(b.accountId) ||
      a.fundId.localeCompare(b.fundId),
  )
}

/** Total debits of a set of lines — "the amount" of the entry. */
export function entryTotal(lines: readonly Pick<EditLine, 'debit'>[]): number {
  return lines.reduce((s, l) => s + cents(l.debit), 0) / 100
}
