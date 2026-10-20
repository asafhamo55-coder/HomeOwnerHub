// Release note -> branded, email-safe HTML.
//
// Email constraints honoured here: table layout only, every style inline,
// explicit bgcolor on every coloured cell (Gmail's dark mode recolours
// backgrounds it can see and leaves the rest alone, so nothing is left
// transparent), no SVG (Gmail strips it — the logo is a coloured cell with
// a letter), no web fonts, images as CID attachments rather than remote
// URLs (no tracking pixels, shows without "load images"), 600px column.

import { BRAND } from './brand'
import { blocksToHtml, blocksToText, escapeHtml, inlineText } from './markdown'
import { formatDeployedAt } from './fallback'
import type { InlineImage } from './images'
import type { ReleaseNote, SectionName } from './note'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  images: InlineImage[]
}

/** Body sections, in render order. Summary and the action callout are placed separately. */
const BODY_SECTIONS: SectionName[] = ["What's new", 'Fixes', 'Under the hood']

export function commitUrl(sha: string): string {
  return `${BRAND.repoUrl}/commit/${sha}`
}

export function subjectFor(note: ReleaseNote): string {
  return `${BRAND.productName} release: ${note.title} (${note.sha.slice(0, 7)})`
}

function sectionBlock(title: string, md: string): string {
  return `
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:4px 32px 12px 32px;">
  <h2 class="rn-fg" style="margin:20px 0 10px 0;font-size:17px;line-height:24px;font-weight:600;color:${BRAND.foreground};">${escapeHtml(title)}</h2>
  ${blocksToHtml(md)}
</td></tr>`
}

function actionBlock(md: string): string {
  return `
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:8px 32px 8px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="rn-action" bgcolor="${BRAND.accentSubtle}" style="background-color:${BRAND.accentSubtle};border-left:4px solid #F79009;border-radius:6px;padding:14px 18px;">
      <p style="margin:0 0 8px 0;font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.accentFg};">Needs your action</p>
      ${blocksToHtml(md)}
    </td></tr>
  </table>
</td></tr>`
}

function screenshotsBlock(images: readonly InlineImage[], notice?: string): string {
  if (!images.length && !notice) return ''
  const noticeRow = notice
    ? `
  <tr><td style="padding:0 0 18px 0;"><p class="rn-muted" style="margin:0;font-size:14px;line-height:20px;color:${BRAND.muted};">${escapeHtml(notice)}</p></td></tr>`
    : ''
  const rows = noticeRow + images
    .map(
      (img) => `
  <tr><td style="padding:0 0 22px 0;">
    <img src="cid:${escapeHtml(img.cid)}" alt="${escapeHtml(img.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:1px solid ${BRAND.border};border-radius:8px;" />
    <p class="rn-muted" style="margin:8px 0 0 0;font-size:13px;line-height:18px;color:${BRAND.muted};">${escapeHtml(img.alt)}</p>
  </td></tr>`,
    )
    .join('')
  return `
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:4px 32px 8px 32px;">
  <h2 class="rn-fg" style="margin:20px 0 14px 0;font-size:17px;line-height:24px;font-weight:600;color:${BRAND.foreground};">Screenshots</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
  </table>
</td></tr>`
}

export function renderHtml(note: ReleaseNote, images: readonly InlineImage[]): string {
  const short = note.sha.slice(0, 7)
  const when = formatDeployedAt(note.deployedAt)
  const summary = note.sections.Summary ?? ''
  const preheader = inlineText(summary.split(/(?<=[.!?])\s/)[0] ?? '').slice(0, 140)
  const body = BODY_SECTIONS.filter((s) => note.sections[s])
    .map((s) => sectionBlock(s, note.sections[s]!))
    .join('')
  const action = note.sections['Needs your action'] ? actionBlock(note.sections['Needs your action']) : ''
  const prodHost = BRAND.prodUrl.replace(/^https?:\/\//, '')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(subjectFor(note))}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .rn-bg { background-color:#0A0F1A !important; }
    .rn-card { background-color:#111827 !important; }
    .rn-fg, .rn-card h2, .rn-card h3 { color:#F1F5F9 !important; }
    .rn-card p, .rn-card li { color:#CBD5E1 !important; }
    .rn-muted { color:#94A3B8 !important; }
    .rn-action { background-color:#2B2110 !important; }
    .rn-action p, .rn-action li { color:#FEC84B !important; }
    .rn-card a, .rn-link { color:#60A5FA !important; }
    .rn-card code { background-color:#1E293B !important; color:#F1F5F9 !important; }
  }
  @media screen and (max-width: 620px) {
    .rn-container { width:100% !important; }
    .rn-card { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body class="rn-bg" style="margin:0;padding:0;background-color:${BRAND.background};font-family:${BRAND.font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" class="rn-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.background}" style="background-color:${BRAND.background};">
<tr><td align="center" style="padding:28px 12px 36px 12px;">
<table role="presentation" class="rn-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:${BRAND.font};">

<!-- Header: wordmark -->
<tr><td style="padding:0 4px 18px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle" style="width:36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="32" height="32" align="center" valign="middle" bgcolor="${BRAND.primary}" style="width:32px;height:32px;background-color:${BRAND.primary};border-radius:8px;color:${BRAND.primaryFg};font-size:19px;line-height:32px;font-weight:700;font-family:${BRAND.font};">H</td>
      </tr></table>
    </td>
    <td valign="middle" class="rn-fg" style="padding-left:10px;font-size:17px;line-height:24px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.foreground};">${BRAND.wordmark.lead}<span class="rn-link" style="color:${BRAND.primary};">${BRAND.wordmark.accent}</span></td>
    <td valign="middle" align="right" class="rn-muted" style="font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">Release notes</td>
  </tr></table>
</td></tr>

<!-- Title card -->
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-top:4px solid ${BRAND.primary};border-radius:12px 12px 0 0;padding:28px 32px 8px 32px;">
  <p style="margin:0 0 8px 0;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};" class="rn-link">${BRAND.appName} &middot; Now live</p>
  <h1 class="rn-fg" style="margin:0 0 10px 0;font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.015em;color:${BRAND.foreground};">${escapeHtml(note.title)}</h1>
  <p class="rn-muted" style="margin:0 0 4px 0;font-size:14px;line-height:20px;color:${BRAND.muted};">Deployed ${escapeHtml(when)} &middot; <a href="${commitUrl(note.sha)}" class="rn-link" style="color:${BRAND.primary};text-decoration:none;font-family:${BRAND.mono};">${escapeHtml(short)}</a></p>
</td></tr>
${summary ? sectionBlock('Summary', summary) : ''}${action}${body}${screenshotsBlock(images, note.screenshotNotice)}
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-radius:0 0 12px 12px;padding:8px 32px 24px 32px;">&nbsp;</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:22px 16px 0 16px;">
  <p class="rn-muted" style="margin:0 0 6px 0;font-size:13px;line-height:19px;color:${BRAND.muted};">Live at <a href="${BRAND.prodUrl}" class="rn-link" style="color:${BRAND.primary};text-decoration:none;">${prodHost}</a> &middot; Commit <a href="${commitUrl(note.sha)}" class="rn-link" style="color:${BRAND.primary};text-decoration:none;font-family:${BRAND.mono};">${escapeHtml(short)}</a></p>
  <p class="rn-muted" style="margin:0;font-size:12px;line-height:17px;color:${BRAND.muted};">An internal release notification for the ${BRAND.productName} account owner. Sent automatically after each production deploy.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`
}

export function renderText(note: ReleaseNote, images: readonly InlineImage[]): string {
  const lines: string[] = [
    `${BRAND.productName} release notes`,
    note.title,
    `Deployed ${formatDeployedAt(note.deployedAt)} (${note.sha.slice(0, 7)})`,
    '',
  ]
  const order: SectionName[] = ['Summary', 'Needs your action', ...BODY_SECTIONS]
  for (const s of order) {
    const md = note.sections[s]
    if (!md) continue
    lines.push(s.toUpperCase(), blocksToText(md), '')
  }
  if (images.length || note.screenshotNotice) {
    lines.push(
      'SCREENSHOTS',
      ...(note.screenshotNotice ? [`  ${note.screenshotNotice}`] : []),
      ...images.map((i) => `  - ${i.alt}`),
      '',
    )
  }
  lines.push(`Live at ${BRAND.prodUrl}`, `Commit: ${commitUrl(note.sha)}`)
  return lines.join('\n')
}

export function renderEmail(note: ReleaseNote, images: readonly InlineImage[]): RenderedEmail {
  return {
    subject: subjectFor(note),
    html: renderHtml(note, images),
    text: renderText(note, images),
    images: [...images],
  }
}
