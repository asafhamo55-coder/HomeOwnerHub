import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Vote } from 'lucide-react'
import { Badge, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { currentScopeZones } from '@/lib/association-time-current'
import { formatBallotTime } from '@/lib/online-voting/time'
import { listBallots, onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'
import { votingWindow } from '@/lib/online-voting/model'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Vote' }
export const dynamic = 'force-dynamic'

export default async function ResidentVotePage() {
  if (!onlineVotingAvailable()) notFound()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const res = await listBallots(supabase, ['open', 'closed'])
  const now = Date.now()
  const zoneOf = await currentScopeZones()

  return (
    <div className="space-y-6">
      <ScreenHeader title="Vote" subtitle="Board elections and questions. Each home votes once. Your vote is secret." />
      {!res.ok ? (
        <LoadFailed what="your ballots" retryHref="/resident/vote" />
      ) : res.data.length === 0 ? (
        <ScreenEmpty
          icon={<Vote />}
          tone="slate"
          title="No ballots right now"
          description="When your board opens a vote, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {res.data.map((b) => {
            const w = b.opens_at && b.closes_at ? votingWindow(b.opens_at, b.closes_at, now) : 'ended'
            return (
              <li key={b.id}>
                <Link
                  href={`/resident/vote/${b.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface p-4 text-base"
                >
                  <span className="font-medium">{b.title}</span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-sm text-foreground-secondary">
                    <Badge>{w === 'open' ? 'Open now' : w === 'not_yet' ? 'Not open yet' : 'Ended'}</Badge>
                    {w === 'open' && b.closes_at ? `Closes ${formatBallotTime(b.closes_at, zoneOf(b.association_id))}` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
