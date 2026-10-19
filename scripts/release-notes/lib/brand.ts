// Brand constants for the release-note email.
//
// Sources: the wordmark is the marketing site's (apps/marketing/src/
// components/site/brand.tsx: the Ledger mark, a blue tile — BL-094. Gmail
// strips SVG, so the email shows it as a blue cell with an "L" next to
// "Ledger" set semibold with slight negative tracking). Colours are the HOA light palette from packages/ui/src/
// tokens.ts. Copied, not imported: this script runs under plain tsx in CI
// and must not pull the UI package's build graph in. If the tokens move,
// update these — release-notes.test.ts fails if they drift.

export const BRAND = {
  productName: 'Ledger',
  appName: 'HOA Hub',
  prodUrl: 'https://www.homeownerledger.com',
  repoUrl: 'https://github.com/asafhamo55-coder/HomeOwnerHub',
  primary: '#2563EB',
  primaryFg: '#FFFFFF',
  primarySubtle: '#EBF3FF',
  background: '#F5F8FC',
  surface: '#FFFFFF',
  subtle: '#EEF3F9',
  border: '#E2E8F0',
  foreground: '#0F172A',
  foregroundSecondary: '#334155',
  muted: '#526077',
  accentSubtle: '#FFF6E5',
  accentFg: '#93370D',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const
