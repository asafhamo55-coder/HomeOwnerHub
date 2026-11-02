import { notFound } from 'next/navigation'
import { Alert, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format-datetime'
import { getBallot, myVoterHomes, onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'
import { votingWindow } from '@/lib/online-voting/model'
import { VoteForm } from '@/components/online-voting/VoteForm'
import { Panel, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Vote' }
export const dynamic = 'force-dynamic'

export default async function ResidentBallotPage({ params }: { params: Promise<{ id: string }> }) {
  if (!onlineVotingAvailable()) notFound()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />
  const { id } = await params
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const res = await getBallot(supabase, id)
  if (!res.ok) return <LoadFailed what="this ballot" retryHref={`/resident/vote/${id}`} />
  if (!res.data || res.data.ballot.status === 'draft') notFound()
  const { ballot, options } = res.data
  const w = ballot.opens_at && ballot.closes_at ? votingWindow(ballot.opens_at, ballot.closes_at, Date.now()) : 'ended'
  const homes = w === 'open' ? await myVoterHomes(supabase, id) : null
  const todo = homes?.ok ? homes.data.filter((h) => !h.voted) : []

  return (
    <div className="space-y-6">
      <ScreenHeader
        title={ballot.title}
        back={{ href: '/resident/vote', label: 'All ballots' }}
        subtitle={ballot.closes_at ? `Voting closes ${formatDateTime(ballot.closes_at)}.` : undefined}
      />
      {w === 'not_yet' ? (
        <Alert variant="info" title="Voting has not started">
          Voting opens {ballot.opens_at ? formatDateTime(ballot.opens_at) : 'soon'}. Come back then.
        </Alert>
      ) : w === 'ended' ? (
        <Alert variant="info" title="Voting has ended">
          This vote is closed. Your board will share the result.
        </Alert>
      ) : homes && !homes.ok ? (
        <LoadFailed what="your voting details" retryHref={`/resident/vote/${id}`} />
      ) : homes && homes.data.length === 0 ? (
        <Alert variant="info" title="Only owners can vote">
          Your account is not listed as an owner of a home here. If that is wrong, ask your board to check the owner list.
        </Alert>
      ) : todo.length === 0 ? (
        <Alert variant="success" title="Your home has voted">
          Your vote is recorded and can’t be changed. Nobody can see how you voted. Thank you.
        </Alert>
      ) : (
        <Panel>
          <p className="mb-4 text-base">
            {ballot.kind === 'election'
              ? `Choose ${ballot.max_selections === 1 ? 'one person' : `up to ${ballot.max_selections} people`}. `
              : ''}
            Each home gets one vote, and your vote is secret. You will check it before it is sent.
          </p>
          <VoteForm
            ballotId={ballot.id}
            options={options.map((o) => ({ id: o.id, label: o.label }))}
            maxSelections={ballot.max_selections}
            homes={todo.map((h) => ({ propertyId: h.propertyId, label: h.label }))}
          />
        </Panel>
      )}
    </div>
  )
}
