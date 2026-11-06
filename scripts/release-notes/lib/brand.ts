// Brand constants for the internal release-note, owner-actions and backlog
// emails.
//
// Palette: the marketing site's "Royal purple" (apps/marketing/src/app/
// globals.css), the same values the product's own emails use
// (packages/workflows/src/email-brand). Copied, not imported: this script
// runs under plain tsx in CI and must not pull in a package build graph. If
// the palette moves, update these; release-notes.test.ts fails on drift.
// The logo is the HomeownerHub PNG the app serves from its public origin
// (apps/hoa/public/email/v2/homeownerhub-logo.png), 2x, opaque white field.

export const BRAND = {
  productName: 'HomeownerHub',
  appName: 'HomeownerHub',
  // The app's public origin (APP_ORIGIN, set by release-notes.yml from the
  // repo variable); the pre-split host until then.
  prodUrl: process.env.APP_ORIGIN || 'https://www.homeownerledger.com',
  repoUrl: 'https://github.com/asafhamo55-coder/HomeOwnerHub',
  primary: '#6D28D9',
  primaryFg: '#FFFFFF',
  primarySubtle: '#F0E8FF',
  background: '#F6F2FB',
  surface: '#FFFFFF',
  subtle: '#F3EEFA',
  border: '#E9E3EE',
  foreground: '#211B2C',
  foregroundSecondary: '#423A50',
  muted: '#5C5469',
  accentSubtle: '#FFF6E5',
  accentFg: '#93370D',
  /** Absolute https URL of the header logo, served by the app (middleware leaves /email/ public). */
  logoUrl: `${process.env.APP_ORIGIN || 'https://www.homeownerledger.com'}/email/v2/homeownerhub-logo.png`,
  logoWidth: 180,
  logoHeight: 30,
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const
