import { notFound } from 'next/navigation'

// Catch-all for URLs no other route matches. Without it, an unknown URL
// renders the ROOT not-found page, outside the dashboard layout, so the
// user loses the sidebar. Routing here first runs the dashboard layout
// (auth + org) and then its not-found.tsx, inside the shell. More
// specific routes — (auth), onboarding, api, auth/callback — always win
// over a catch-all, so nothing real is shadowed.
export default function MissingPage(): never {
  notFound()
}
