import { redirect } from 'next/navigation'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getSignedInUser } from '@/lib/orgs'
import { inviteSecret, verifyInvite } from '@/lib/professionals/invite-token'
import { PRO_ROLE_LABEL, type ProRole } from '@/lib/professionals/model'
import { AcceptInviteButton } from './AcceptInviteButton'

export const metadata = { title: 'Accept your invitation' }
export const dynamic = 'force-dynamic'

/**
 * BL-168: the page behind the link in a CPA's or attorney's invitation.
 * The middleware has already sent a signed-out visitor to sign in and back.
 * Nothing about the invitation is shown until the link's signature checks
 * and the signed-in account is the invited, confirmed email.
 */
export default async function AcceptProfessionalInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sig?: string }>
}) {
  if (!M6_APPLIED) redirect('/')
  const { id } = await params
  const { sig } = await searchParams
  const user = await getSignedInUser()
  if (!user) redirect('/login')

  const secret = inviteSecret()
  const valid = secret !== null && /^[0-9a-f-]{36}$/i.test(id) && verifyInvite(id, sig, secret)
  const { data: inv, error: invError } = valid
    ? await createAdminClient()
        .from('professional_invites' as never)
        .select('email, role, organization_id, access_expires_on, link_expires_at, accepted_at, revoked_at')
        .eq('id' as never, id as never)
        .maybeSingle()
    : { data: null, error: null }
  if (invError) throw new Error(`invitation read failed (${invError.code ?? 'error'})`)
  const row = inv as unknown as {
    email: string
    role: ProRole
    organization_id: string
    access_expires_on: string
    link_expires_at: string
    accepted_at: string | null
    revoked_at: string | null
  } | null

  const usable = row && !row.accepted_at && !row.revoked_at && Date.parse(row.link_expires_at) > Date.now()
  const mine = usable && row.email === (user.email ?? '').toLowerCase() && Boolean(user.email_confirmed_at)

  let orgName = 'the HOA'
  if (mine) {
    const { data: org, error: orgError } = await createAdminClient().from('orgs').select('name').eq('id', row.organization_id).maybeSingle()
    if (orgError) throw new Error(`org read failed (${orgError.code ?? 'error'})`)
    orgName = org?.name ?? orgName
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle as="h2">{mine ? `Join ${orgName}` : 'Invitation'}</CardTitle>
          <CardDescription>
            {mine ? `You were invited as ${PRO_ROLE_LABEL[row.role]}. Your access runs until ${row.access_expires_on}.` : undefined}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mine ? (
            <>
              <p className="text-sm text-foreground-secondary">
                You will see only what your role needs. Anything you send goes to the board for approval first.
              </p>
              <AcceptInviteButton inviteId={id} sig={sig ?? ''} />
            </>
          ) : usable ? (
            <Alert variant="warning" title="Wrong account">
              Sign in with the email address this invitation was sent to, then open the link again.
            </Alert>
          ) : (
            <Alert variant="error" title="This invitation can’t be used">
              It may have expired, been used or been cancelled. Ask the board to send a new one.
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
