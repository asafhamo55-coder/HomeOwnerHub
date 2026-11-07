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

import { cleanManagedBy, MAX_MANAGED_BY_LENGTH } from '@/lib/managed-by'
import { emailAssetUrl } from './asset-url'
import { BRAND, EMAIL_FONT, LOGO_DIR, LOGO_DARK_CSS, LOGO_FILE, logoHeaderRowsHtml } from './brand'

export interface EmailBand {
  text: string
  /** Solid accent. Validate with palette.assertAccent before passing. */
  color: string
}

export interface EmailDocumentOptions {
  bodyHtml: string
  footerHtml: string
  band?: EmailBand
  /**
   * The association's "Managed by" line (Settings, Association). Plain text:
   * it is cleaned, capped and HTML-escaped here, so a caller passes the raw
   * stored value. Empty or omitted renders nothing and the footer is exactly
   * what it was.
   */
  managedBy?: string | null
  /** Inbox preview line. Hidden in the body, shown in the list view. */
  previewText?: string
  /** The document title (the subject, for mail that has one). Read by screen readers and the browser view. */
  title?: string
  /**
   * Shrink to the screen on phones instead of a fixed 600px card. Uses the
   * "ghost table" hybrid: a 100%-wide card capped at 600px by max-width for
   * every client that honours it, wrapped in an MSO-only fixed 600px table
   * so Outlook's Word engine (which ignores max-width) still gets the
   * attribute width described above.
   */
  fluid?: boolean
  /**
   * Extra CSS for the document head (media queries for phones). Clients that
   * strip <style> still get the inline styles, so this only ever refines.
   * Omitted: the head is exactly what it was.
   */
  extraCss?: string
  /**
   * The HomeownerHub logo header. On by default for every email. Only the
   * internal tooling that has already drawn its own header turns it off.
   */
  logo?: boolean
  /**
   * Absolute https URL of the logo PNG. Leave unset to build it from
   * EMAIL_ASSET_BASE_URL (server-side renders). Pass it when the body is
   * built where that server-only variable is not readable, as the welcome
   * email is (its template is assembled in the browser composer). Pass
   * null to force the text wordmark.
   */
  logoUrl?: string | null
}

const PAGE_BG = BRAND.page
const CARD_BG = BRAND.card
const TEXT = BRAND.ink
const MUTED = BRAND.muted
const LINE = BRAND.line
const FOOTER_BG = BRAND.panel
const FONT = EMAIL_FONT

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
  return `<tr><td bgcolor="${band.color}" style="background-color:${band.color};color:#ffffff;padding:13px 22px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(band.text)}</td></tr>`
}

/**
 * The brand header: the full-colour logo on a WHITE band, with a 4px deep blue
 * rule under it.
 *
 * Why white and not a deep-blue band with the white logo: dark-mode
 * engines (Gmail iOS, Outlook.com, Apple Mail) invert or partially invert
 * backgrounds but never touch image pixels. A white band is already the
 * "light" case, so it stays put (the document declares color-scheme: light),
 * and where an engine does darken it the PNG is a blue badge with
 * transparent corners, so it still reads as deliberate on dark. A
 * deep-blue band would invert unpredictably and could leave the white logo
 * on white. The deep blue rule keeps the deep blue at the very top of every
 * message, which is what the site does.
 *
 * The URL is built from EMAIL_ASSET_BASE_URL (asset-url.ts), never from the
 * deployment host. If that variable is missing the header degrades to the
 * styled wordmark in text, loudly, rather than failing the whole send.
 */
let logoWarned = false

/** Test hook: lets a test see the once-per-process warning again. */
export function resetLogoWarning(): void {
  logoWarned = false
}

export function logoUrl(): string | null {
  try {
    return emailAssetUrl(LOGO_FILE, LOGO_DIR)
  } catch (err) {
    if (!logoWarned) {
      logoWarned = true
      console.error(`[email] logo unavailable, sending text header: ${err instanceof Error ? err.message : String(err)}`)
    }
    return null
  }
}

function logoRow(explicit: string | null | undefined): string {
  return logoHeaderRowsHtml(explicit === undefined ? logoUrl() : explicit)
}

function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">${escapeHtml(text)}</div>`
}

/**
 * Where the "Managed by" row goes. Every shell document carries this comment
 * at the end of its footer, so a message built from a template (merge fields
 * filled in later, per association) can have the row added at send time with
 * applyManagedBy, without the template knowing the association.
 */
export const MANAGED_BY_MARKER = '<!--eh-managed-by-->'

/** Put the association's "Managed by" row into a shell document. No line, or no marker: unchanged. */
export function applyManagedBy(html: string, line: string | null | undefined): string {
  const row = managedByFooterHtml(line)
  if (!row || !html.includes(MANAGED_BY_MARKER)) return html
  return html.replace(MANAGED_BY_MARKER, () => row + MANAGED_BY_MARKER)
}

/** The footer's "Managed by" row, or '' when there is no line. */
export function managedByFooterHtml(line: string | null | undefined): string {
  const text = cleanManagedBy(line).slice(0, MAX_MANAGED_BY_LENGTH).trim()
  if (!text) return ''
  return `<div data-managed-by style="margin-top:10px;padding-top:10px;border-top:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(text)}</div>`
}

export function renderEmailDocument(opts: EmailDocumentOptions): string {
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${opts.title ? escapeHtml(opts.title) : ''}</title>
<style type="text/css">${LOGO_DARK_CSS}${opts.extraCss ?? ''}</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};color:${TEXT};">
${opts.previewText ? preheader(opts.previewText) : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};color:${TEXT};">
<tr><td class="eh-page" align="center" bgcolor="${PAGE_BG}" style="padding:18px;background-color:${PAGE_BG};color:${TEXT};">
${opts.fluid ? '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' : ''}
${
  opts.fluid
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD_BG}" style="width:100%;max-width:600px;background-color:${CARD_BG};color:${TEXT};border:1px solid ${LINE};">`
    : `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD_BG}" style="width:600px;background-color:${CARD_BG};color:${TEXT};border:1px solid ${LINE};">`
}
${opts.logo === false ? '' : logoRow(opts.logoUrl)}
${opts.band ? bandRow(opts.band) : ''}
<tr><td class="eh-body" bgcolor="${CARD_BG}" style="padding:22px;font-family:${FONT};color:${TEXT};background-color:${CARD_BG};">
${opts.bodyHtml}
</td></tr>
<tr><td bgcolor="${FOOTER_BG}" style="background-color:${FOOTER_BG};color:${MUTED};padding:14px 22px;border-top:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:1.6;">
${opts.footerHtml}${MANAGED_BY_MARKER}
</td></tr>
</table>
${opts.fluid ? '<!--[if mso]></td></tr></table><![endif]-->' : ''}
</td></tr></table>
</body></html>`
  return applyManagedBy(html, opts.managedBy)
}
