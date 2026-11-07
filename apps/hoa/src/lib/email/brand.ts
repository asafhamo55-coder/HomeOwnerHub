/**
 * The colours every HomeownerHub email uses: the owner-approved
 * "Option B, blue and green" palette. The values live in one place shared with the background
 * jobs, packages/workflows/src/email-brand, because packages cannot import
 * from an app; this module is the app's door to them.
 */
export {
  BRAND,
  EMAIL_FONT,
  LOGO_ALT,
  LOGO_DARK_CSS,
  LOGO_BAND_DARK,
  LOGO_DIR,
  LOGO_FILE,
  LOGO_HEIGHT,
  LOGO_WIDTH,
  brandButtonHtml,
  safeLogoUrlFromOrigin,
  logoHeaderRowsHtml,
  wrapBrandedEmail,
} from '@homeowner-portal/workflows/email-brand'
