/**
 * BL-153: the annual report's message to owners, and its hand-off to the
 * communications wizard. Client-safe: types only from ./model, so the
 * page's "Draft message to owners" button can build it from the report the
 * server already made owner-safe, plus the board's narrative.
 *
 * The page writes the subject and HTML body to this tab's sessionStorage
 * and opens /communications/new?from=annual-report; the wizard reads it
 * back and pre-fills the message, addressed to owners. Nothing is saved
 * on the server and nothing is sent: the board reviews it in the wizard,
 * and the normal send (with the outbound guard) is the only way it
 * leaves. Same shape as lib/insurance/ho6-notice.ts.
 */

import { formatCents } from '@/lib/insurance/model'
import { formatDay, usd } from '@/lib/money/format'
import { ANNUAL_REPORT_NOT_LEGAL_ADVICE, GA_ANNUAL_REPORT, annualReportLawNote, annualReportQuotes } from './law'
import type { AnnualReport, Section } from './model'

export const ANNUAL_REPORT_FROM = 'annual-report'
export const ANNUAL_REPORT_DRAFT_KEY = 'hoh:annual-report-draft'
export const ANNUAL_REPORT_WIZARD_HREF = `/communications/new?from=${ANNUAL_REPORT_FROM}`
export const NARRATIVE_MAX = 4000

export interface AnnualReportDraft {
  subject: string
  bodyHtml: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const money = (n: number) => usd(n, { whole: true })
const cents = (c: number | null) => (c === null ? 'not recorded' : formatCents(c))

/** The board's narrative, as typed, cut to NARRATIVE_MAX and split into paragraphs. */
export function narrativeParagraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .slice(0, NARRATIVE_MAX)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * The owner message: the board's narrative and the headline figures from
 * each section, built only from `AnnualReport` (already owner-safe). Plain
 * paragraphs and lists, so the composer's editor keeps them. Nothing here
 * sends anything.
 */
export function annualReportMessage(report: AnnualReport, narrative: string): AnnualReportDraft {
  const name = report.associationName.trim() || 'the association'
  const subject = `${name}: annual report to owners`
  const out: string[] = []
  const unavailable = (s: Section<unknown>) => (s.state === 'failed' ? 'Couldn’t be loaded for this message; see the full report.' : s.state === 'none' ? s.why : '')

  out.push('<p>Dear owner,</p>')
  out.push(
    `<p>Here is the board’s report on ${esc(name)}’s affairs and finances for ${esc(report.window.label)}, and the budget for next year, for the ${esc(report.meeting.type.toLowerCase())} on ${esc(formatDay(report.meeting.date, 'medium'))}.</p>`,
  )
  const story = narrativeParagraphs(narrative)
  if (story.length > 0) {
    out.push('<p><strong>From the board</strong></p>')
    for (const p of story) out.push(`<p>${esc(p)}</p>`)
  }

  out.push(`<p><strong>Income and expenses (${esc(report.window.label)})</strong></p>`)
  if (report.income.state === 'ok') {
    const d = report.income.data
    out.push(`<ul><li>Income: ${money(d.totalIncome)}</li><li>Expenses: ${money(d.totalExpenses)}</li><li>${d.net < 0 ? 'Net loss' : 'Net income'}: ${money(d.net)}</li></ul>`)
  } else out.push(`<p>${esc(unavailable(report.income))}</p>`)

  if (report.budget.state === 'ok' && report.budget.data.length > 0) {
    out.push('<p><strong>Against the budget</strong></p><ul>')
    for (const f of report.budget.data) {
      out.push(
        `<li>${esc(f.fund)}: income ${money(f.actualIncome)} of ${money(f.budgetedIncome)} budgeted; expenses ${money(f.actualExpense)} of ${money(f.budgetedExpense)} budgeted.</li>`,
      )
    }
    out.push('</ul>')
  }

  out.push('<p><strong>Balance sheet</strong></p>')
  if (report.balance.state === 'ok') {
    const b = report.balance.data
    out.push(
      `<ul><li>Total assets: ${money(b.totalAssets)}</li><li>Total liabilities: ${money(b.totalLiabilities)}</li><li>Total equity: ${money(b.totalEquity)}</li></ul><p>As of ${esc(formatDay(b.asOf))}.</p>`,
    )
  } else out.push(`<p>${esc(unavailable(report.balance))}</p>`)

  out.push('<p><strong>Reserves</strong></p>')
  if (report.reserves.state === 'ok') {
    const r = report.reserves.data
    if (r.kind === 'no_reserve_fund') out.push('<p>The association has no reserve fund in its books.</p>')
    else {
      const budget = r.budgetedAnnual !== null ? ` against ${money(r.budgetedAnnual)} budgeted for the year` : ''
      out.push(
        `<ul><li>Reserve balance on ${esc(formatDay(r.asOf))}: ${money(r.balance)}</li><li>Put in this year: ${money(r.contributions)}${budget}</li><li>Interest: ${money(r.interest)}</li><li>Spent from reserves: ${money(r.draws)}</li></ul>`,
      )
    }
  } else out.push(`<p>${esc(unavailable(report.reserves))}</p>`)

  out.push('<p><strong>Budget projection for next year</strong></p>')
  if (report.projection.state === 'ok' && report.projection.data.length > 0) {
    out.push('<ul>')
    for (const f of report.projection.data) {
      out.push(
        `<li>${esc(f.fund)}${f.period ? ` (${esc(f.period)})` : ''}, ${f.adopted ? 'adopted' : 'proposed'}: income ${money(f.totalIncome)}, expenses ${money(f.totalExpenses)}.</li>`,
      )
    }
    out.push('</ul>')
  } else if (report.projection.state === 'ok') out.push('<p>Next year’s budget isn’t drafted yet. The board will share it when it is.</p>')
  else out.push(`<p>${esc(unavailable(report.projection))}</p>`)

  out.push('<p><strong>Collections</strong></p>')
  if (report.collections.state === 'ok') {
    const c = report.collections.data
    out.push(
      c.homesBehind === 0
        ? `<p>No home was behind on ${esc(formatDay(c.asOf))}.</p>`
        : `<p>On ${esc(formatDay(c.asOf))}, ${money(c.totalOverdue)} was overdue across ${c.homesBehind} ${c.homesBehind === 1 ? 'home' : 'homes'}, of which ${money(c.aging.d90_plus)} was more than 90 days late.</p>`,
    )
  } else out.push(`<p>${esc(unavailable(report.collections))}</p>`)

  out.push('<p><strong>Insurance</strong></p>')
  if (report.insurance.state === 'ok' && report.insurance.data.length > 0) {
    out.push('<ul>')
    for (const p of report.insurance.data) {
      out.push(
        `<li>${esc(p.kind)}: ${esc(p.insurer)}, limit ${esc(cents(p.limitCents))}, deductible ${esc(cents(p.deductibleCents))}, in force until ${esc(formatDay(p.inForceUntil))}.</li>`,
      )
    }
    out.push('</ul>')
  } else if (report.insurance.state === 'ok') out.push('<p>No policy in force is on record in HomeownerHub.</p>')
  else out.push(`<p>${esc(unavailable(report.insurance))}</p>`)

  if (report.elections.state === 'ok' && report.elections.data.some((e) => e.state !== 'planned')) {
    out.push('<p><strong>Board elections</strong></p><ul>')
    for (const e of report.elections.data) {
      if (e.state === 'results') out.push(`<li>${esc(formatDay(e.meetingDate))}: elected ${esc(e.elected.join(', ') || 'no one')}.</li>`)
      else if (e.state === 'tie') out.push(`<li>${esc(formatDay(e.meetingDate))}: the vote for the last seat was tied; the bylaws decide how it is settled.</li>`)
    }
    out.push('</ul>')
  }

  if (report.meetings.state === 'ok' && report.meetings.data.motions.length > 0) {
    out.push('<p><strong>Motions passed</strong></p><ul>')
    for (const m of report.meetings.data.motions) out.push(`<li>${esc(formatDay(m.date))}: ${esc(m.text)}</li>`)
    out.push('</ul>')
  }

  if (report.compliance.state === 'ok' && report.compliance.data.length > 0) {
    out.push('<p><strong>State-law obligations</strong></p><ul>')
    for (const c of report.compliance.data) out.push(`<li>${esc(c.title)}: ${esc(c.status)}</li>`)
    out.push('</ul>')
  }

  for (const q of annualReportQuotes(report.jurisdiction)) {
    if (q !== GA_ANNUAL_REPORT) continue
    out.push(`<p>Georgia law, ${esc(q.cite)}: “${esc(q.quote)}”</p>`)
  }
  if (report.jurisdiction === 'GA') out.push(`<p>${esc(annualReportLawNote('GA'))} ${esc(ANNUAL_REPORT_NOT_LEGAL_ADVICE)}</p>`)

  out.push('<p>[Attach the printed report, or say where owners can get a copy.]</p>')
  out.push('<p>If you have questions, reply to this message or ask at the meeting.</p>')
  out.push(`<p>The Board of Directors<br />${esc(name)}</p>`)
  return { subject, bodyHtml: out.join('\n') }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function writeAnnualReportDraft(storage: StorageLike | null | undefined, draft: AnnualReportDraft): boolean {
  try {
    if (!storage) return false
    storage.setItem(ANNUAL_REPORT_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readAnnualReportDraft(storage: StorageLike | null | undefined): AnnualReportDraft | null {
  try {
    const raw = storage?.getItem(ANNUAL_REPORT_DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<AnnualReportDraft>
    if (typeof v.subject !== 'string' || typeof v.bodyHtml !== 'string') return null
    if (!v.subject.trim() || !v.bodyHtml.trim()) return null
    return { subject: v.subject, bodyHtml: v.bodyHtml }
  } catch {
    return null
  }
}
