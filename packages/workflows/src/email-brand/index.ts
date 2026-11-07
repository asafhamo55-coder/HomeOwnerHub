/**
 * The one source for HomeownerHub email branding, shared by the app
 * (apps/hoa/src/lib/email/*), the background jobs (packages/jobs) and the
 * other workflow mailers, none of which can import from an app.
 *
 * Pure: no database, no clock, no dependencies. The palette is the owner-approved
 * "Option B, blue and green" as flat hex, because email cannot use CSS
 * variables.
 *
 * Contrast (WCAG relative luminance, asserted by
 * apps/hoa/src/lib/email/brand.test.ts):
 *   ink/white 17.9 · body/white 10.4 · muted/white 7.2 · primary/white 5.2
 *   white/primary 5.2 · white/deep 8.7 · primary/tint 4.8 · green/white 5.5
 *
 * Mint is decoration only. As text on white it is 2.5:1; the text version
 * is `mintText`, which clears AA.
 */

export const BRAND = {
  /** Primary blue: links, buttons, accents, the logo badge. White on it is 5.2:1. */
  primary: '#2563EB',
  /** Hover / pressed. Email has no hover; kept for the sample sheet. */
  primaryHover: '#1D4ED8',
  /** Light blue wash for callouts and pills (primary-subtle). */
  tint: '#EFF6FF',
  /** Empty part of a bar chart. */
  track: '#DBEAFE',
  /** Deep blue: the rule under the logo and large bands. */
  deep: '#1E40AF',
  /** Headings and strong text. */
  ink: '#0F172A',
  /** Body paragraphs (secondary). */
  body: '#334155',
  /** Secondary text, labels, footer. */
  muted: '#526077',
  /** Hairlines (border). */
  line: '#E2E8F0',
  /** Stronger hairline for table headers. */
  lineStrong: '#CBD5E1',
  /** Page background behind the card. */
  page: '#F1F5F9',
  /** Footer and panel wash, a hair off pure white. */
  panel: '#F8FAFC',
  card: '#FFFFFF',
  /** Green accent. Decoration only (fills, bars). Never the main button. */
  mint: '#10B981',
  /** Green-subtle wash for success pills. */
  mintTint: '#ECFDF5',
  /** Green that is allowed to carry text: success, approved, done. 5.5:1 on white. */
  mintText: '#047857',
} as const

export const EMAIL_FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

/** Folder of the header logo under the app's public root. v4: blue badge; v3 (purple) stays on disk for emails already sent. */
export const LOGO_DIR = 'email/v4'
/** File name of the header logo inside apps/hoa/public/email/v4/. */
export const LOGO_FILE = 'homeownerhub-logo.png'
/** Displayed size. The PNG itself is 2x (400 wide) for retina screens. */
export const LOGO_WIDTH = 200
export const LOGO_HEIGHT = 48
export const LOGO_ALT = 'HomeownerHub'
/** Deep navy behind the badge where a client honours prefers-color-scheme: dark. */
export const LOGO_BAND_DARK = '#172554'
/** Head CSS for the logo band. Light mode keeps the inline white; dark gets navy. */
export const LOGO_DARK_CSS = `@media (prefers-color-scheme: dark){.eh-logo{background-color:${LOGO_BAND_DARK} !important;} }`

export function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The logo URL on an app origin, or null when the origin is a host that must
 * never be baked into a stored template or a sent email: not https,
 * localhost, or a *.vercel.app preview. Null means the text wordmark.
 */
export function safeLogoUrlFromOrigin(origin: string): string | null {
  if (!origin.startsWith('https://')) return null
  if (/localhost|127\.0\.0\.1|\.vercel\.app/.test(origin)) return null
  return `${origin.replace(/\/+$/, '')}/${LOGO_DIR}/${LOGO_FILE}`
}

/**
 * The logo's absolute URL from EMAIL_ASSET_BASE_URL, or null when that is
 * unset or unusable (not https, localhost, a Vercel preview host). Null
 * makes the header fall back to the styled text wordmark. The app's own
 * shell is stricter and logs; this is the quiet version for the jobs.
 */
export function brandLogoUrl(env: Record<string, string | undefined> = process.env): string | null {
  const base = env.EMAIL_ASSET_BASE_URL
  if (!base || !base.startsWith('https://')) return null
  if (/localhost|127\.0\.0\.1|\.vercel\.app/.test(base)) return null
  return `${base.replace(/\/+$/, '')}/${LOGO_DIR}/${LOGO_FILE}`
}

/**
 * The call-to-action button: primary blue, white 17px bold text (7.1:1),
 * 52px tall. The td carries bgcolor AND an inline background so Outlook
 * (which ignores border-radius and CSS padding on anchors) still shows a
 * solid blue block. The 2px border matches the fill so the shape holds
 * where the engine drops padding.
 */
export function brandButtonHtml(href: string, label: string, color: string = BRAND.primary): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;"><tr><td align="center" bgcolor="${color}" style="background-color:${color};border:2px solid ${color};border-radius:999px;"><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:14px 30px;font-family:${EMAIL_FONT};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeEmailHtml(label)}</a></td></tr></table>`
}

/**
 * The brand header, two table rows: the logo badge on a white band, then a
 * 4px primary blue rule. The logo PNG (email/v4) is a blue rounded badge
 * with the white wordmark and TRANSPARENT corners, so it looks deliberate on
 * a white band and on a darkened one (clients invert backgrounds but never
 * image pixels). The img carries no background of its own. Clients that
 * honour prefers-color-scheme: dark get the band in deep navy (LOGO_DARK_CSS).
 *
 * `url` null renders the wordmark as styled text, which is also what shows
 * through `alt` when a client blocks images.
 */
export function logoHeaderRowsHtml(url: string | null): string {
  const textStyle = `font-family:${EMAIL_FONT};font-size:22px;line-height:30px;font-weight:700;color:${BRAND.primary};text-decoration:none;`
  const inner = url
    ? `<img src="${escapeEmailHtml(url)}" alt="${LOGO_ALT}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" border="0" style="display:block;border:0;outline:none;background:none;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;${textStyle}" />`
    : `<span style="${textStyle}">${LOGO_ALT}</span>`
  return `<tr><td class="eh-logo" bgcolor="${BRAND.card}" style="background-color:${BRAND.card};color:${BRAND.ink};padding:18px 22px 16px;">${inner}</td></tr>
<tr><td bgcolor="${BRAND.deep}" height="4" style="background-color:${BRAND.deep};color:${BRAND.deep};height:4px;font-size:1px;line-height:4px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`
}

/**
 * A branded document around an existing HTML fragment, for mailers that
 * build their own body (digests, invitations, alerts). Same frame as the
 * app shell: light slate page, 600px white card (fluid), logo header, footer in
 * 14px muted text, bgcolor plus inline background on every cell.
 */
export function wrapBrandedEmail(opts: {
  bodyHtml: string
  /** Already-escaped footer markup. Omit for no footer. */
  footerHtml?: string
  title?: string
  previewText?: string
  /** Defaults to brandLogoUrl(). Pass null for the text wordmark. */
  logoUrl?: string | null
}): string {
  const url = opts.logoUrl === undefined ? brandLogoUrl() : opts.logoUrl
  const pre = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page};">${escapeEmailHtml(opts.previewText)}</div>`
    : ''
  const footer = opts.footerHtml
    ? `<tr><td bgcolor="${BRAND.panel}" style="background-color:${BRAND.panel};color:${BRAND.muted};padding:14px 22px;border-top:1px solid ${BRAND.line};font-family:${EMAIL_FONT};font-size:14px;line-height:1.6;">${opts.footerHtml}</td></tr>`
    : ''
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${opts.title ? escapeEmailHtml(opts.title) : ''}</title>
<style type="text/css">${LOGO_DARK_CSS}</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};color:${BRAND.ink};">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};color:${BRAND.ink};">
<tr><td align="center" bgcolor="${BRAND.page}" style="padding:18px;background-color:${BRAND.page};color:${BRAND.ink};">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.card}" style="width:100%;max-width:600px;background-color:${BRAND.card};color:${BRAND.ink};border:1px solid ${BRAND.line};">
${logoHeaderRowsHtml(url)}
<tr><td bgcolor="${BRAND.card}" style="padding:22px;font-family:${EMAIL_FONT};font-size:16px;line-height:1.6;color:${BRAND.ink};background-color:${BRAND.card};">
${opts.bodyHtml}
</td></tr>
${footer}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`
}
