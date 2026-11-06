/**
 * Poll emails (opened, results). Pure: subject, HTML and plain text.
 *
 * The bar chart is an HTML table, not an image or an SVG: a coloured cell
 * whose width is the percent, beside a light track cell. Tables render in
 * Gmail, Apple Mail and Outlook with images off. Every cell carries both a
 * bgcolor attribute (Outlook) and an inline background-color (everything
 * else), and the fill cell's text colour equals its fill, so a client that
 * inverts backgrounds in dark mode never shows stray text on a bar.
 *
 * Each bar has its figure in words beside it ("3 homes (60%)"), so the
 * numbers survive a screen reader or a client that strips colours. The
 * email counts homes, never names.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { POLL_NOT_A_VOTE, type TallyRow } from '../rules'

export interface RenderedPollEmail {
  subject: string
  html: string
  text: string
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
export const POLL_ACCENT = '#1F6F5C'
const TEXT = '#1A1D21'
const MUTED = '#4A545C'
const TRACK = '#D9DEE2'
const BAR_HEIGHT = 20

/** One line, no control characters: safe for a subject header. */
export function cleanSubject(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function homesPhrase(n: number): string {
  return `${n} ${n === 1 ? 'home' : 'homes'}`
}

/** "3 homes (60%)" */
export function figureLabel(votes: number, percent: number): string {
  return `${homesPhrase(votes)} (${clampPercent(percent)}%)`
}

const barCellStyle = (color: string) =>
  `background-color:${color};color:${color};font-size:1px;line-height:${BAR_HEIGHT}px;height:${BAR_HEIGHT}px;mso-line-height-rule:exactly;`

/** The bar itself: fill then track. 0% is track only; 100% is fill only. */
export function renderBarHtml(percent: number, accent: string = POLL_ACCENT): string {
  const p = clampPercent(percent)
  const fill = `<td bgcolor="${accent}" width="${p}%" height="${BAR_HEIGHT}" style="width:${p}%;${barCellStyle(accent)}">&nbsp;</td>`
  const track = `<td bgcolor="${TRACK}" height="${BAR_HEIGHT}" style="${barCellStyle(TRACK)}">&nbsp;</td>`
  const cells = p <= 0 ? track : p >= 100 ? fill : fill + track
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>${cells}</tr></table>`
}

/** All answers, each with a bar and its figure in text. */
export function renderPollBarsHtml(rows: readonly TallyRow[], accent: string = POLL_ACCENT): string {
  return rows
    .map((r) => {
      const weight = r.leading ? '700' : '600'
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px;">
<tr><td style="font-family:${FONT};font-size:17px;line-height:1.4;font-weight:${weight};color:${TEXT};padding:0 0 6px;">${escapeHtml(r.label)}</td></tr>
<tr><td style="padding:0 0 6px;">${renderBarHtml(r.percent, accent)}</td></tr>
<tr><td style="font-family:${FONT};font-size:16px;line-height:1.4;color:${MUTED};">${escapeHtml(figureLabel(r.votes, r.percent))}</td></tr>
</table>`
    })
    .join('\n')
}

export function renderButtonHtml(href: string, label: string, accent: string = POLL_ACCENT): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td align="center" bgcolor="${accent}" style="background-color:${accent};border:2px solid ${accent};border-radius:8px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:18px 34px;font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const BODY_OPEN = `<div style="font-family:${FONT};font-size:17px;line-height:1.6;color:${TEXT};">`

function footer(associationName: string): string {
  return `You are receiving this because you are on the resident list for ${escapeHtml(associationName)}. Replies to this email may not be read. To stop these emails, turn off email in your account in the resident portal.`
}

export interface PollOpenedInput {
  associationName: string
  title: string
  description: string | null
  options: string[]
  allowMultiple: boolean
  /** The last day to answer, already formatted ("November 12, 2026"). Null: no end date. */
  closesOnLabel: string | null
  pollUrl: string
}

export function renderPollOpenedEmail(i: PollOpenedInput): RenderedPollEmail {
  const subject = cleanSubject(`Poll: ${i.title}`)
  const pick = i.allowMultiple ? 'You can pick more than one answer.' : 'Pick one answer.'
  const closes = i.closesOnLabel ? `Please answer by ${i.closesOnLabel}.` : 'There is no end date yet.'
  const list = i.options.map((o) => `<li style="margin:0 0 6px;">${escapeHtml(o)}</li>`).join('')

  const html = renderEmailDocument({
    fluid: true,
    previewText: `${i.associationName} would like your answer: ${cleanSubject(i.title)}`,
    band: { text: i.associationName, color: POLL_ACCENT },
    bodyHtml: `${BODY_OPEN}
<p style="margin:0 0 8px;font-size:15px;color:${MUTED};">A short poll from your board</p>
<p style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:700;color:${TEXT};">${escapeHtml(i.title)}</p>
${i.description ? paragraphs(i.description) : ''}
<p style="margin:14px 0 6px;font-weight:700;">The answers are:</p>
<ul style="margin:0 0 12px;padding:0 0 0 22px;">${list}</ul>
<p style="margin:0 0 12px;">${escapeHtml(pick)} ${escapeHtml(closes)}</p>
${renderButtonHtml(i.pollUrl, 'Answer the poll')}
<p style="margin:16px 0 0;font-size:15px;color:${MUTED};">${escapeHtml(POLL_NOT_A_VOTE)}</p>
</div>`,
    footerHtml: footer(i.associationName),
  })

  const text = `${i.associationName}: a short poll from your board

${i.title}
${i.description ? `\n${i.description}\n` : ''}
The answers are:
${i.options.map((o) => `- ${o}`).join('\n')}

${pick} ${closes}

Answer the poll:
${i.pollUrl}

${POLL_NOT_A_VOTE}`
  return { subject, html, text }
}

export interface PollResultsInput {
  associationName: string
  title: string
  rows: readonly TallyRow[]
  homesAnswered: number
  allowMultiple: boolean
  resultsUrl: string
}

export const MULTIPLE_CHOICE_NOTE =
  'Homes could pick more than one answer, so the percents can add up to more than 100.'

export function renderPollResultsEmail(i: PollResultsInput): RenderedPollEmail {
  const subject = cleanSubject(`Poll results: ${i.title}`)
  const answered =
    i.homesAnswered === 0 ? 'No homes answered this poll.' : `${homesPhrase(i.homesAnswered)} answered this poll.`

  const html = renderEmailDocument({
    fluid: true,
    previewText: `${answered} ${cleanSubject(i.title)}`,
    band: { text: i.associationName, color: POLL_ACCENT },
    bodyHtml: `${BODY_OPEN}
<p style="margin:0 0 8px;font-size:15px;color:${MUTED};">The poll has closed. Here are the results.</p>
<p style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:700;color:${TEXT};">${escapeHtml(i.title)}</p>
<p style="margin:0 0 18px;font-weight:700;">${escapeHtml(answered)}</p>
${renderPollBarsHtml(i.rows)}
${i.allowMultiple ? `<p style="margin:0 0 12px;font-size:15px;color:${MUTED};">${escapeHtml(MULTIPLE_CHOICE_NOTE)}</p>` : ''}
${renderButtonHtml(i.resultsUrl, 'See the results')}
<p style="margin:16px 0 0;font-size:15px;color:${MUTED};">${escapeHtml(POLL_NOT_A_VOTE)} Answers are counted by home and are never shown by name.</p>
</div>`,
    footerHtml: footer(i.associationName),
  })

  const text = `${i.associationName}: poll results

${i.title}

${answered}

${i.rows.map((r) => `${r.label}: ${figureLabel(r.votes, r.percent)}`).join('\n')}
${i.allowMultiple ? `\n${MULTIPLE_CHOICE_NOTE}\n` : ''}
See the results:
${i.resultsUrl}

${POLL_NOT_A_VOTE} Answers are counted by home and are never shown by name.`
  return { subject, html, text }
}
