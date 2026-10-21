import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { electionOf } from '@/lib/elections/store'
import { kitIsOpen, kitMeetingLabel } from '@/lib/meeting-quorum/quorum'
import { PrintPacketButton } from '../../packet/PrintPacketButton'
import { loadElectionPage } from '../load-page'
import { Ballot, EnvelopeLabels, TallySheet } from '../print-kit'

export const metadata = { title: 'Ballot kit' }
export const dynamic = 'force-dynamic'

/**
 * BL-141: the printable ballot kit — ballot, envelope labels, and the
 * inspector's record (CA) or a tally sheet. Candidate names, seats and
 * inspectors only: no owner, balance or contact detail is printed. Printed
 * and copied by the board; never sent from the app.
 */
export default async function BallotKitPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const res = await loadElectionPage(id)
  const crumbs = [
    { label: 'Meetings', href: '/meetings' },
    { label: 'Election planner', href: `/meetings/${id}/election` },
    { label: 'Ballot kit' },
  ]
  if (!res.ok) {
    return (
      <Page title="Ballot kit" breadcrumbs={crumbs} linkAs={Link}>
        <LoadFailed what="the election" hint="Nothing was printed." />
      </Page>
    )
  }
  const { ctx } = res
  if (!kitIsOpen(ctx.eligibility)) notFound()
  const election = electionOf(ctx.election)
  const names = election.candidates.filter((c) => c.onBallot).map((c) => c.name)
  const header = {
    associationName: ctx.association?.name ?? null,
    meetingLabel: kitMeetingLabel(ctx.meeting.meeting_type),
    meetingDate: formatDay(ctx.meeting.meeting_date, 'medium'),
  }

  return (
    <Page
      width="narrow"
      title="Ballot kit"
      description="Print one copy of each page, then copy the ballot and labels for every home. Each page prints on its own sheet."
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      {names.length === 0 ? (
        <EmptyState
          variant="compact"
          title="No candidates on the ballot yet"
          description="Add the candidates in the election planner first."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/meetings/${id}/election`}>Open election planner</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <Ballot header={header} candidates={names} seats={election.seats} jurisdiction={ctx.jurisdiction} />
          <EnvelopeLabels header={header} jurisdiction={ctx.jurisdiction} inspectors={election.inspectors} />
          <TallySheet header={header} candidates={names} jurisdiction={ctx.jurisdiction} inspectors={election.inspectors} />
        </div>
      )}
    </Page>
  )
}
