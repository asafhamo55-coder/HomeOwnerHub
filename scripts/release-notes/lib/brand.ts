// Brand constants for the internal release-note, owner-actions and backlog
// emails.
//
// Palette: the owner-approved "Option B, blue and green" palette , the same values the product's own emails use
// (packages/workflows/src/email-brand). Copied, not imported: this script
// runs under plain tsx in CI and must not pull in a package build graph. If
// the palette moves, update these; release-notes.test.ts fails on drift.
// The logo is the HomeownerHub PNG the app serves from its public origin
// (apps/hoa/public/email/v4/homeownerhub-logo.png), 2x, blue badge with transparent corners.

/**
 * Logo folders under the app's public root, newest first. Prod can lag the
 * repo, so a send checks them in order (logo.ts) and uses the first that
 * serves an image; keep the previous version here until prod has the new one.
 */
export const LOGO_DIRS = ['email/v4', 'email/v3'] as const
export const LOGO_FILE = 'homeownerhub-logo.png'

const prodUrl = process.env.APP_ORIGIN || 'https://www.homeownerledger.com'

export const BRAND = {
  productName: 'HomeownerHub',
  appName: 'HomeownerHub',
  // The app's public origin (APP_ORIGIN, set by release-notes.yml from the
  // repo variable); the pre-split host until then.
  prodUrl,
  repoUrl: 'https://github.com/asafhamo55-coder/HomeOwnerHub',
  primary: '#2563EB',
  primaryFg: '#FFFFFF',
  primarySubtle: '#EFF6FF',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  subtle: '#F8FAFC',
  border: '#E2E8F0',
  foreground: '#0F172A',
  foregroundSecondary: '#334155',
  muted: '#526077',
  accentSubtle: '#FFF6E5',
  accentFg: '#93370D',
  /** Absolute https URL of the header logo, served by the app (middleware leaves /email/ public). */
  logoUrl: `${prodUrl}/${LOGO_DIRS[0]}/${LOGO_FILE}`,
  logoWidth: 200,
  logoHeight: 48,
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const
