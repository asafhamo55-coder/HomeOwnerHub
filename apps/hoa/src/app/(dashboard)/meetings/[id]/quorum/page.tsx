import Link from 'next/link'
import { Alert, Button, LoadFailed, Page } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { proxyLaw, KIT_DISCLAIMER } from '@/lib/meeting-quorum/law'
import { kitIsOpen, kitMeetingLabel, proxyReminderText } from '@/lib/meeting-quorum/quorum'
import { MEETING_TYPE } from '@/lib/status/community'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { loadKitPage } from './load-page'
import { QuorumKit, type KitHomeView } from './QuorumKit'
import { ConfirmMemberMeeting } from './ConfirmMemberMeeting'

export const metadata = { title: 'Quorum kit' }
export const dynamic = 'force-dynamic'

/**
 * BL-122 — the annual meeting quorum kit: sign-in sheet, proxy forms, the
 * "no proxy yet" chase list and a live quorum counter. Board/admin only
 * (loadKitPage gates before any read). Nothing here is sent to residents;
 * the chase list is for the board to call or email by hand.
 */
export default async function QuorumKitPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const res = await loadKitPage(id)
  const crumbs = (date?: string) => [
    { label: 'Meetings', href: '/meetings' },
    { label: date ?? 'Meeting', href: `/meetings/${id}` },
    { label: 'Quorum kit' },
  ]
  if (!res.ok) {
    return (
      <Page title="Quorum kit" breadcrumbs={crumbs()} linkAs={Link}>
        <LoadFailed what="the quorum kit" hint="The meeting and its roster couldn’t be read. Nothing was changed." />
      </Page>
    )
  }
  const { ctx } = res
  const date = formatDay(ctx.meeting.meeting_date, 'medium')
  const typeName = ctx.meeting.meeting_type ? (MEETING_TYPE[ctx.meeting.meeting_type] ?? ctx.meeting.meeting_type) : 'Untyped'

  if (ctx.eligibility === 'not_member_meeting' || ctx.eligibility === 'special_unconfirmed') {
    return (
      <Page width="narrow" title="Quorum kit" breadcrumbs={crumbs(date)} linkAs={Link}>
        {ctx.eligibility === 'special_unconfirmed' ? (
          <ConfirmMemberMeeting meetingId={id} />
        ) : (
          <Alert variant="info" title="The quorum kit is for meetings of the members">
            This is a {typeName.toLowerCase()} meeting. Owners vote, and a quorum counts, at the annual meeting or a special
            meeting of the members. If this is one, edit the meeting and set its type to Annual or Special.
            <span className="mt-3 block">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/meetings/${id}/edit`}>Edit meeting</Link>
              </Button>
            </span>
          </Alert>
        )}
      </Page>
    )
  }

  const law = proxyLaw(ctx.state)
  const label = kitMeetingLabel(ctx.meeting.meeting_type)
  const homes: KitHomeView[] = ctx.rows.map((r) => ({
    propertyId: r.propertyId,
    home: r.unitNumber ? `${r.address || 'Address not recorded'}, Unit ${r.unitNumber}` : r.address || 'Address not recorded',
    lot: r.lotNumber,
    owners: r.owners.map((o) => ({ name: o.name, share: o.share, email: o.email, phone: o.phone })),
    votes: 1,
  }))
  const reminder = proxyReminderText({ associationName: ctx.association?.name ?? null, meetingDate: date, meetingLabel: label })

  return (
    <Page
      width="wide"
      eyebrow={`${label} · ${date}`}
      title="Quorum kit"
      description="Print the sign-in sheet and proxy forms, chase the homes with no proxy yet, and count the room on the day."
      breadcrumbs={crumbs(date)}
      linkAs={Link}
    >
      {ctx.kit.state === 'unverified' ? (
        <Alert variant="warning" title="The saved check-ins couldn’t be verified">
          They weren’t written by a board save, so the kit starts empty. Your next change replaces them.
        </Alert>
      ) : null}
      {kitIsOpen(ctx.eligibility) ? (
        <QuorumKit
          meetingId={id}
          homes={homes}
          initialKit={{ memberMeeting: ctx.kit.memberMeeting, quorumPct: ctx.kit.quorumPct, homes: ctx.kit.homes }}
          statuteQuorumPct={law.statuteQuorumPct}
          statuteTitle={law.verified ? law.title : null}
          reminder={reminder}
          asOf={formatDay(ctx.asOf, 'medium')}
        />
      ) : null}
      <LegalDisclaimer>{KIT_DISCLAIMER}</LegalDisclaimer>
    </Page>
  )
}
