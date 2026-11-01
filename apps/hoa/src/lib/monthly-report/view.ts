/**
 * The month-end board report as a reading order, shared by every place it is
 * shown: the email (render.ts), the plain-text part, and the in-app page
 * (MonthlyReportView.tsx). Pure: `MonthlyReportData` in, words and figures
 * out. Nothing here queries anything or changes a number; it only chooses
 * what to say about figures the loaders already produced.
 *
 * Two parts:
 *  - `summary`: a few plain sentences, up to four headline figures and the
 *    items worth a look, all written from templates over the actual values.
 *    A sentence is only produced when the section behind it loaded; a failed
 *    section is named, never read as zero or as good news.
 *  - `sections`: the detail, one block per topic, as label / value lines.
 *
 * No AI wording, no advice. The state-law block keeps its "Not legal advice"
 * note.
 */

import { formatDay, plural, usd } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import type { ComplianceSummary } from '@/lib/compliance/obligations'
import type { MonthlyReportData, ReserveReport, Section, Variance } from './model'

/** Brand violet (packages/ui tokens HOA primary; the logo tile uses the same). */
export const BRAND_PRIMARY = '#4B27C9'

/** BL-145: the state-law obligations page. */
export const COMPLIANCE_PATH = '/compliance'

/** Where "Set up a reserve fund" goes: the chart of accounts' Funds card (BL-120). */
export const RESERVE_SETUP_PATH = '/accounting/coa#funds'

/** The in-app report page, which the email's button opens. */
export const REPORT_PAGE_PATH = '/accounting/reports/monthly-report'

export interface MonthlyReportLinks {
  /** Absolute URL for an app path. */
  appUrl: (path: string) => string
}

export type Tone = 'danger' | 'success'

export interface Line {
  label: string
  value: string
  tone?: Tone
}

export interface Block {
  title: string
  /** null when the section failed: `failed` is said instead. */
  lines: Line[] | null
  failed: string
  /** Set when the section loaded but had nothing in it ("No activity this month"). */
  empty?: boolean
  note?: string
  link?: { label: string; href: string }
}

export interface Figure {
  label: string
  value: string
  sub?: string
  tone?: Tone
  /** The section behind it failed to load. */
  unavailable?: boolean
}

export interface AttentionItem {
  text: string
  href?: string
}

export interface ReportSummary {
  /** One sentence on how the month went. */
  headline: string
  tone: 'attention' | 'steady' | 'quiet' | 'partial'
  sentences: string[]
  figures: Figure[]
  attention: AttentionItem[]
  /** Names of sections that failed to load, in report order. */
  unavailable: string[]
}

export interface ReportView {
  summary: ReportSummary
  sections: Block[]
}

// ─── small helpers ──────────────────────────────────────────────────

function pct(part: number, whole: number): string | null {
  if (!(whole > 0)) return null
  return `${Math.round((part / whole) * 100)}%`
}

const isZero = (n: number) => Math.abs(n) < 0.005

function lines<T>(res: Section<T>, fn: (t: T) => Line[]): Line[] | null {
  return res.ok ? fn(res.data) : null
}

function varianceLine(v: Variance): Line {
  const amount = usd(Math.abs(v.variance), { whole: true })
  const favorable = v.variance > 0
  const what =
    v.accountType === 'income'
      ? favorable
        ? `${amount} more than budgeted`
        : `${amount} less than budgeted`
      : favorable
        ? `${amount} under budget`
        : `${amount} over budget`
  return {
    label: v.accountName,
    value: `${what} (${usd(v.actual, { whole: true })} of ${usd(v.budgeted, { whole: true })})`,
    tone: favorable ? 'success' : 'danger',
  }
}

// ─── detail blocks ──────────────────────────────────────────────────

/** BL-120. No reserve fund: a gentle "set one up", never a row of zeros. */
function reserveBlock(res: Section<ReserveReport>, asOf: string, links: MonthlyReportLinks): Block {
  const title = `Reserves as of ${asOf}`
  const failed = 'We couldn’t load the reserve fund, so reserves aren’t shown.'
  if (res.ok && res.data.result.kind === 'no_reserve_fund') {
    return {
      title,
      lines: [{ label: 'Reserve fund', value: 'No reserve fund is set up yet' }],
      failed,
      link: { label: 'Set up a reserve fund', href: links.appUrl(RESERVE_SETUP_PATH) },
    }
  }
  const ready = res.ok && res.data.result.kind === 'ready' ? res.data.result.snapshot : null
  const hint = res.ok ? res.data.hint : null
  return {
    title,
    lines: ready
      ? [
          { label: 'Reserve balance', value: usd(ready.balance) },
          {
            label: 'Contributed this year',
            value: ready.budget
              ? `${usd(ready.contributionsYtd)} of ${usd(ready.budget.ytd)} budgeted so far`
              : `${usd(ready.contributionsYtd)} (no contribution budgeted)`,
            ...(ready.behindBudget ? { tone: 'danger' as const } : {}),
          },
          ...(ready.behindBudget
            ? [{ label: 'Behind budget', value: 'Contributions trail the budget by more than 10%', tone: 'danger' as const }]
            : []),
          ...(ready.interestYtd !== 0 ? [{ label: 'Interest earned this year', value: usd(ready.interestYtd) }] : []),
          { label: 'Drawn this year', value: usd(ready.drawsYtd) },
        ]
      : null,
    failed,
    ...(ready ? { note: `“This year” runs from ${formatDay(ready.year.start)}.${hint ? ` ${hint.cite}: ${hint.text}` : ''}` } : {}),
    link: { label: 'Open the balance sheet', href: links.appUrl('/accounting/reports/balance-sheet') },
  }
}

/** BL-145: one line per count, the most pressing obligation, and the page link. */
function complianceBlock(res: Section<ComplianceSummary>, links: MonthlyReportLinks): Block {
  return {
    title: 'State law compliance',
    lines: lines(res, (c) =>
      c.nothingTracked
        ? [{ label: 'Obligations', value: 'None loaded for your state. Check your governing documents.' }]
        : [
            {
              label: 'Overdue',
              value: c.overdue === 0 ? 'None, on track' : plural(c.overdue, 'obligation'),
              tone: c.overdue > 0 ? 'danger' : 'success',
            },
            { label: 'Coming up', value: c.open - c.overdue === 0 ? 'Nothing dated coming up' : plural(c.open - c.overdue, 'obligation') },
            ...(c.next ? [{ label: 'Most pressing', value: `${c.next.title}: ${c.next.label}`, ...(c.overdue > 0 ? { tone: 'danger' as const } : {}) }] : []),
            ...(c.election ? [{ label: 'Director elections', value: c.election.label }] : []),
          ],
    ),
    failed: 'We couldn’t load your state-law obligations.',
    note: 'Quoted from the statute text HomeownerHub holds. Not legal advice.',
    link: { label: 'Open Compliance', href: links.appUrl(COMPLIANCE_PATH) },
  }
}

function sectionBlocks(d: MonthlyReportData, links: MonthlyReportLinks): Block[] {
  const asOf = formatDay(d.period.end)
  const meeting = d.meeting.ok ? d.meeting.data : null
  const packetHref = meeting ? links.appUrl(`/meetings/${meeting.id}/packet`) : links.appUrl('/accounting/reports')

  const collectionsEmpty = d.collections.ok && isZero(d.collections.data.billed) && isZero(d.collections.data.collected)
  const incomeEmpty = d.income.ok && isZero(d.income.data.totalIncome) && isZero(d.income.data.totalExpenses) && isZero(d.income.data.netIncome)
  const violationsEmpty = d.violations.ok && d.violations.data.opened === 0 && d.violations.data.closed === 0 && d.violations.data.pastCure === 0
  const arcEmpty = d.arc.ok && d.arc.data.submitted === 0 && d.arc.data.approved === 0 && d.arc.data.denied === 0

  return [
    {
      title: `Cash as of ${asOf}`,
      lines: lines(d.cash, (c) => [
        { label: 'Operating cash', value: c.operating === null ? 'No operating cash account' : usd(c.operating) },
        { label: 'Reserve cash', value: c.reserve === null ? 'No reserve cash account' : usd(c.reserve) },
      ]),
      failed: 'We couldn’t load the balance sheet, so cash balances aren’t shown.',
    },
    reserveBlock(d.reserves, asOf, links),
    {
      title: `Dues collected in ${d.period.label}`,
      lines: lines(d.collections, (c) => {
        if (collectionsEmpty) return [{ label: 'Dues', value: 'No charges came due and no payments were received' }]
        const rate = pct(c.collected, c.billed)
        return [
          { label: 'Billed', value: usd(c.billed) },
          { label: 'Collected', value: rate ? `${usd(c.collected)} (${rate} of billed)` : usd(c.collected) },
        ]
      }),
      failed: 'We couldn’t load this month’s charges and payments.',
      ...(collectionsEmpty ? { empty: true } : { note: 'Collected counts every payment received in the month, including ones for earlier charges.' }),
    },
    {
      title: `Overdue dues as of ${asOf}`,
      lines: lines(d.delinquency, (x) =>
        x.units === 0
          ? [{ label: 'Overdue', value: 'Nothing overdue', tone: 'success' }]
          : [
              { label: 'Overdue', value: `${usd(x.total)} across ${plural(x.units, 'unit')}`, tone: 'danger' },
              { label: '90+ days late', value: usd(x.over90), ...(x.over90 > 0 ? { tone: 'danger' as const } : {}) },
            ],
      ),
      failed: 'We couldn’t load overdue charges, so delinquency isn’t shown.',
    },
    {
      title: `Income and expenses, ${d.period.label}`,
      lines: lines(d.income, (s) =>
        incomeEmpty
          ? [{ label: 'Income and expenses', value: 'Nothing was posted this month' }]
          : [
              { label: 'Income', value: usd(s.totalIncome) },
              { label: 'Expenses', value: usd(s.totalExpenses) },
              { label: 'Net', value: usd(s.netIncome), tone: s.netIncome < 0 ? 'danger' : 'success' },
            ],
      ),
      failed: 'We couldn’t load the income statement for the month.',
      ...(incomeEmpty ? { empty: true } : {}),
    },
    {
      title: `Budget vs. actual through ${asOf}`,
      lines: lines(d.budget, (b) =>
        !b.hasBudget
          ? [{ label: 'Budget', value: 'No budget covers this month' }]
          : b.top.length === 0
            ? [{ label: 'Budget', value: 'Every line is on budget' }]
            : b.top.map(varianceLine),
      ),
      failed: 'We couldn’t load the budget comparison.',
      note: 'The lines furthest from the year’s budget so far.',
    },
    {
      title: `Violations in ${d.period.label}`,
      lines: lines(d.violations, (v) =>
        violationsEmpty
          ? [{ label: 'Violations', value: 'None opened or closed, and none past the cure deadline' }]
          : [
              { label: 'Opened', value: String(v.opened) },
              { label: 'Closed', value: String(v.closed) },
              {
                label: 'Past the cure deadline',
                value: `${v.pastCure} at month end`,
                ...(v.pastCure > 0 ? { tone: 'danger' as const } : {}),
              },
            ],
      ),
      failed: 'We couldn’t load violations.',
      ...(violationsEmpty ? { empty: true } : {}),
    },
    {
      title: `Architectural requests in ${d.period.label}`,
      lines: lines(d.arc, (a) =>
        arcEmpty
          ? [{ label: 'Requests', value: 'None submitted or decided' }]
          : [
              { label: 'Submitted', value: String(a.submitted) },
              { label: 'Decided', value: `${a.approved + a.denied} (${a.approved} approved, ${a.denied} denied)` },
            ],
      ),
      failed: 'We couldn’t load architectural requests.',
      ...(arcEmpty ? { empty: true } : {}),
    },
    {
      title: 'Waiting on the board',
      lines: lines(d.approvals, (n) => [
        { label: 'Approvals waiting now', value: n === 0 ? 'None, all clear' : plural(n, 'item'), ...(n > 0 ? { tone: 'danger' as const } : {}) },
      ]),
      failed: 'We couldn’t count the approvals waiting for the board.',
      link: { label: 'Open approvals', href: links.appUrl('/approvals') },
    },
    complianceBlock(d.compliance, links),
    {
      title: 'Next meeting',
      lines: lines(d.meeting, (m) =>
        m
          ? [
              {
                label: m.meeting_type ? `${MEETING_TYPE[m.meeting_type] ?? m.meeting_type} meeting` : 'Meeting',
                value: formatDay(m.meeting_date),
              },
            ]
          : [{ label: 'Meeting', value: 'None scheduled yet' }],
      ),
      failed: 'We couldn’t load the meeting calendar.',
      link: meeting
        ? { label: 'Open the full board packet', href: packetHref }
        : { label: 'Open accounting reports', href: packetHref },
    },
  ]
}

// ─── the summary ────────────────────────────────────────────────────

const SECTION_NAMES: Array<[keyof MonthlyReportData, string]> = [
  ['cash', 'cash'],
  ['reserves', 'reserves'],
  ['income', 'income and expenses'],
  ['collections', 'dues collected'],
  ['delinquency', 'overdue dues'],
  ['budget', 'budget comparison'],
  ['violations', 'violations'],
  ['arc', 'architectural requests'],
  ['approvals', 'approvals waiting'],
  ['meeting', 'next meeting'],
  ['compliance', 'state law compliance'],
]

function summarize(d: MonthlyReportData, links: MonthlyReportLinks): ReportSummary {
  const asOf = formatDay(d.period.end)
  const unavailable = SECTION_NAMES.filter(([k]) => !(d[k] as Section<unknown>).ok).map(([, name]) => name)

  // ── key figures ──
  const figures: Figure[] = []
  if (d.cash.ok) {
    const { operating, reserve } = d.cash.data
    if (operating !== null) {
      figures.push({
        label: 'Operating cash',
        value: usd(operating),
        sub: reserve !== null ? `Reserve cash ${usd(reserve)}` : `As of ${asOf}`,
        ...(operating < 0 ? { tone: 'danger' as const } : {}),
      })
    }
  } else {
    figures.push({ label: 'Cash', value: 'Not available', sub: 'Could not be loaded', unavailable: true })
  }

  if (d.collections.ok) {
    const c = d.collections.data
    if (isZero(c.billed) && isZero(c.collected)) {
      figures.push({ label: 'Collected', value: 'None', sub: 'No charges came due this month' })
    } else {
      const rate = pct(c.collected, c.billed)
      figures.push({
        label: 'Collected',
        value: usd(c.collected),
        sub: rate ? `of ${usd(c.billed)} billed (${rate})` : `No charges came due (billed ${usd(c.billed)})`,
      })
    }
  } else {
    figures.push({ label: 'Collected', value: 'Not available', sub: 'Could not be loaded', unavailable: true })
  }

  if (d.delinquency.ok) {
    const x = d.delinquency.data
    figures.push(
      x.units === 0
        ? { label: 'Overdue', value: 'None', sub: 'Nothing is overdue', tone: 'success' }
        : { label: 'Overdue', value: usd(x.total), sub: `across ${plural(x.units, 'unit')}`, tone: 'danger' },
    )
  } else {
    figures.push({ label: 'Overdue', value: 'Not available', sub: 'Could not be loaded', unavailable: true })
  }

  if (d.income.ok) {
    const s = d.income.data
    if (isZero(s.totalIncome) && isZero(s.totalExpenses) && isZero(s.netIncome)) {
      figures.push({ label: 'Net for the month', value: 'None', sub: 'Nothing was posted' })
    } else {
      figures.push({
        label: 'Net for the month',
        value: usd(s.netIncome),
        sub: `Income ${usd(s.totalIncome)}, expenses ${usd(s.totalExpenses)}`,
        tone: s.netIncome < 0 ? 'danger' : 'success',
      })
    }
  } else {
    figures.push({ label: 'Net for the month', value: 'Not available', sub: 'Could not be loaded', unavailable: true })
  }

  // ── sentences ──
  const sentences: string[] = []
  if (d.income.ok) {
    const s = d.income.data
    if (!(isZero(s.totalIncome) && isZero(s.totalExpenses) && isZero(s.netIncome))) {
      const outcome = isZero(s.netIncome)
        ? 'so income and expenses came out even'
        : s.netIncome > 0
          ? `leaving ${usd(s.netIncome)} more income than expenses`
          : `leaving ${usd(Math.abs(s.netIncome))} more expenses than income`
      sentences.push(`Income was ${usd(s.totalIncome)} and expenses were ${usd(s.totalExpenses)}, ${outcome}.`)
    }
  }
  if (d.collections.ok) {
    const c = d.collections.data
    if (!(isZero(c.billed) && isZero(c.collected))) {
      const rate = pct(c.collected, c.billed)
      sentences.push(
        rate
          ? `Payments received came to ${usd(c.collected)}, compared with ${usd(c.billed)} in charges that came due (${rate}).`
          : `Payments received came to ${usd(c.collected)}. No charges came due in the month.`,
      )
    }
  }
  if (d.delinquency.ok) {
    const x = d.delinquency.data
    sentences.push(
      x.units === 0
        ? 'Nothing is overdue.'
        : `${usd(x.total)} is overdue across ${plural(x.units, 'unit')}${x.over90 > 0 ? `, and ${usd(x.over90)} of it is more than 90 days late` : ''}.`,
    )
  }
  if (d.cash.ok && d.cash.data.operating !== null) {
    const { operating, reserve } = d.cash.data
    sentences.push(
      `Operating cash was ${usd(operating)}${reserve !== null ? ` and reserve cash was ${usd(reserve)}` : ''} at the close of ${asOf}.`,
    )
  }
  if (d.budget.ok && d.budget.data.hasBudget && d.budget.data.top.length > 0) {
    const first = d.budget.data.top[0]!
    const amount = usd(Math.abs(first.variance), { whole: true })
    const how =
      first.accountType === 'income'
        ? first.variance > 0
          ? `${amount} more than budgeted`
          : `${amount} less than budgeted`
        : first.variance > 0
          ? `${amount} under budget`
          : `${amount} over budget`
    sentences.push(`The line furthest from budget is ${first.accountName}, ${how}.`)
  }

  // ── what needs a look ──
  const attention: AttentionItem[] = []
  if (d.approvals.ok && d.approvals.data > 0) {
    attention.push({ text: `${plural(d.approvals.data, 'approval')} waiting for the board.`, href: links.appUrl('/approvals') })
  }
  if (d.violations.ok && d.violations.data.pastCure > 0) {
    attention.push({ text: `${plural(d.violations.data.pastCure, 'violation')} past the cure deadline at month end.` })
  }
  if (d.delinquency.ok && d.delinquency.data.over90 > 0) {
    attention.push({ text: `${usd(d.delinquency.data.over90)} in dues is more than 90 days late.` })
  }
  if (d.compliance.ok && d.compliance.data.overdue > 0) {
    attention.push({
      text: `${plural(d.compliance.data.overdue, 'state-law obligation')} overdue.`,
      href: links.appUrl(COMPLIANCE_PATH),
    })
  }
  if (d.reserves.ok && d.reserves.data.result.kind === 'ready' && d.reserves.data.result.snapshot.behindBudget) {
    attention.push({ text: 'Reserve contributions trail the budget by more than 10%.' })
  }
  if (d.income.ok && d.income.data.netIncome < -0.005) {
    attention.push({ text: `Expenses ran ahead of income by ${usd(Math.abs(d.income.data.netIncome))} this month.` })
  }
  if (d.budget.ok && d.budget.data.hasBudget) {
    for (const v of d.budget.data.top) {
      if (v.variance >= 0) continue
      attention.push({
        text:
          v.accountType === 'income'
            ? `${v.accountName} is ${usd(Math.abs(v.variance), { whole: true })} less than budgeted.`
            : `${v.accountName} is ${usd(Math.abs(v.variance), { whole: true })} over budget.`,
      })
    }
  }

  // ── tone and headline ──
  const quiet =
    d.income.ok &&
    isZero(d.income.data.totalIncome) &&
    isZero(d.income.data.totalExpenses) &&
    d.collections.ok &&
    isZero(d.collections.data.billed) &&
    isZero(d.collections.data.collected) &&
    d.violations.ok &&
    d.violations.data.opened === 0 &&
    d.violations.data.closed === 0 &&
    d.violations.data.pastCure === 0 &&
    d.arc.ok &&
    d.arc.data.submitted === 0 &&
    d.arc.data.approved === 0 &&
    d.arc.data.denied === 0 &&
    d.approvals.ok &&
    d.approvals.data === 0

  let tone: ReportSummary['tone']
  let headline: string
  if (quiet) {
    tone = 'quiet'
    headline = `No activity was recorded in ${d.period.label}.`
    sentences.unshift('There were no charges, payments, income or expenses, and no violations or architectural requests. Balances below are as of the close of the month.')
  } else if (attention.length > 0) {
    tone = 'attention'
    headline = `${d.period.label}: ${plural(attention.length, 'item')} to look at.`
  } else if (unavailable.length > 0) {
    tone = 'partial'
    headline = `${d.period.label}: nothing is flagged in the sections that loaded.`
  } else {
    tone = 'steady'
    headline = `${d.period.label}: nothing in this report is flagged.`
  }

  return { headline, tone, sentences, figures, attention, unavailable }
}

export function buildReportView(d: MonthlyReportData, links: MonthlyReportLinks): ReportView {
  return { summary: summarize(d, links), sections: sectionBlocks(d, links) }
}

/** "Some figures could not be loaded: cash and overdue dues." */
export function unavailableSentence(names: string[]): string | null {
  if (names.length === 0) return null
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `We couldn’t load ${list}, so ${names.length === 1 ? 'that section is' : 'those sections are'} left out below.`
}
