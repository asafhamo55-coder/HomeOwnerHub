// Shared brand bits for server and client components (no 'use client', so a
// server component importing SIGN_IN_URL gets the string, not a client
// reference).

// Production HOA app — the live host residents and boards sign in on.
// Cross-origin: the marketing site has no /login of its own (it was a 404),
// so every "Sign in" is a plain anchor to this URL.
export const SIGN_IN_URL = 'https://www.homeownerledger.com/login'

// Concept B letterform mark: capital `L` for Ledger, in a soft-cornered
// brand square. Geometric, flat-cut, 2.8-unit stroke at viewBox scale.
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M11 7.5v17M11 24.5h12"
        className="stroke-primary-fg"
        strokeWidth="2.8"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  )
}
