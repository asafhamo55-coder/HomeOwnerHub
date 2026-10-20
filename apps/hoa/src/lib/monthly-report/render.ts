/**
 * The month-end board report email (BL-073). Pure: data in, subject +
 * HTML + text out. The in-app Preview renders exactly this HTML.
 *
 * Built on the shell every HomeownerHub email uses (email/shell.ts), one
 * column of short blocks so it reads on a phone. Plain language; aggregates
 * only — no resident names, emails or phone numbers, and no per-unit list.
 *
 * Truthful sections: one that failed to load says so ("We couldn't load
 * …"), and its numbers are never shown as zeros.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { formatDay, plural, usd } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import type { MonthlyReportData, ReserveReport, Section, Variance } from './model'

/** Band accent — inside the dark-mode-safe window (email/palette.ts; render.test.ts asserts it). */
export const REPORT_ACCENT = '#2F5D8A'

/** Where "Set up a reserve fund" goes: the chart of accounts' Funds card (BL-120). */
export const RESERVE_SETUP_PATH = '/accounting/coa#funds'

const TEXT = '#1A1D21'
const MUTED = '#5B6570'
const LINE = '#E8EBED'
const DANGER = '#B42318'
const SUCCESS = '#067647'

export interface MonthlyReportLinks {
  /** Absolute URL for an app path. */
  appUrl: (path: string) => string
}

export interface RenderedReport {
  subject: string
  html: string
  text: string
}

// ─── wording (shared by HTML and text) ──────────────────────────────

interface Line {
  label: string
  value: string
  tone?: 'danger' | 'success'
}

interface Block {
  title: string
  /** null when the section failed: `failed` is said instead. */
  lines: Line[] | null
  failed: string
  note?: string
  link?: { label: string; href: string }
}

function pct(part: number, whole: number): string | null {
  if (!(whole > 0)) return null
  return `${Math.round((part / whole) * 100)}%`
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

function lines<T>(res: Section<T>, fn: (t: T) => Line[]): Line[] | null {
  return res.ok ? fn(res.data) : null
}

function blocks(d: MonthlyReportData, links: MonthlyReportLinks): Block[] {
  const asOf = formatDay(d.period.end)
  const meeting = d.meeting.ok ? d.meeting.data : null
  const packetHref = meeting ? links.appUrl(`/meetings/${meeting.id}/packet`) : links.appUrl('/accounting/reports')

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
        const rate = pct(c.collected, c.billed)
        return [
          { label: 'Billed', value: usd(c.billed) },
          { label: 'Collected', value: rate ? `${usd(c.collected)} (${rate} of billed)` : usd(c.collected) },
        ]
      }),
      failed: 'We couldn’t load this month’s charges and payments.',
      note: 'Collected counts every payment received in the month, including ones for earlier charges.',
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
      lines: lines(d.income, (s) => [
        { label: 'Income', value: usd(s.totalIncome) },
        { label: 'Expenses', value: usd(s.totalExpenses) },
        { label: 'Net', value: usd(s.netIncome), tone: s.netIncome < 0 ? 'danger' : 'success' },
      ]),
      failed: 'We couldn’t load the income statement for the month.',
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
      lines: lines(d.violations, (v) => [
        { label: 'Opened', value: String(v.opened) },
        { label: 'Closed', value: String(v.closed) },
        {
          label: 'Past the cure deadline',
          value: `${v.pastCure} at month end`,
          ...(v.pastCure > 0 ? { tone: 'danger' as const } : {}),
        },
      ]),
      failed: 'We couldn’t load violations.',
    },
    {
      title: `Architectural requests in ${d.period.label}`,
      lines: lines(d.arc, (a) => [
        { label: 'Submitted', value: String(a.submitted) },
        { label: 'Decided', value: `${a.approved + a.denied} (${a.approved} approved, ${a.denied} denied)` },
      ]),
      failed: 'We couldn’t load architectural requests.',
    },
    {
      title: 'Waiting on the board',
      lines: lines(d.approvals, (n) => [
        { label: 'Approvals waiting now', value: n === 0 ? 'None — all clear' : plural(n, 'item'), ...(n > 0 ? { tone: 'danger' as const } : {}) },
      ]),
      failed: 'We couldn’t count the approvals waiting for the board.',
      link: { label: 'Open approvals', href: links.appUrl('/approvals') },
    },
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

// ─── HTML ───────────────────────────────────────────────────────────

const toneColor = (t?: Line['tone']) => (t === 'danger' ? DANGER : t === 'success' ? SUCCESS : TEXT)

function blockHtml(b: Block): string {
  const head = `<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${TEXT};">${escapeHtml(b.title)}</p>`
  const body =
    b.lines === null
      ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${DANGER};">${escapeHtml(b.failed)}</p>`
      : b.lines
          .map(
            (l) =>
              `<tr><td style="padding:4px 0;font-size:13px;line-height:1.4;color:${MUTED};vertical-align:top;">${escapeHtml(l.label)}</td></tr>` +
              `<tr><td style="padding:0 0 6px;font-size:15px;line-height:1.4;font-weight:600;color:${toneColor(l.tone)};">${escapeHtml(l.value)}</td></tr>`,
          )
          .join('')
  const table = b.lines === null ? body : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>`
  const note = b.note && b.lines !== null ? `<p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:${MUTED};">${escapeHtml(b.note)}</p>` : ''
  const link = b.link
    ? `<p style="margin:8px 0 0;font-size:13px;"><a href="${escapeHtml(b.link.href)}" style="color:${REPORT_ACCENT};font-weight:600;">${escapeHtml(b.link.label)} &rarr;</a></p>`
    : ''
  return `<div style="border-top:1px solid ${LINE};padding:14px 0;">${head}${table}${note}${link}</div>`
}

// ─── text ───────────────────────────────────────────────────────────

function blockText(b: Block): string {
  const out = [b.title.toUpperCase()]
  if (b.lines === null) out.push(b.failed)
  else for (const l of b.lines) out.push(`${l.label}: ${l.value}`)
  if (b.note && b.lines !== null) out.push(b.note)
  if (b.link) out.push(`${b.link.label}: ${b.link.href}`)
  return out.join('\n')
}

// ─── entry ──────────────────────────────────────────────────────────

export function renderMonthlyReportEmail(d: MonthlyReportData, links: MonthlyReportLinks): RenderedReport {
  const subject = `${d.associationName}: ${d.period.label} board report`
  const bs = blocks(d, links)
  const settingsUrl = links.appUrl('/settings/notifications')
  const intro = `Here’s how ${d.associationName} finished ${d.period.label}. Money figures are as of the close of ${formatDay(d.period.end)} unless they say otherwise.`

  const bodyHtml = `<div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:700;">${escapeHtml(d.associationName)}</div>
<p style="margin:10px 0 4px;font-size:18px;font-weight:700;color:${TEXT};">${escapeHtml(d.period.label)} board report</p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(intro)}</p>
${bs.map(blockHtml).join('\n')}`

  const html = renderEmailDocument({
    // Reads on a phone without zooming (the ghost-table hybrid, shell.ts).
    fluid: true,
    band: { text: 'Month-end board report', color: REPORT_ACCENT },
    previewText: `${d.period.label}: cash, reserves, collections, overdue dues and what’s waiting on the board.`,
    bodyHtml,
    footerHtml: `Sent by HomeownerHub to board members of ${escapeHtml(d.associationName)}. Board only — please don’t forward to residents. <a href="${escapeHtml(settingsUrl)}" style="color:${MUTED};">Turn off the monthly board report</a>.`,
  })

  const text = [
    `${d.associationName} — ${d.period.label} board report`,
    '',
    intro,
    '',
    ...bs.flatMap((b) => [blockText(b), '']),
    `Sent by HomeownerHub to board members of ${d.associationName}. Board only — please don’t forward to residents.`,
    `Turn off the monthly board report: ${settingsUrl}`,
  ].join('\n')

  return { subject, html, text }
}
