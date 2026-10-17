// Brand constants for the release-note email.
//
// Sources: the wordmark is the marketing site's (apps/marketing/src/
// components/site/brand.tsx + nav.tsx: a capital "L" in a soft-cornered
// indigo square, next to "Ledger" set semibold with slight negative
// tracking). Colours are the HOA light palette from packages/ui/src/
// tokens.ts. Copied, not imported: this script runs under plain tsx in CI
// and must not pull the UI package's build graph in. If the tokens move,
// update these.

export const BRAND = {
  productName: 'Ledger',
  appName: 'HOA Hub',
  prodUrl: 'https://www.homeownerledger.com',
  repoUrl: 'https://github.com/asafhamo55-coder/HomeOwnerHub',
  primary: '#4F46E5',
  primaryFg: '#FFFFFF',
  primarySubtle: '#EEF0FF',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  subtle: '#F2F4F7',
  border: '#E4E7EC',
  foreground: '#101828',
  foregroundSecondary: '#344054',
  muted: '#5B6476',
  accentSubtle: '#FFF6E5',
  accentFg: '#93370D',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const
