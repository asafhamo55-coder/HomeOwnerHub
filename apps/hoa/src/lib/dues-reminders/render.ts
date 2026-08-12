/**
 * Email rendering for dues reminders. Deliberately pure — no database,
 * no env reads, no clock — so the whole layout is unit-testable against
 * fixture packets.
 *
 * Email-client constraints drive every choice here: table layout, inline
 * styles only, 600px max width, light-only palette with an explicit
 * background on every cell. Gmail and Outlook force-invert dark mode, and
 * a cell without its own background colour is where that goes wrong. Past
 * due is always marked with TEXT as well as colour for the same reason.
 */

import { chargeTypeLabel } from '@/lib/assessment-labels'
import type { ReminderPacket } from './types'

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The subject line is plain text, so it takes the unescaped variant for
 *  the same reason the plain-text body does — an association called
 *  "Oak & Vine" must not arrive as "Oak &amp; Vine" in the inbox list. */
export const SUBJECT_TEMPLATE = '{{association_name_text}} dues — {{amount_summary}}'

export function formatUsd(n: number): string {
  return USD.format(n)
}

/** '2026-07-01' → 'Jul 1'. Parsed by hand rather than via Date so the
 *  result never shifts by a day in a negative-offset timezone. */
export function formatDueDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Make free text inert against the send pipeline's merge renderer.
 *
 * The manager's note is baked into the shell, and the whole shell is then
 * run through renderTemplate — which substitutes any `{{word}}` it finds
 * and replaces an unknown one with an empty string. A note reading "your
 * {{balance}} is due" would silently lose those two words on the way to
 * every resident. Collapsing every run of two-or-more braces to a single
 * brace leaves the note readable and can never leave a `{{` behind (a
 * naive `{{` → `{` pass would turn `{{{x}}}` back into `{{x}}`).
 */
export function neutralizeMergeSyntax(s: string): string {
  return s.replace(/\{{2,}/g, '{').replace(/\}{2,}/g, '}')
}

export function amountSummary(packet: ReminderPacket): string {
  const total = `${formatUsd(packet.totalDue)} due`
  return packet.pastDueTotal > 0
    ? `${total}, ${formatUsd(packet.pastDueTotal)} past due`
    : total
}

// ─── palette ─────────────────────────────────────────────────────────
const TEXT = '#1a1d21'
const MUTED = '#6b7280'
const LINE = '#eef0f2'
const PANEL = '#f9fafb'
const DANGER = '#b42318'
const DANGER_BG = '#fef3f2'
const DANGER_LINE = '#fbd5d1'

function chargeRow(
  charge: ReminderPacket['properties'][number]['charges'][number],
  isLast: boolean,
): string {
  const border = isLast ? '' : `border-bottom:1px solid ${LINE};`
  const late = charge.pastDue
    ? `<span style="display:inline-block;margin-top:3px;background:${DANGER_BG};color:${DANGER};font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;">${charge.daysLate} ${charge.daysLate === 1 ? 'day' : 'days'} late</span>`
    : ''

  return `<tr><td style="padding:11px 14px;${border}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:13px;font-weight:600;color:${TEXT};">${escapeHtml(chargeTypeLabel(charge.assessmentType))}<div style="font-size:11px;font-weight:400;color:${MUTED};margin-top:2px;">Due ${formatDueDate(charge.dueDate)}</div></td>
<td style="text-align:right;vertical-align:top;"><div style="font-size:14px;font-weight:700;color:${TEXT};">${formatUsd(charge.balance)}</div>${late}</td>
</tr></table></td></tr>`
}

export function renderDuesTableHtml(packet: ReminderPacket): string {
  const multi = packet.properties.length > 1

  const totalCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DANGER_BG};border:1px solid ${DANGER_LINE};border-radius:10px;margin-bottom:20px;">
<tr><td style="padding:16px 18px;">
<div style="font-size:12px;color:${MUTED};font-weight:600;">Total due</div>
<div style="font-size:32px;font-weight:700;letter-spacing:-0.6px;margin-top:2px;color:${TEXT};">${formatUsd(packet.totalDue)}</div>
${
  packet.pastDueTotal > 0
    ? `<div style="margin-top:6px;font-size:12px;font-weight:700;color:${DANGER};">${formatUsd(packet.pastDueTotal)} past due &middot; oldest ${packet.oldestDaysLate} ${packet.oldestDaysLate === 1 ? 'day' : 'days'}</div>`
    : ''
}
</td></tr></table>`

  const blocks = packet.properties
    .map((property) => {
      const heading = multi
        ? `<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:${TEXT};">${escapeHtml(property.label)}</div>`
        : ''
      const rows = property.charges
        .map((c, i) => chargeRow(c, i === property.charges.length - 1 && !multi))
        .join('')
      const subtotal = multi
        ? `<tr><td style="padding:10px 14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};">Subtotal <span style="float:right;font-weight:700;color:${TEXT};">${formatUsd(property.subtotal)}</span></td></tr>`
        : ''
      return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:10px;margin-bottom:14px;">${rows}${subtotal}</table>`
    })
    .join('')

  return totalCard + blocks
}

export function renderDuesTableText(packet: ReminderPacket): string {
  const lines: string[] = []
  lines.push(`TOTAL DUE: ${formatUsd(packet.totalDue)}`)
  if (packet.pastDueTotal > 0) {
    lines.push(`Past due: ${formatUsd(packet.pastDueTotal)} (oldest ${packet.oldestDaysLate} days)`)
  }
  lines.push('')

  const multi = packet.properties.length > 1
  for (const property of packet.properties) {
    if (multi) lines.push(`-- ${property.label} --`)
    for (const c of property.charges) {
      const late = c.pastDue ? `  (${c.daysLate} ${c.daysLate === 1 ? 'day' : 'days'} late)` : ''
      lines.push(`  ${chargeTypeLabel(c.assessmentType)} — due ${formatDueDate(c.dueDate)} — ${formatUsd(c.balance)}${late}`)
    }
    if (multi) {
      lines.push(`  Subtotal: ${formatUsd(property.subtotal)}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/** Exported so its empty case is testable directly — the alternative is a
 *  marker attribute in production email markup that exists only for a
 *  test assertion. */
export function renderNoteHtml(note: string | undefined): string {
  const trimmed = note?.trim()
  if (!trimmed) return ''
  const body = escapeHtml(trimmed).replace(/\r?\n/g, '<br>')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border-radius:8px;margin-bottom:18px;">
<tr><td style="padding:12px 14px;font-size:13px;line-height:1.5;color:${TEXT};">${body}</td></tr></table>`
}

export function renderShellHtml(opts: { note?: string; portalUrl: string }): string {
  return `<div style="background:#f4f5f7;padding:18px;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:${TEXT};">
<div style="padding:18px 22px;"><div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:700;">{{association_name}}</div></div>
<div style="padding:0 22px 22px;">
<p style="margin:0 0 4px;font-size:15px;font-weight:700;">Hi {{owner_name}},</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#4b5563;">Here&rsquo;s everything currently outstanding on your account.</p>
${renderNoteHtml(opts.note)}
{{dues_table}}
<div style="text-align:center;"><a href="${escapeHtml(opts.portalUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">View my dues</a></div>
<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:${MUTED};text-align:center;">To pay or request a detailed statement, reply to this email or contact your community manager.</p>
</div>
<div style="padding:14px 22px;background:#fafafa;border-top:1px solid ${LINE};font-size:10px;line-height:1.6;color:#9ca3af;">Sent by {{association_name}} because you are an owner of record.</div>
</div></div>`
}

export function renderShellText(opts: { note?: string; portalUrl: string }): string {
  const note = opts.note?.trim()
  return [
    // The raw variant, not {{association_name}}: renderTemplate does not
    // escape, and the HTML-escaped value would read as literal "&amp;" in
    // a plain-text inbox. Same split as owner_name / owner_name_text.
    '{{association_name_text}}',
    '',
    'Hi {{owner_name_text}},',
    '',
    "Here's everything currently outstanding on your account.",
    '',
    ...(note ? [note, ''] : []),
    '{{dues_text}}',
    '',
    `View your dues: ${opts.portalUrl}`,
    '',
    'To pay or request a detailed statement, reply to this email or contact your community manager.',
    '',
    'Sent by {{association_name_text}} because you are an owner of record.',
  ].join('\n')
}
