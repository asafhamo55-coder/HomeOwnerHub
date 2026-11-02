import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format-datetime'
import { getBallot, onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'
import { loadBallotResults } from '@/lib/online-voting/actions'
import { ACK_STATEMENTS, onlineVotingRule } from '@/lib/online-voting/law'
import { votingWindow } from '@/lib/online-voting/model'
import { CloseBallotButton, OpenBallotPanel } from '@/components/online-voting/BallotBoardActions'

export const metadata = { title: 'Ballot' }
export const dynamic = 'force-dynamic'

const OUTCOME = { elected: 'Most votes', tied: 'Tied: board decides', not_elected: '' } as const

export default async function BallotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!onlineVotingAvailable()) notFound()
  await requireBoardOrAdmin()
  const { id } = await params
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const res = await getBallot(supabase, id)
  if (!res.ok) return <LoadFailed what="this ballot" retryHref={`/ballots/${id}`} />
  if (!res.data) notFound()
  const { ballot, options } = res.data

  const { data: assoc } = await supabase.from('associations').select('state').eq('id', ballot.association_id).maybeSingle()
  const state = ((assoc as { state: string | null } | null)?.state ?? null) as string | null
  const rule = onlineVotingRule(state)
  const window =
    ballot.status !== 'draft' && ballot.opens_at && ballot.closes_at
      ? votingWindow(ballot.opens_at, ballot.closes_at, Date.now())
      : null
  const ended = ballot.status !== 'draft' && window === 'ended'
  const results = ended ? await loadBallotResults(id, ballot.kind === 'election' ? ballot.max_selections : 1) : null
  const seatsLabel = ballot.kind === 'election' ? `${ballot.max_selections} ${ballot.max_selections === 1 ? 'seat' : 'seats'} open.` : 'One answer per home.'

  return (
    <Page
      width="narrow"
      title={ballot.title}
      breadcrumbs={[{ label: 'Online voting', href: '/ballots' }, { label: 'Ballot' }]}
      linkAs={Link}
    >
      <div className="flex flex-wrap items-center gap-3 text-base">
        <Badge>{ballot.status === 'draft' ? 'Draft' : ended ? 'Voting ended' : window === 'not_yet' ? 'Opens soon' : 'Voting open'}</Badge>
        <span>{seatsLabel}</span>
      </div>
      {ballot.opens_at && ballot.closes_at ? (
        <p className="text-base">
          Voting runs from {formatDateTime(ballot.opens_at)} to {formatDateTime(ballot.closes_at)}.
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-2 text-lg font-semibold">{ballot.kind === 'election' ? 'Candidates' : 'Answers'}</h2>
          <ul className="list-disc space-y-1 pl-5 text-base">
            {options.map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {ballot.status === 'draft' ? (
        rule.support === 'not_supported' ? (
          <Alert variant="warning" title="Use the paper election kit">
            {rule.summary}
          </Alert>
        ) : (
          <>
            <Alert variant="info" title="Before you open voting">
              {rule.summary}
            </Alert>
            {rule.citations.length > 0 ? (
              <ul className="space-y-1 text-sm text-foreground-secondary">
                {rule.citations.map((c) => (
                  <li key={c.cite}>{c.cite}</li>
                ))}
              </ul>
            ) : null}
            <Card>
              <CardContent className="pt-5">
                <OpenBallotPanel ballotId={ballot.id} state={state} statements={ACK_STATEMENTS.map((s) => ({ ...s }))} />
              </CardContent>
            </Card>
            <p className="text-sm text-foreground-secondary">
              Nothing is sent to owners. After you open voting, share the link {`/resident/vote/${ballot.id}`} in an announcement you send yourself.
            </p>
          </>
        )
      ) : null}

      {ballot.status === 'open' && !ended ? (
        <Alert variant="info" title="Votes are secret">
          Nobody, including the board, can see any count until voting ends at {ballot.closes_at ? formatDateTime(ballot.closes_at) : 'the closing time'}.
        </Alert>
      ) : null}

      {ballot.status === 'open' && ended ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-base">Voting has ended. Mark it as finished to lock the ballot. You can read the counts below either way.</p>
            <CloseBallotButton ballotId={ballot.id} />
          </CardContent>
        </Card>
      ) : null}

      {results ? (
        results.ok ? (
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-lg font-semibold">Results</h2>
              <ul className="space-y-2">
                {results.rows.map((r) => (
                  <li key={r.optionId} className="flex items-center justify-between gap-3 rounded-xl border border-border-strong p-3 text-base">
                    <span className="font-medium">{r.label}</span>
                    <span className="shrink-0">
                      {r.votes} {r.votes === 1 ? 'vote' : 'votes'}
                      {OUTCOME[r.outcome] ? <span className="ml-2 text-sm text-foreground-secondary">{OUTCOME[r.outcome]}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-base">{results.homesVoted} {results.homesVoted === 1 ? 'home' : 'homes'} voted online.</p>
              {results.consistent ? null : (
                <Alert variant="error" title="The counts do not match">
                  The number of ballots in the box is different from the number of homes that voted. Do not publish these results. Contact support.
                </Alert>
              )}
              <Alert variant="info" title="Paper ballots are separate">
                These are online votes only. Add any paper ballots by hand when you enter the final result in the election planner. Ties are never broken for you.
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <LoadFailed what="the results" retryHref={`/ballots/${id}`} />
        )
      ) : null}
    </Page>
  )
}
