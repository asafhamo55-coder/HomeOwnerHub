/**
 * Round 16 — the account statement a board member emails to one owner.
 * Pure: subject, HTML and plain text.
 *
 * Carries the same figures the statement page prints (StatementDocument):
 * balance forward, charges, payments and credits, closing balance, and the
 * activity lines for the period. It names the association, the home and the
 * period; it does not carry the owner's name or address, nobody else's
 * data, memo codes or internal ids. The email links to the owner's own
 * portal statement.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { formatDay, usd } from '@/lib/money/format'
import { balanceLabel } from './receipt-render'

export interface StatementEmailLine {
  date: string
  description: string
  charge: number | null
  payment: number | null
  balance: number
}

/** The most activity lines one email carries; the portal has the rest. */
export const STATEMENT_EMAIL_MAX_LINES = 60

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
const ACCENT = '#1F6F5C'

export interface RenderedStatementEmail {
  subject: string
  html: string
  text: string
}

function figure(label: string, value: string, strong = false): string {
  return `<tr><td style="padding:6px 16px 6px 0;font-size:13px;color:#5B646C;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:${strong ? 16 : 14}px;color:#1A1D21;font-weight:600;">${escapeHtml(value)}</td></tr>`
}

function cell(v: string, align: 'left' | 'right' = 'left'): string {
  return `<td style="padding:6px 8px;border-bottom:1px solid #E3E6E9;font-size:13px;color:#1A1D21;text-align:${align};vertical-align:top;">${escapeHtml(v)}</td>`
}

function head(v: string, align: 'left' | 'right' = 'left'): string {
  return `<th style="padding:6px 8px;border-bottom:2px solid #C9CED3;font-size:12px;color:#5B646C;text-align:${align};">${escapeHtml(v)}</th>`
}

export function renderStatementEmail(i: {
  associationName: string
  /** Display text, e.g. "Oct 1, 2025 – Sep 30, 2026". */
  period: string
  /** yyyy-mm-dd, the association's today. */
  statementDate: string
  home: string
  openingBalance: number
  charges: number
  paymentsAndCredits: number
  closingBalance: number
  lines: StatementEmailLine[]
  portalUrl: string
}): RenderedStatementEmail {
  const subject = `Your account statement from ${i.associationName}`
  const shown = i.lines.slice(-STATEMENT_EMAIL_MAX_LINES)
  const omitted = i.lines.length - shown.length
  const closingLabel = i.closingBalance < 0 ? 'Credit balance' : 'Balance due'
  const figures: Array<[string, string, boolean]> = [
    ['Balance forward', balanceLabel(i.openingBalance), false],
    ['Charges', usd(i.charges), false],
    ['Payments and credits', `-${usd(i.paymentsAndCredits)}`, false],
    [closingLabel, balanceLabel(i.closingBalance), true],
  ]
  const money = (n: number | null, sign = '') => (n == null ? '' : `${sign}${usd(n)}`)

  const lineRows = shown
    .map(
      (l) =>
        `<tr>${cell(formatDay(l.date))}${cell(l.description)}${cell(money(l.charge), 'right')}${cell(money(l.payment, '-'), 'right')}${cell(balanceLabel(l.balance), 'right')}</tr>`,
    )
    .join('')
  const omittedNote =
    omitted > 0 ? `${omitted} earlier ${omitted === 1 ? 'entry is' : 'entries are'} not shown here. Your portal has the full list.` : ''

  const html = renderEmailDocument({
    fluid: true,
    previewText: subject,
    band: { text: i.associationName, color: ACCENT },
    bodyHtml: `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#1A1D21;">
<p style="margin:0 0 12px;">Hello,</p>
<p style="margin:0 0 12px;">${escapeHtml(i.associationName)} sent you your account statement for ${escapeHtml(i.home)}, covering ${escapeHtml(i.period)}. It was prepared on ${escapeHtml(formatDay(i.statementDate))}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;font-family:${FONT};">${figures.map(([l, v, s]) => figure(l, v, s)).join('')}</table>
${
  shown.length > 0
    ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0;border-collapse:collapse;font-family:${FONT};"><thead><tr>${head('Date')}${head('Description')}${head('Charge', 'right')}${head('Payment', 'right')}${head('Balance', 'right')}</tr></thead><tbody>${lineRows}</tbody></table>`
    : `<p style="margin:8px 0;font-size:14px;color:#5B646C;">There was no activity in this period.</p>`
}
${omittedNote ? `<p style="margin:8px 0 0;font-size:13px;color:#5B646C;">${escapeHtml(omittedNote)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;"><tr><td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:6px;"><a href="${escapeHtml(i.portalUrl)}" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View your statement</a></td></tr></table>
</div>`,
    footerHtml: `You’re receiving this because a board member of ${escapeHtml(i.associationName)} sent you your statement. Payments appear once they are approved, so anything received in the last few days may not be listed yet. Replies to this email may not be read. Use the resident portal to contact the board.`,
  })

  const textLines = shown.map((l) => {
    const amount = l.charge != null ? `charge ${usd(l.charge)}` : l.payment != null ? `payment -${usd(l.payment)}` : ''
    return `${formatDay(l.date)}  ${l.description}  ${amount}  balance ${balanceLabel(l.balance)}`
  })
  const text = `Hello,

${i.associationName} sent you your account statement for ${i.home}, covering ${i.period}. It was prepared on ${formatDay(i.statementDate)}.

${figures.map(([l, v]) => `${l}: ${v}`).join('\n')}

${shown.length > 0 ? textLines.join('\n') : 'There was no activity in this period.'}
${omittedNote ? `\n${omittedNote}\n` : ''}
View your statement in the resident portal:
${i.portalUrl}

${i.associationName}`

  return { subject, html, text }
}
