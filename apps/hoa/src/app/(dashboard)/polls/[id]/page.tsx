import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatShortDate } from '@/lib/format-datetime'
import { getPoll, getResults, pollsAvailable, type PollsClient } from '@/lib/polls/store'
import { effectiveStatus } from '@/lib/polls/rules'
import { PollNotice } from '@/components/polls/PollNotice'
import { PollResults } from '@/components/polls/PollResults'
import { PollBoardActions } from '@/components/polls/PollBoardActions'

export const metadata = { title: 'Poll' }
export const dynamic = 'force-dynamic'

export default async function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!pollsAvailable()) notFound()
  await requireBoardOrAdmin()
  const { id } = await params
  const supabase = (await getSupabaseServerClient()) as unknown as PollsClient
  const res = await getPoll(supabase, id)
  if (!res.ok) return <LoadFailed what="this poll" retryHref={`/polls/${id}`} />
  if (!res.data) notFound()
  const { poll, options } = res.data
  const eff = effectiveStatus(poll, new Date())
  const results = poll.status === 'draft' ? null : await getResults(supabase, id)

  return (
    <Page
      width="narrow"
      title={poll.title}
      description={poll.description ?? undefined}
      breadcrumbs={[{ label: 'Polls', href: '/polls' }, { label: 'Poll' }]}
      linkAs={Link}
    >
      <PollNotice />
      <div className="flex flex-wrap items-center gap-3 text-base">
        <Badge>{eff === 'draft' ? 'Draft' : eff === 'open' ? 'Open' : 'Closed'}</Badge>
        <span>{poll.allow_multiple ? 'Homes can pick several answers.' : 'One answer per home.'}</span>
        {poll.closes_at && eff === 'open' ? <span>Closes {formatShortDate(poll.closes_at)}.</span> : null}
      </div>
      <p className="text-base text-foreground-secondary">
        {poll.results_visibility === 'live'
          ? 'Residents see the results right away.'
          : 'Residents see the results after the poll closes.'}{' '}
        Answers are counted by home and are never shown by name.
      </p>
      <Card>
        <CardContent className="pt-5">
          {results === null ? (
            <ul className="list-disc space-y-1 pl-5 text-base">
              {options.map((o) => (
                <li key={o.id}>{o.label}</li>
              ))}
            </ul>
          ) : results.ok ? (
            <PollResults rows={results.data} allowMultiple={poll.allow_multiple} />
          ) : (
            <LoadFailed what="the results" retryHref={`/polls/${id}`} />
          )}
        </CardContent>
      </Card>
      <PollBoardActions id={poll.id} status={eff} />
    </Page>
  )
}
