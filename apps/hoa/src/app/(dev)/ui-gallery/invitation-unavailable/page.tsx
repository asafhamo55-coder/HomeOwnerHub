import { notFound } from 'next/navigation'
import { InvitationUnavailable } from '@/components/public/InvitationUnavailable'

// Dev-only preview of the public invitation pages' "couldn't load" state
// (BL-056). The real state only appears when the token lookup fails on our
// side, which `pnpm ui:shots` cannot provoke, so it screenshots this page
// instead. Same component, same full-page public layout. 404 in production.

export const metadata = { title: 'Invitation unavailable (preview)' }
export const dynamic = 'force-dynamic'

export default function InvitationUnavailablePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <InvitationUnavailable retryHref="/rfp-bid/preview-token" />
}
