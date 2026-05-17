import { format } from 'date-fns'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { validateRfpInvitationToken } from '@/lib/rfp-invitations'
import { PublicBidForm } from './PublicBidForm'

export const metadata = { title: 'Submit your bid' }

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function RfpBidPage({ params }: PageProps) {
  const { token } = await params
  const validation = await validateRfpInvitationToken(token)

  if (!validation.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>This bid invitation can't be used</CardTitle>
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

  if (validation.alreadyBid) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>You've already submitted a bid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              Thanks — your bid for {validation.invitation.rfpNumber} is on
              file. If you need to update it, contact the HOA directly.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const inv = validation.invitation
  const deadlineFmt = format(new Date(inv.submissionDeadline), 'PPp')

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs text-muted-fg">{inv.rfpNumber}</p>
        <h1 className="text-2xl font-bold text-muted">{inv.rfpTitle}</h1>
        <p className="text-sm text-muted-fg">
          Invitation for <strong>{inv.vendorLegalName}</strong> · deadline {deadlineFmt}
        </p>
      </header>

      <Alert variant="info" title="Your bid is private to this HOA">
        <span className="block text-sm">
          What you submit here is shared only with the inviting HOA.
          HomeownerHub does not show bid pricing across customers.
        </span>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted">{inv.rfpScope}</p>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Submit your bid</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicBidForm token={token} />
        </CardContent>
      </Card>
    </main>
  )
}

function reasonTitle(reason: 'not_found' | 'rfp_closed' | 'revoked' | 'expired'): string {
  if (reason === 'rfp_closed') return 'This RFP is closed'
  if (reason === 'revoked') return 'Invitation revoked'
  if (reason === 'expired') return 'Submission deadline passed'
  return 'Invitation not found'
}

function reasonDetail(reason: 'not_found' | 'rfp_closed' | 'revoked' | 'expired'): string {
  if (reason === 'rfp_closed') {
    return 'The RFP this invitation belongs to is no longer accepting bids — it was either awarded or cancelled.'
  }
  if (reason === 'revoked') {
    return 'This invitation was revoked by the HOA. Please reach out to them directly if you believe this is in error.'
  }
  if (reason === 'expired') {
    return "The submission deadline for this RFP has passed. Please contact the HOA if you'd still like to be considered."
  }
  return "We couldn't find an invitation matching this link. Please double-check the URL."
}
