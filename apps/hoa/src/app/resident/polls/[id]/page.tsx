import { notFound } from 'next/navigation'
import { LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { getMyChoices, getPoll, getResults, pollsAvailable, type PollsClient } from '@/lib/polls/store'
import { acceptsAnswers, canSeeResults, effectiveStatus } from '@/lib/polls/rules'
import { PollNotice } from '@/components/polls/PollNotice'
import { PollResults } from '@/components/polls/PollResults'
import { AnswerForm } from '@/components/polls/AnswerForm'
import { Panel, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Poll' }
export const dynamic = 'force-dynamic'

export default async function ResidentPollPage({ params }: { params: Promise<{ id: string }> }) {
  if (!pollsAvailable()) notFound()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />
  const { id } = await params
  const supabase = (await getSupabaseServerClient()) as unknown as PollsClient
  const res = await getPoll(supabase, id)
  if (!res.ok) return <LoadFailed what="this poll" retryHref={`/resident/polls/${id}`} />
  if (!res.data) notFound()
  const { poll, options } = res.data
  const now = new Date()
  const eff = effectiveStatus(poll, now)

  // Only homes in this poll's association can answer it.
  const units = (await getResidentUnits()).filter((u) => u.association_id === poll.association_id)
  const mine = await getMyChoices(supabase, id, units.map((u) => u.unit_id))
  const picked = mine.ok ? mine.data : {}
  const showResults = canSeeResults(poll, 'resident', now)
  const results = showResults ? await getResults(supabase, id) : null

  return (
    <div className="space-y-6">
      <ScreenHeader title={poll.title} subtitle={poll.description ?? undefined} />
      <PollNotice />
      {acceptsAnswers(poll, now) ? (
        units.length > 0 ? (
          <Panel>
            <AnswerForm
              pollId={poll.id}
              options={options.map((o) => ({ id: o.id, label: o.label }))}
              allowMultiple={poll.allow_multiple}
              homes={units.map((u) => ({
                unitId: u.unit_id,
                label: u.address ?? u.unit_number ?? 'Your home',
                picked: picked[u.unit_id] ?? [],
              }))}
            />
          </Panel>
        ) : (
          <p className="text-base">Only homes in this association can answer this poll.</p>
        )
      ) : (
        <p className="text-base font-medium">This poll is closed.</p>
      )}
      {!mine.ok ? <p className="text-base">We could not load your earlier answer.</p> : null}
      {results ? (
        results.ok ? (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Results so far</h2>
            <PollResults rows={results.data} allowMultiple={poll.allow_multiple} />
          </Panel>
        ) : (
          <LoadFailed what="the results" retryHref={`/resident/polls/${id}`} />
        )
      ) : eff === 'open' ? (
        <p className="text-base text-foreground-secondary">The results will show once the poll closes.</p>
      ) : null}
    </div>
  )
}
