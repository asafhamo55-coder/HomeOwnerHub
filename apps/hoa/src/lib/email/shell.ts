/**
 * The outer document every HomeownerHub email is wrapped in.
 *
 * Width is set with the table's `width` ATTRIBUTE, not CSS. Outlook's Word
 * rendering engine ignores `max-width` and `margin:auto` outright — a div
 * centred that way renders full-bleed at reading-pane width. That was a live
 * bug in the dues reminder before this module existed.
 *
 * The band is a solid `bgcolor`. Not a gradient: the Word engine drops
 * `linear-gradient` entirely, leaving no background at all.
 */

export interface EmailBand {
  text: string
  /** Solid accent. Validate with palette.assertAccent before passing. */
  color: string
}

export interface EmailDocumentOptions {
  bodyHtml: string
  footerHtml: string
  band?: EmailBand
  /** Inbox preview line. Hidden in the body, shown in the list view. */
  previewText?: string
}

const PAGE_BG = '#F1F3F5'
const CARD_BG = '#FFFFFF'
const TEXT = '#1A1D21'
const MUTED = '#8A939B'
const LINE = '#E8EBED'
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function bandRow(band: EmailBand): string {
  // bgcolor AND inline background-color: the attribute is what Outlook
  // honours, the inline style is what everything else honours. `color` is
  // set in the same declaration because partial-inversion engines flip a
  // background without its foreground and produce white-on-white.
  return `<tr><td bgcolor="${band.color}" style="background-color:${band.color};color:#ffffff;padding:13px 22px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(band.text)}</td></tr>`
}

function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">${escapeHtml(text)}</div>`
}

export function renderEmailDocument(opts: EmailDocumentOptions): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};color:${TEXT};">
${opts.previewText ? preheader(opts.previewText) : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};color:${TEXT};">
<tr><td align="center" style="padding:18px;background-color:${PAGE_BG};color:${TEXT};">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;background-color:${CARD_BG};color:${TEXT};border:1px solid ${LINE};">
${opts.band ? bandRow(opts.band) : ''}
<tr><td style="padding:22px;font-family:${FONT};color:${TEXT};background-color:${CARD_BG};">
${opts.bodyHtml}
</td></tr>
<tr><td style="background-color:#FAFAFA;color:${MUTED};padding:14px 22px;border-top:1px solid ${LINE};font-family:${FONT};font-size:10px;line-height:1.6;">
${opts.footerHtml}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}
