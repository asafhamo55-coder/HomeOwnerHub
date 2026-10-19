import { addCalendarDays, calendarDaysBetween } from '@/lib/association-time'
import { formatDay, formatDayRange, periodLabel } from '@/lib/money/format'
import {
  CA_ITEMS_NOT_GENERATED,
  CA_NOTES,
  CA_PARTIAL_LABEL,
  CA_WINDOW_DAYS,
  FL_CITATION,
  FL_COPY_AVAILABLE_LINE,
} from './law'

/**
 * The owner budget notice (BL-091), built from an adopted (approved)
 * budget. Pure and client-safe: the page loads the input on the server,
 * the board fills the BLANKs in the browser, and the same HTML is used
 * for the preview, the printout and the announcement draft.
 *
 * Every figure comes from the budget lines, the regular assessments
 * billed for the budget's fiscal period, or the number of billable homes.
 * Anything the app can't know is a BLANK (`value: null`) the board fills
 * in; while any BLANK is left, neither output is offered.
 */

// ─── input ───────────────────────────────────────────────────────────

export type Jurisdiction = 'FL' | 'CA' | 'generic'

export function jurisdictionOf(state: string | null | undefined): Jurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' ? 'FL' : s === 'CA' ? 'CA' : 'generic'
}

/** The account the app posts regular assessment income to (packages/db refs). */
export const ASSESSMENT_INCOME_ACCOUNT = '4000'

export interface NoticeLineInput {
  accountNumber: string
  accountName: string
  accountType: string
  /** Dollars, as stored on budget_line_items.amount. */
  amount: number
}

export interface RegularCharge {
  unitId: string
  /** Dollars, as stored on assessments.amount. */
  amount: number
  dueDate: string
}

export interface BudgetNoticeInput {
  budgetId: string
  status: string
  associationName: string | null
  state: string | null
  fundName: string | null
  period: { start_date: string; end_date: string } | null
  /** The association's day the budget was approved, or null. */
  approvedDay: string | null
  lines: NoticeLineInput[]
  /** Homes the association bills dues to; null when it couldn't be counted. */
  billableUnits: number | null
  /** Regular assessments billed for the budget's fiscal period. */
  regularCharges: RegularCharge[]
}

// ─── money ───────────────────────────────────────────────────────────

export const toCents = (dollars: number) => Math.round(dollars * 100)

export const usdCents = (c: number) =>
  `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function parseMoneyCents(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

/** "-1,500", "(1,500.00)", "−$1500" → -150000; "2,000" → 200000. */
export function parseSignedMoneyCents(s: string): number | null {
  let t = s.trim().replace(/[$,\s]/g, '').replace(/^[−–]/, '-')
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  } else if (t.startsWith('-')) {
    negative = true
    t = t.slice(1)
  } else if (t.startsWith('+')) {
    t = t.slice(1)
  }
  const c = parseMoneyCents(t)
  if (c === null) return null
  return negative ? -c : c
}

export function surplusLabel(cents: number): string {
  if (cents > 0) return `Surplus of ${usdCents(cents)}`
  if (cents < 0) return `Deficit of ${usdCents(-cents)}`
  return 'Break-even ($0.00)'
}

// ─── figures ─────────────────────────────────────────────────────────

export interface NoticeLine {
  accountNumber: string
  accountName: string
  amountCents: number
}

export type PerHome =
  | {
      kind: 'schedule'
      annualCents: number
      homes: number
      installments: { count: number; amountCents: number; firstDue: string } | null
    }
  | {
      kind: 'units'
      annualCents: number
      homes: number
      assessmentIncomeCents: number
      /** Cents left over when the income doesn't divide evenly. */
      remainderCents: number
    }
  | { kind: 'unknown'; reason: string }

export interface Figures {
  income: NoticeLine[]
  expenses: NoticeLine[]
  /** Lines on accounts that are neither income nor expense; not in the totals. */
  otherLineCount: number
  incomeTotalCents: number
  expenseTotalCents: number
  /** Budgeted income − budgeted expenses. */
  netCents: number
  perHome: PerHome
  /** True when the period runs one full year, so "per year" is accurate. */
  fullYear: boolean
}

function isFullYear(p: { start_date: string; end_date: string } | null): boolean {
  if (!p) return false
  const days = calendarDaysBetween(p.start_date, p.end_date) + 1
  return days === 365 || days === 366
}

interface ScheduleResult {
  /** Homes with at least one regular charge in the period. */
  homes: number
  /** Uniform per-home total, or null when homes are billed different totals. */
  annualCents: number | null
  minCents: number
  maxCents: number
  installments: { count: number; amountCents: number; firstDue: string } | null
}

export function readSchedule(charges: RegularCharge[]): ScheduleResult | null {
  if (charges.length === 0) return null
  const byUnit = new Map<string, RegularCharge[]>()
  for (const c of charges) {
    const list = byUnit.get(c.unitId)
    if (list) list.push(c)
    else byUnit.set(c.unitId, [c])
  }
  const totals = [...byUnit.values()].map((list) => list.reduce((t, c) => t + toCents(c.amount), 0))
  const minCents = Math.min(...totals)
  const maxCents = Math.max(...totals)
  const uniform = minCents === maxCents

  let installments: ScheduleResult['installments'] = null
  if (uniform) {
    const lists = [...byUnit.values()]
    const count = lists[0]!.length
    const amount = toCents(lists[0]![0]!.amount)
    const same = lists.every((l) => l.length === count && l.every((c) => toCents(c.amount) === amount))
    if (same) {
      const firstDue = charges.map((c) => c.dueDate).sort()[0]!
      installments = { count, amountCents: amount, firstDue }
    }
  }
  return { homes: byUnit.size, annualCents: uniform ? minCents : null, minCents, maxCents, installments }
}

export function perHomeOf(input: Pick<BudgetNoticeInput, 'lines' | 'billableUnits' | 'regularCharges'>): PerHome {
  const schedule = readSchedule(input.regularCharges)
  const homes = input.billableUnits
  const incomeLines = input.lines.filter((l) => l.accountType === 'income' && l.accountNumber === ASSESSMENT_INCOME_ACCOUNT)
  const assessmentIncomeCents = incomeLines.reduce((t, l) => t + toCents(l.amount), 0)

  const fromUnits =
    homes !== null && homes > 0 && assessmentIncomeCents > 0
      ? {
          kind: 'units' as const,
          annualCents: Math.floor(assessmentIncomeCents / homes),
          homes,
          assessmentIncomeCents,
          remainderCents: assessmentIncomeCents % homes,
        }
      : null

  if (schedule) {
    if (schedule.annualCents === null) {
      return {
        kind: 'unknown',
        reason: `Homes are billed different amounts for this period (${usdCents(schedule.minCents)} to ${usdCents(schedule.maxCents)}), so there is no single per-home figure.`,
      }
    }
    if (homes !== null && schedule.homes < homes) {
      return {
        kind: 'unknown',
        reason: `Only ${schedule.homes} of ${homes} homes have been billed for this period so far, so the billed amount may not be the full assessment.`,
      }
    }
    if (fromUnits && Math.abs(fromUnits.annualCents - schedule.annualCents) > 1) {
      return {
        kind: 'unknown',
        reason: `The charges billed for this period (${usdCents(schedule.annualCents)} per home) don’t match the budgeted assessment income shared equally (${usdCents(fromUnits.annualCents)} per home).`,
      }
    }
    return { kind: 'schedule', annualCents: schedule.annualCents, homes: schedule.homes, installments: schedule.installments }
  }

  if (fromUnits) return fromUnits
  if (assessmentIncomeCents <= 0) {
    return { kind: 'unknown', reason: `No dues are billed for this period yet and the budget has no assessment income line (account ${ASSESSMENT_INCOME_ACCOUNT}).` }
  }
  return { kind: 'unknown', reason: 'No dues are billed for this period yet and the number of homes couldn’t be counted.' }
}

const byAccount = (a: NoticeLine, b: NoticeLine) => a.accountNumber.localeCompare(b.accountNumber)

export function computeFigures(input: BudgetNoticeInput): Figures {
  const pick = (type: string) =>
    input.lines
      .filter((l) => l.accountType === type)
      .map((l) => ({ accountNumber: l.accountNumber, accountName: l.accountName, amountCents: toCents(l.amount) }))
      .sort(byAccount)
  const income = pick('income')
  const expenses = pick('expense')
  const incomeTotalCents = income.reduce((t, l) => t + l.amountCents, 0)
  const expenseTotalCents = expenses.reduce((t, l) => t + l.amountCents, 0)
  return {
    income,
    expenses,
    otherLineCount: input.lines.length - income.length - expenses.length,
    incomeTotalCents,
    expenseTotalCents,
    netCents: incomeTotalCents - expenseTotalCents,
    perHome: perHomeOf(input),
    fullYear: isFullYear(input.period),
  }
}

// ─── California timing ───────────────────────────────────────────────

export interface CaWindow {
  /** The last day of the fiscal year before the budget's period. */
  fiscalYearEnd: string
  earliest: string
  latest: string
  status: 'early' | 'within' | 'late'
}

/** § 5300(a): 30 to 90 days before the end of the fiscal year the budget follows. */
export function caWindow(period: { start_date: string } | null, today: string): CaWindow | null {
  if (!period) return null
  const fiscalYearEnd = addCalendarDays(period.start_date, -1)
  const earliest = addCalendarDays(fiscalYearEnd, -CA_WINDOW_DAYS.earliest)
  const latest = addCalendarDays(fiscalYearEnd, -CA_WINDOW_DAYS.latest)
  const status = today < earliest ? 'early' : today > latest ? 'late' : 'within'
  return { fiscalYearEnd, earliest, latest, status }
}

// ─── fields ──────────────────────────────────────────────────────────

export type FieldKind = 'text' | 'textarea' | 'signed_money'

export interface NoticeField {
  key: string
  label: string
  kind: FieldKind
  /** Null = BLANK: the app does not know it and the board must fill it in. */
  value: string | null
  hint?: string
}

export type FieldValues = Record<string, string>

function perHomeValue(f: Figures): string | null {
  const p = f.perHome
  if (p.kind === 'unknown') return null
  return `${usdCents(p.annualCents)} ${f.fullYear ? 'per year' : 'for the budget period'}`
}

function paymentValue(f: Figures): string | null {
  const p = f.perHome
  if (p.kind !== 'schedule' || !p.installments) return null
  const i = p.installments
  return i.count === 1
    ? `One payment of ${usdCents(i.amountCents)}, due ${formatDay(i.firstDue)}`
    : `${i.count} installments of ${usdCents(i.amountCents)}, the first due ${formatDay(i.firstDue)}`
}

export function fieldsFor(j: Jurisdiction, input: BudgetNoticeInput, f: Figures): NoticeField[] {
  const fields: NoticeField[] = [
    {
      key: 'adoptedOn',
      label: 'Date the board adopted the budget',
      kind: 'text',
      value: input.approvedDay ? formatDay(input.approvedDay) : null,
    },
    {
      key: 'perHome',
      label: 'Regular assessment per home',
      kind: 'text',
      value: perHomeValue(f),
      hint: f.perHome.kind === 'unknown' ? `${f.perHome.reason} Enter the amount from your assessment resolution, e.g. “$1,200 per year”.` : undefined,
    },
    {
      key: 'payment',
      label: 'How owners pay it',
      kind: 'text',
      value: paymentValue(f),
      hint: 'For example “12 monthly installments of $100, due on the 1st”.',
    },
    {
      key: 'reserves',
      label: 'Reserve accounts and contributions in this budget',
      kind: 'textarea',
      value: null,
      hint:
        j === 'FL'
          ? 'HomeownerHub has no reserve module. List each reserve account and this year’s contribution, or write “None — this budget does not include reserve accounts” (§ 720.303(6)(b)–(d)).'
          : j === 'CA'
            ? 'HomeownerHub has no reserve module. Summarize this year’s reserve contributions. The § 5565 reserve summary and § 5570 disclosure form are still attached separately.'
            : 'HomeownerHub has no reserve module. List each reserve account and this year’s contribution, or write “None”.',
    },
  ]
  if (j === 'FL') {
    fields.push(
      {
        key: 'surplus',
        label: 'Estimated surplus or deficit at the end of the current year',
        kind: 'signed_money',
        value: null,
        hint: 'From this year’s actuals and forecast (§ 720.303(6)(a)). Enter a deficit as a negative amount, e.g. -1500.',
      },
      {
        key: 'amenities',
        label: 'Fees or charges the association pays for recreational amenities',
        kind: 'textarea',
        value: null,
        hint: '§ 720.303(6)(a) requires these set out separately, whoever owns the amenity. Write “None” if there are none.',
      },
    )
  }
  if (j === 'CA') {
    fields.push(
      {
        key: 'deferral',
        label: 'Deferred or not-undertaken repairs of major components (§ 5300(b)(4))',
        kind: 'textarea',
        value: null,
        hint: 'Whether the board has decided to defer or not undertake repair or replacement of any major component with 30 years or less of remaining life, and why. Write “None” if none.',
      },
      {
        key: 'specials',
        label: 'Anticipated special assessments (§ 5300(b)(5))',
        kind: 'textarea',
        value: null,
        hint: 'Whether the board has determined or anticipates special assessments for major components or reserves; if so, the estimated amount, start date and duration.',
      },
      {
        key: 'mechanisms',
        label: 'How the board will fund reserves (§ 5300(b)(6))',
        kind: 'textarea',
        value: null,
        hint: 'Assessments, borrowing, use of other assets, deferral of replacements, or other mechanisms.',
      },
      {
        key: 'loans',
        label: 'Outstanding loans with an original term over one year (§ 5300(b)(8))',
        kind: 'textarea',
        value: null,
        hint: 'Payee, interest rate, amount outstanding, annual payment and payoff date for each, or “None”.',
      },
    )
  }
  return fields
}

function filled(field: NoticeField, entry: string | undefined): boolean {
  if (field.value !== null) return true
  const v = (entry ?? '').trim()
  if (!v) return false
  if (field.kind === 'signed_money') return parseSignedMoneyCents(v) !== null
  return true
}

/** Labels of every BLANK still unfilled. Both outputs wait until this is empty. */
export function blanksLeft(fields: NoticeField[], values: FieldValues): string[] {
  return fields.filter((f) => !filled(f, values[f.key])).map((f) => f.label)
}

export function valueOf(field: NoticeField, values: FieldValues): string | null {
  if (field.value !== null) return field.value
  const v = (values[field.key] ?? '').trim()
  if (!filled(field, v)) return null
  if (field.kind === 'signed_money') return surplusLabel(parseSignedMoneyCents(v)!)
  return v
}

// ─── the notice ──────────────────────────────────────────────────────

export interface BudgetNotice {
  jurisdiction: Jurisdiction
  figures: Figures
  fields: NoticeField[]
  caWindow: CaWindow | null
  title: string
  /** Suggested subject for the announcement draft. */
  subject: string
}

export function buildNotice(input: BudgetNoticeInput, today: string): BudgetNotice {
  const j = jurisdictionOf(input.state)
  const figures = computeFigures(input)
  const period = input.period ? periodLabel(input.period) : 'the coming year'
  const title = j === 'CA' ? `Annual Budget Report — ${period}` : `Annual Budget — ${period}`
  return {
    jurisdiction: j,
    figures,
    fields: fieldsFor(j, input, figures),
    caWindow: j === 'CA' ? caWindow(input.period, today) : null,
    title,
    subject: `${input.associationName ? `${input.associationName}: ` : ''}${j === 'CA' ? 'annual budget report' : 'annual budget'} for ${period}`,
  }
}

/** Not adopted yet → the notice is not offered. */
export function noticeProblem(input: Pick<BudgetNoticeInput, 'status' | 'lines'>): string | null {
  if (input.status !== 'approved') return 'Only an adopted (approved) budget can be sent to owners. Approve this budget first.'
  if (input.lines.length === 0) return 'This budget has no lines yet.'
  return null
}

// ─── HTML (preview, print and announcement body) ─────────────────────

/** Escapes HTML, and braces so board text can't become a {{ merge variable }}. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
}

const text = (s: string) => escapeHtml(s).replace(/\n/g, '<br>')

export const BLANK_CLASS = 'budget-notice-blank'

function blank(label: string) {
  return `<mark class="${BLANK_CLASS}">[[BLANK: ${escapeHtml(label)}]]</mark>`
}

/**
 * The notice as HTML. With BLANKs left they render as highlighted
 * [[BLANK: …]] markers — the page never lets that version leave the
 * preview (both outputs are disabled until `blanksLeft` is empty).
 */
export function noticeHtml(notice: BudgetNotice, input: BudgetNoticeInput, values: FieldValues): string {
  const j = notice.jurisdiction
  const f = notice.figures
  const field = (key: string) => notice.fields.find((x) => x.key === key)
  const show = (key: string) => {
    const fl = field(key)
    if (!fl) return ''
    const v = valueOf(fl, values)
    return v === null ? blank(fl.label) : text(v)
  }
  const row = (label: string, value: string) => `<p><strong>${escapeHtml(label)}:</strong> ${value}</p>`
  const money = (c: number) => escapeHtml(usdCents(c))
  const assoc = input.associationName?.trim() || 'The association'
  const out: string[] = []

  out.push(`<h2>${escapeHtml(notice.title)}</h2>`)
  out.push(`<p>${escapeHtml(assoc)}${input.fundName ? ` · ${escapeHtml(input.fundName)}` : ''}</p>`)
  if (j === 'CA') out.push(`<p><strong>${escapeHtml(CA_PARTIAL_LABEL)}</strong></p>`)
  out.push(
    `<p>The board has adopted the budget below${input.period ? ` for ${escapeHtml(formatDayRange(input.period.start_date, input.period.end_date))}` : ''}. Adopted on ${show('adoptedOn')}.</p>`,
  )

  out.push('<h3>Your regular assessment</h3>')
  out.push(row('Per home', show('perHome')))
  out.push(row('How it is paid', show('payment')))
  if (f.perHome.kind === 'units') {
    out.push(
      `<p><small>Budgeted assessment income of ${money(f.perHome.assessmentIncomeCents)} shared equally across ${f.perHome.homes} homes${f.perHome.remainderCents ? ', rounded down to the cent' : ''}.</small></p>`,
    )
  }

  out.push('<h3>Budget by category</h3>')
  const lineRows = (lines: NoticeLine[]) =>
    lines.map((l) => `<tr><td>${escapeHtml(l.accountName)}</td><td style="text-align:right">${money(l.amountCents)}</td></tr>`).join('')
  out.push('<table style="width:100%;border-collapse:collapse">')
  out.push('<thead><tr><th style="text-align:left">Category</th><th style="text-align:right">Budgeted</th></tr></thead><tbody>')
  out.push('<tr><td colspan="2"><strong>Income</strong></td></tr>')
  out.push(f.income.length ? lineRows(f.income) : '<tr><td colspan="2">No income budgeted</td></tr>')
  out.push(`<tr><td><strong>Total income</strong></td><td style="text-align:right"><strong>${money(f.incomeTotalCents)}</strong></td></tr>`)
  out.push('<tr><td colspan="2"><strong>Expenses</strong></td></tr>')
  out.push(f.expenses.length ? lineRows(f.expenses) : '<tr><td colspan="2">No expenses budgeted</td></tr>')
  out.push(`<tr><td><strong>Total expenses</strong></td><td style="text-align:right"><strong>${money(f.expenseTotalCents)}</strong></td></tr>`)
  out.push(`<tr><td><strong>Income less expenses</strong></td><td style="text-align:right"><strong>${money(f.netCents)}</strong></td></tr>`)
  out.push('</tbody></table>')

  if (j === 'FL') {
    out.push(`<h3>Also required by ${escapeHtml(FL_CITATION)}</h3>`)
    out.push(row('Estimated surplus or deficit at the end of the current year', show('surplus')))
    out.push(row('Fees or charges the association pays for recreational amenities', show('amenities')))
    out.push(row('Reserve accounts and contributions', show('reserves')))
    out.push(`<p>${escapeHtml(FL_COPY_AVAILABLE_LINE)}</p>`)
  } else if (j === 'CA') {
    out.push('<h3>Board statements (Cal. Civ. Code § 5300(b))</h3>')
    out.push(row('Deferred or not-undertaken repairs of major components (§ 5300(b)(4))', show('deferral')))
    out.push(row('Anticipated special assessments (§ 5300(b)(5))', show('specials')))
    out.push(row('How the board will fund reserves (§ 5300(b)(6))', show('mechanisms')))
    out.push(row('Outstanding loans over one year (§ 5300(b)(8))', show('loans')))
    out.push(row('Reserve accounts and contributions', show('reserves')))
    out.push('<h3>Not included in this notice</h3>')
    out.push('<p>The full annual budget report also includes the following, which the board provides separately:</p>')
    out.push(`<ul>${CA_ITEMS_NOT_GENERATED.map((i) => `<li><strong>${escapeHtml(i.cite)}</strong> ${escapeHtml(i.text)}</li>`).join('')}</ul>`)
    out.push(`<p>${escapeHtml(CA_NOTES[0]!)}</p>`)
  } else {
    out.push('<h3>Reserves</h3>')
    out.push(row('Reserve accounts and contributions', show('reserves')))
  }

  out.push('<p>Questions about the budget? Contact the board.</p>')
  out.push(`<p>Board of Directors, ${escapeHtml(assoc)}</p>`)
  return out.join('\n')
}
