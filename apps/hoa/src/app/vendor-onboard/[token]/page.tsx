import { notFound } from 'next/navigation'
import { createAdminClient } from '@homeowner-portal/db'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { validateInvitationToken } from '@/lib/vendor-invitations'
import { PublicOnboardingForm } from './PublicOnboardingForm'

export const metadata = { title: 'Vendor onboarding' }

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function VendorOnboardPage({ params }: PageProps) {
  const { token } = await params
  const validation = await validateInvitationToken(token)

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

  const invitation = validation.invitation

  // Fetch the inviting org's name to show in the form header. Goes
  // through the admin client because the visitor isn't authenticated.
  const db = createAdminClient()
  const { data: org } = await db
    .from('orgs')
    .select('name')
    .eq('id', invitation.organizationId)
    .maybeSingle<{ name: string }>()

  if (!org) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
          Vendor onboarding
        </p>
        <h1 className="text-2xl font-bold text-muted">{org.name}</h1>
        <p className="text-sm text-muted-fg">
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

function reasonTitle(reason: 'not_found' | 'expired' | 'consumed' | 'revoked'): string {
  if (reason === 'expired') return 'Invitation expired'
  if (reason === 'consumed') return 'Already submitted'
  if (reason === 'revoked') return 'Invitation revoked'
  return 'Invitation not found'
}

function reasonDetail(reason: 'not_found' | 'expired' | 'consumed' | 'revoked'): string {
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
