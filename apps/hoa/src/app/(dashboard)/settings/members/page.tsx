import Link from 'next/link'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadFailed,
  Page,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listMembers, listOrgProperties } from '@/lib/members'
import { tryLoad } from '@/lib/load-or-fail'
import { countMyPushDevices } from '@/lib/push-subscriptions'
import { EnablePushButton } from '@/components/notifications/EnablePushButton'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { InviteMemberForm } from './InviteMemberForm'
import { MemberRow } from './MemberRow'
import { InviteAllOwners, PendingInvitations } from './OwnerInvites'
import { listPendingInvitations, previewOwnerInvites } from '@/lib/owner-invites-actions'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { loadJoinHomes, loadLiveJoinCodes, type JoinDb } from '@/lib/owner-join/board'
import { JoinCodes } from './JoinCodes'
import { loadEmailConsent } from '@/lib/email-consent'
import { createAdminClient } from '@homeowner-portal/db'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { loadDirectorCertBoard } from '@/lib/compliance/director-certs-load'
import { directorCertView } from '@/lib/compliance/director-certs'
import { DirectorCertPanel } from '@/components/compliance/DirectorCertPanel'

export const metadata = { title: 'Members' }

export default async function MembersPage() {
  const { role, org } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [membersResult, properties, pushDevices, consentResult, ownerPreview, pending] = await Promise.all([
    tryLoad('members', () => listMembers()),
    listOrgProperties(),
    // Board members are the people ticket notifications go to, and this
    // is the only settings page besides Billing they can reach — /settings
    // and /settings/mailbox both gate on requireAdmin. Hence the opt-in
    // card living here rather than on the main Settings page.
    countMyPushDevices(),
    // BL-020 (M1): each member's consent to official notices by email.
    // Not read at all until M1_APPLIED.
    M1_APPLIED ? loadEmailConsent(supabase, org.id) : Promise.resolve(null),
    // BL-128: owners on the roster with no account, and invitations
    // nobody has accepted yet.
    previewOwnerInvites(),
    listPendingInvitations(),
  ])
  // BL-139: Florida director certification (§ 720.3033(1)). Not shown for
  // any other state.
  const directorCerts = await loadDirectorCertBoard({
    db: supabase,
    admin: createAdminClient(),
    orgId: org.id,
    todayYmd: todayIn(await currentTimeZone()),
  })
  // BL-143 (M5): homes to issue a join code for, and the codes not used yet.
  // No query at all with the flag off.
  const [joinHomes, joinCodes] = M5_APPLIED
    ? await Promise.all([
        loadJoinHomes(supabase as unknown as JoinDb, org.id, true),
        loadLiveJoinCodes(supabase as unknown as JoinDb, org.id, new Date().toISOString(), true),
      ])
    : [null, null]
  const consent = consentResult?.ok && consentResult.available ? consentResult.consent : null

  // null = the server could not read push_subscriptions at all (0053 not
  // applied yet). The card renders "not available yet" for that, which is
  // a different thing from "you have zero devices".
  const storedDeviceCount = pushDevices.ok ? pushDevices.data.count : null

  return (
    <Page
      width="narrow"
      title="Settings"
      description="Who has access to this HOA, and at what role."
      tabs={<SettingsTabs current="/settings/members" role={role} />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Invite a member</CardTitle>
          <CardDescription>
            Admins can do everything. Board members run day-to-day operations. Residents see their own dues and
            documents and can submit requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMemberForm properties={properties} role={role} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Invite owners to the portal</CardTitle>
          <CardDescription>
            Sends the invitation email to every owner on your roster who has an email address and no account yet, a
            batch at a time. You confirm the count first. Each account is linked to the home the owner holds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteAllOwners
            total={ownerPreview.ok ? ownerPreview.data.total : null}
            held={ownerPreview.ok ? ownerPreview.data.held : 0}
          />
        </CardContent>
      </Card>

      {M5_APPLIED ? (
        <Card id="join-codes">
          <CardHeader className="pb-4">
            <CardTitle as="h2">Join codes</CardTitle>
            <CardDescription>
              For an owner who already has an account, or whose home isn’t linked yet: make a one-time code for their
              home and give it to them. They enter it on “Ask to join”, and the request comes to Approvals for a board
              member to approve. Owners can also ask with their address; those requests come to Approvals too.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JoinCodes homes={joinHomes} codes={joinCodes} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          className="pb-3"
          actions={
            pending && pending.length > 0 ? (
              <Badge variant="neutral" className="num">
                {pending.length}
              </Badge>
            ) : null
          }
        >
          <CardTitle as="h2">Pending invitations</CardTitle>
          <CardDescription>Invited but not signed in yet. Resend the email, or revoke an invitation sent by mistake.</CardDescription>
        </CardHeader>
        <CardContent>
          {pending ? (
            <PendingInvitations invitations={pending} viewerRole={role} />
          ) : (
            <LoadFailed what="pending invitations" retryHref="/settings/members" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="pb-3"
          actions={
            membersResult.ok ? (
              <Badge variant="neutral" className="num">
                {membersResult.data.length}
              </Badge>
            ) : null
          }
        >
          <CardTitle as="h2">Members</CardTitle>
          <CardDescription>The last admin can’t be demoted or removed — promote someone else first.</CardDescription>
          {consent ? (
            <CardDescription>
              E-consent: whether the member agreed to get official notices by email. California associations may
              email official notices only to members who did (Civ. Code §4040).
            </CardDescription>
          ) : null}
        </CardHeader>
        {consentResult && !consentResult.ok ? (
          <CardContent className="pb-3">
            <LoadFailed what="e-consent" hint="Members are listed below; their e-consent status couldn’t be read." />
          </CardContent>
        ) : null}
        {membersResult.ok ? (
          <ul className="divide-y divide-border border-t border-border">
            {membersResult.data.map((m) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isSelf={m.user_id === user?.id}
                viewerRole={role}
                {...(consent ? { consent: consent.get(m.user_id) ?? null } : {})}
              />
            ))}
          </ul>
        ) : (
          <CardContent>
            <LoadFailed what="members" retryHref="/settings/members" />
          </CardContent>
        )}
      </Card>

      {directorCerts.kind !== 'not_applicable' ? (
        <Card id="director-certification">
          <CardHeader className="pb-3">
            <CardTitle as="h2">Florida director certification</CardTitle>
            <CardDescription>
              Within 90 days after being elected or appointed, each director must submit a certificate of completing
              the state-approved director education. A director who misses it is suspended from the board until they
              comply. The certificate is valid for up to 4 years, and the association keeps it for 5 years after the
              director’s election (Fla. Stat. § 720.3033(1)). Informational, not legal advice.
            </CardDescription>
          </CardHeader>
          {directorCerts.kind === 'ok' ? (
            <DirectorCertPanel rows={directorCerts.rows.map(directorCertView)} />
          ) : (
            <CardContent>
              <LoadFailed what="director certification" retryHref="/settings/members" />
            </CardContent>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Ticket notifications on this device</CardTitle>
          <CardDescription>
            Get an alert the moment a resident opens a ticket, even with the app closed. Turn it on separately on
            each phone and computer you use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnablePushButton storedDeviceCount={storedDeviceCount} />
        </CardContent>
      </Card>
    </Page>
  )
}
