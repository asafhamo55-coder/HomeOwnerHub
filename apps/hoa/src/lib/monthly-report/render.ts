/**
 * The month-end board report email (BL-073). Pure: data in, subject +
 * HTML + text out.
 *
 * Built on the shell every HomeownerHub email uses (email/shell.ts). The
 * reading order comes from view.ts, which the in-app page uses too, so the
 * email, the page and the plain-text part say the same things in the same
 * order: a plain-words summary and the headline figures first, then the
 * detail, one block per topic.
 *
 * Email rules followed: tables for layout, every style inline, a bgcolor on
 * every coloured cell (dark-mode engines recolour the backgrounds they can
 * see), no SVG (Gmail strips it) and no remote images. The logo is a blue
 * cell with an "H", as in the release-note email. Aggregates only: no
 * resident names, emails or phone numbers.
 *
 * Truthful sections: one that failed to load says so ("We couldn't load
 * …"), and its numbers are never shown as zeros.
 */

import { BRAND } from '@/lib/email/brand'
import { emailButton } from '@/lib/email/components'
import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { formatDay } from '@/lib/money/format'
import type { MonthlyReportData } from './model'
import {
  BRAND_PRIMARY,
  REPORT_PAGE_PATH,
  buildReportView,
  unavailableSentence,
  type Block,
  type Figure,
  type Line,
  type MonthlyReportLinks,
  type ReportSummary,
  type Tone,
} from './view'

export { COMPLIANCE_PATH, RESERVE_SETUP_PATH, type MonthlyReportLinks } from './view'

/** Band accent — inside the dark-mode-safe window (email/palette.ts; render.test.ts asserts it). Kept for the shell's optional band; the report's own brand colour is BRAND_PRIMARY. */
export const REPORT_ACCENT: string = BRAND.primary

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const TEXT = BRAND.ink
const TEXT_2 = BRAND.body
const MUTED = BRAND.muted
const LINE = BRAND.line
const TINT = BRAND.panel
const PRIMARY = BRAND_PRIMARY
const PRIMARY_TINT = BRAND.tint
const DANGER = '#C4261B'
const SUCCESS = '#047857'
const WARN_BG = '#FFF8E6'
const WARN_EDGE = '#F79009'
const WARN_FG = '#93370D'
/** Tabular figures where the client supports them (Apple Mail, iOS); harmless elsewhere. */
const NUM = 'font-variant-numeric:tabular-nums;'

/** A value longer than this is stacked under its label instead of sitting beside it. */
const STACK_OVER = 20

export interface RenderedReport {
  subject: string
  html: string
  text: string
}

const toneColor = (t?: Tone) => (t === 'danger' ? DANGER : t === 'success' ? SUCCESS : TEXT)

// ─── HTML pieces ────────────────────────────────────────────────────

const EMAIL_CSS = `
@media only screen and (max-width:480px){
  .eh-page{padding:8px !important}
  .eh-body{padding:18px 16px !important}
  .rp-kpi{display:block !important;width:100% !important;padding:0 0 10px 0 !important}
  .rp-kpi-gap{display:none !important}
  .rp-h1{font-size:24px !important;line-height:30px !important}
}
`

/** The logo lives in the shared shell header; this is just the report's own label. */
function headerHtml(): string {
  return `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${PRIMARY};">Board report</p>`
}

function summaryHtml(s: ReportSummary): string {
  const sentences = s.sentences
    .map((t) => `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT_2};">${escapeHtml(t)}</p>`)
    .join('')
  const missing = unavailableSentence(s.unavailable)
  const missingHtml = missing
    ? `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:22px;color:${DANGER};">${escapeHtml(missing)}</p>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${PRIMARY_TINT}" style="background-color:${PRIMARY_TINT};border-radius:10px;padding:18px 18px 12px 18px;color:${TEXT};">
<p style="margin:0 0 4px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${PRIMARY};">In brief</p>
<p style="margin:0 0 10px 0;font-family:${FONT};font-size:19px;line-height:26px;font-weight:700;color:${TEXT};">${escapeHtml(s.headline)}</p>
${sentences}${missingHtml}
</td></tr></table>`
}

function attentionHtml(s: ReportSummary): string {
  if (s.attention.length === 0) return ''
  const items = s.attention
    .map((a) => {
      const text = escapeHtml(a.text)
      const linked = a.href
        ? ` <a href="${escapeHtml(a.href)}" style="color:${WARN_FG};font-weight:700;text-decoration:underline;">Open</a>`
        : ''
      return `<tr><td valign="top" width="18" style="width:18px;font-family:${FONT};font-size:16px;line-height:24px;color:${WARN_FG};">&#8226;</td><td style="font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};padding:0 0 6px 0;">${text}${linked}</td></tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td></tr><tr>
<td bgcolor="${WARN_BG}" style="background-color:${WARN_BG};border-left:4px solid ${WARN_EDGE};border-radius:6px;padding:14px 16px 8px 16px;color:${TEXT};">
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${WARN_FG};">Worth a look</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
</td></tr></table>`
}

function figureCell(f: Figure, last: boolean): string {
  const color = f.unavailable ? MUTED : toneColor(f.tone)
  return `<td class="rp-kpi" width="50%" valign="top" style="width:50%;padding:0 ${last ? '0' : '6px'} 0 ${last ? '6px' : '0'};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${TINT}" style="background-color:${TINT};border:1px solid ${LINE};border-radius:10px;padding:14px 14px 12px 14px;">
<p style="margin:0 0 4px 0;font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;color:${MUTED};">${escapeHtml(f.label)}</p>
<p style="margin:0 0 2px 0;font-family:${FONT};font-size:${f.unavailable ? '18' : '24'}px;line-height:30px;font-weight:700;color:${color};${NUM}">${escapeHtml(f.value)}</p>
${f.sub ? `<p style="margin:0;font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(f.sub)}</p>` : ''}
</td></tr></table></td>`
}

function figuresHtml(figures: Figure[]): string {
  if (figures.length === 0) return ''
  const rows: string[] = []
  for (let i = 0; i < figures.length; i += 2) {
    const pair = figures.slice(i, i + 2)
    const cells = pair.map((f, j) => figureCell(f, j === 1)).join('')
    const pad = pair.length === 1 ? '<td class="rp-kpi" width="50%" style="width:50%;">&nbsp;</td>' : ''
    rows.push(`<tr>${cells}${pad}</tr><tr><td colspan="2" height="12" style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>`)
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="16" style="height:16px;line-height:16px;font-size:16px;">&nbsp;</td></tr>${rows.join('')}</table>`
}

function buttonHtml(href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="left" style="padding:0 0 6px 0;">
${emailButton(href, 'Open the full report')}
<p style="margin:8px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">Sign in to see it in the app. It prints cleanly too.</p>
</td></tr></table>`
}

function lineHtml(l: Line, first: boolean): string {
  const border = first ? '' : `border-top:1px solid ${LINE};`
  if (l.value.length > STACK_OVER) {
    return `<tr><td style="${border}padding:10px 0;font-family:${FONT};">
<p style="margin:0 0 2px 0;font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(l.label)}</p>
<p style="margin:0;font-size:16px;line-height:23px;font-weight:600;color:${toneColor(l.tone)};${NUM}">${escapeHtml(l.value)}</p>
</td></tr>`
  }
  return `<tr><td style="${border}padding:10px 0;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="font-size:15px;line-height:22px;color:${MUTED};padding-right:10px;">${escapeHtml(l.label)}</td>
<td valign="top" align="right" style="font-size:16px;line-height:22px;font-weight:600;color:${toneColor(l.tone)};text-align:right;white-space:nowrap;${NUM}">${escapeHtml(l.value)}</td>
</tr></table></td></tr>`
}

function blockHtml(b: Block): string {
  const head = `<p style="margin:0 0 4px 0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:${TEXT};">${escapeHtml(b.title)}</p>`
  let body: string
  if (b.lines === null) {
    body = `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:22px;color:${DANGER};">${escapeHtml(b.failed)}</p>`
  } else if (b.empty) {
    // Loaded and genuinely empty: said in words, never a row of zeros.
    body = `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:22px;color:${MUTED};">${escapeHtml(b.lines[0]?.value ?? '')}.</p>`
  } else {
    body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${b.lines.map((l, i) => lineHtml(l, i === 0)).join('')}</table>`
  }
  const note =
    b.note && b.lines !== null
      ? `<p style="margin:4px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(b.note)}</p>`
      : ''
  const link = b.link
    ? `<p style="margin:10px 0 0 0;font-family:${FONT};font-size:15px;line-height:22px;"><a href="${escapeHtml(b.link.href)}" style="color:${PRIMARY};font-weight:700;text-decoration:underline;">${escapeHtml(b.link.label)} &rarr;</a></p>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${LINE};padding:18px 0 18px 0;">${head}${body}${note}${link}</td></tr></table>`
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

function summaryText(s: ReportSummary): string {
  const out = ['IN BRIEF', s.headline, ...s.sentences]
  const missing = unavailableSentence(s.unavailable)
  if (missing) out.push(missing)
  if (s.attention.length > 0) {
    out.push('', 'WORTH A LOOK', ...s.attention.map((a) => `- ${a.text}`))
  }
  out.push('', 'KEY FIGURES', ...s.figures.map((f) => `${f.label}: ${f.value}${f.sub ? ` (${f.sub})` : ''}`))
  return out.join('\n')
}

// ─── entry ──────────────────────────────────────────────────────────

export function renderMonthlyReportEmail(d: MonthlyReportData, links: MonthlyReportLinks): RenderedReport {
  const subject = `${d.associationName}: ${d.period.label} board report`
  const view = buildReportView(d, links)
  const settingsUrl = links.appUrl('/settings/notifications')
  const reportUrl = links.appUrl(REPORT_PAGE_PATH)
  const intro = `Money figures are as of the close of ${formatDay(d.period.end)} unless they say otherwise.`

  const bodyHtml = `${headerHtml()}
<p style="margin:22px 0 4px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(d.associationName)}</p>
<h1 class="rp-h1" style="margin:0 0 6px 0;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.4px;color:${TEXT};">${escapeHtml(d.period.label)} board report</h1>
<p style="margin:0 0 18px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${MUTED};">${escapeHtml(intro)}</p>
${summaryHtml(view.summary)}
${attentionHtml(view.summary)}
${figuresHtml(view.summary.figures)}
${buttonHtml(reportUrl)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td></tr></table>
<p style="margin:0 0 2px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${PRIMARY};">The detail</p>
${view.sections.map(blockHtml).join('\n')}`

  const html = renderEmailDocument({
    // Reads on a phone without zooming (the ghost-table hybrid, shell.ts).
    fluid: true,
    extraCss: EMAIL_CSS,
    previewText: `${d.period.label}: ${view.summary.headline}`,
    bodyHtml,
    footerHtml: `<div style="font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">Sent by HomeownerHub to board members of ${escapeHtml(d.associationName)}. Board only, please don’t forward to residents.<br /><a href="${escapeHtml(settingsUrl)}" style="color:${MUTED};text-decoration:underline;">Turn off the monthly board report</a></div>`,
  })

  const text = [
    `${d.associationName}: ${d.period.label} board report`,
    '',
    intro,
    '',
    summaryText(view.summary),
    '',
    `Open the full report: ${reportUrl}`,
    '',
    ...view.sections.flatMap((b) => [blockText(b), '']),
    `Sent by HomeownerHub to board members of ${d.associationName}. Board only, please don’t forward to residents.`,
    `Turn off the monthly board report: ${settingsUrl}`,
  ].join('\n')

  return { subject, html, text }
}
