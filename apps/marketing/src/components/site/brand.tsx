// Shared brand bits for server and client components (no 'use client', so a
// server component importing SIGN_IN_URL gets the string, not a client
// reference).
import { LedgerLogo } from '@homeowner-portal/ui/brand'

// Production HOA app — the live host residents and boards sign in on.
// Cross-origin: the marketing site has no /login of its own (it was a 404),
// so every "Sign in" is a plain anchor to this URL.
export const SIGN_IN_URL = 'https://www.homeownerledger.com/login'

// Ledger logo (BL-094): the roof-over-ledger-lines mark plus the monoline
// "Ledger" wordmark, shared with the HOA app via packages/ui. Static files
// (SVG/PNG, light and dark) live in public/brand/.
export function Logo({ className }: { className?: string }) {
  return <LedgerLogo size="md" {...(className ? { className } : {})} />
}
