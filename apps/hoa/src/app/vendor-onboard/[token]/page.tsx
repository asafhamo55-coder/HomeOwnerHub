import { createAdminClient } from '@homeowner-portal/db'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { validateInvitationToken, type ValidatedInvitation } from '@/lib/vendor-invitations'
import { ApiRouteError } from '@/lib/api/errors'
import { logRouteFailure } from '@/lib/api/log'
import { loadPublicInvitation } from '@/lib/public-invitation-load'
import { InvitationUnavailable } from '@/components/public/InvitationUnavailable'
import { PublicOnboardingForm } from './PublicOnboardingForm'

export const metadata = { title: 'Vendor onboarding' }

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function VendorOnboardPage({ params }: PageProps) {
  const { token } = await params
  // A lookup that fails on our side (the token OR the inviting org's name)
  // is "try again", never "invalid link" and never Next's error page (BL-056).
  const loaded = await loadPublicInvitation('vendor-onboard.page', () => loadOnboarding(token))
  if (loaded.state === 'unavailable') {
    return <InvitationUnavailable retryHref={`/vendor-onboard/${encodeURIComponent(token)}`} />
  }
  const validation = loaded.value

  if (!validation.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>This invitation can't be used</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="error" title={reasonTitle(validation.reason)}>
              {reasonDetail(validation.reason)}
            </Alert>
          </CardContent>
        </Card>
      </main>
    )
  }

  const { invitation, org } = validation

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Vendor onboarding
        </p>
        <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
        <p className="text-sm text-muted">
          {org.name} has invited you to onboard as a vendor. Please complete
          the form below and (if you have them ready) upload your COI, W-9,
          and contractor license. The board will review your submission and
          follow up.
        </p>
      </header>

      <Alert variant="info" title="Your information is private to this organization">
        <span className="block text-sm">
          What you submit here is shared only with {org.name}. HomeownerHub
          does not aggregate vendor data across customers.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Your business details</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicOnboardingForm
            token={token}
            inviteeEmail={invitation.inviteeEmail}
            inviteeName={invitation.inviteeName}
          />
        </CardContent>
      </Card>
    </main>
  )
}

type InvalidReason = 'not_found' | 'expired' | 'consumed' | 'revoked'

// The token, then the inviting org's name for the header. Goes through the
// admin client because the visitor isn't authenticated. A failed org read
// throws (logged by code only, RC-2) so the page shows "try again"; an org
// that is simply gone reads as an unknown invitation.
async function loadOnboarding(
  token: string,
): Promise<
  | { ok: true; invitation: ValidatedInvitation; org: { name: string } }
  | { ok: false; reason: InvalidReason }
> {
  const validation = await validateInvitationToken(token)
  if (!validation.ok) return validation

  const db = createAdminClient()
  const { data: org, error } = await db
    .from('orgs')
    .select('name')
    .eq('id', validation.invitation.organizationId)
    .maybeSingle<{ name: string }>()
  if (error) {
    logRouteFailure('vendor-onboard.page.org_lookup', error, { invitationId: validation.invitation.id })
    throw new ApiRouteError('internal')
  }
  if (!org) return { ok: false, reason: 'not_found' }
  return { ok: true, invitation: validation.invitation, org }
}

function reasonTitle(reason: InvalidReason): string {
  if (reason === 'expired') return 'Invitation expired'
  if (reason === 'consumed') return 'Already submitted'
  if (reason === 'revoked') return 'Invitation revoked'
  return 'Invitation not found'
}

function reasonDetail(reason: InvalidReason): string {
  if (reason === 'expired') {
    return 'This invitation has expired. Please ask the HOA for a fresh link.'
  }
  if (reason === 'consumed') {
    return "This invitation has already been used. If you need to update your details, ask the HOA's manager to invite you again."
  }
  if (reason === 'revoked') {
    return 'This invitation was revoked. Please reach out to the HOA directly.'
  }
  return "We couldn't find an invitation matching this link. Please double-check the URL."
}
