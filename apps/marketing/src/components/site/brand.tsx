// Shared brand bits for server and client components (no 'use client', so a
// server component importing SIGN_IN_URL gets the string, not a client
// reference).
import { BrandLogo } from '@homeowner-portal/ui/brand'

// The HOA app's sign-in page, on the app origin (NEXT_PUBLIC_APP_URL, see
// lib/app-origin.ts). Cross-origin: the marketing site has no /login of its
// own, so every "Sign in" is a plain anchor to this URL.
export { SIGN_IN_URL, SIGN_UP_URL } from '@/lib/app-origin'

// HomeownerHub logo (BL-098): the H-roof monogram mark plus the monoline
// "HomeownerHub" wordmark, shared with the HOA app via packages/ui. Static files
// (SVG/PNG, light and dark) live in public/brand/.
export function Logo({ className }: { className?: string }) {
  return <BrandLogo size="md" {...(className ? { className } : {})} />
}
