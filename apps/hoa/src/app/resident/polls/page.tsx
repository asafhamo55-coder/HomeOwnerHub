import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Vote } from 'lucide-react'
import { Badge, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatShortDate } from '@/lib/format-datetime'
import { listPolls, pollsAvailable, type PollsClient } from '@/lib/polls/store'
import { effectiveStatus } from '@/lib/polls/rules'
import { PollNotice } from '@/components/polls/PollNotice'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Polls' }
export const dynamic = 'force-dynamic'

export default async function ResidentPollsPage() {
  if (!pollsAvailable()) notFound()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />
  const supabase = await getSupabaseServerClient()
  const res = await listPolls(supabase as unknown as PollsClient, ['open', 'closed'])
  const now = new Date()
  const header = <ScreenHeader title="Polls" subtitle="Quick questions from your board. Each home answers once." />

  return (
    <div className="space-y-6">
      {header}
      <PollNotice />
      {!res.ok ? (
        <LoadFailed what="your association’s polls" retryHref="/resident/polls" />
      ) : res.data.length === 0 ? (
        <ScreenEmpty
          icon={<Vote />}
          tone="slate"
          title="No polls right now"
          description="When your board asks a question, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {res.data.map((p) => {
            const eff = effectiveStatus(p, now)
            return (
              <li key={p.id}>
                <Link
                  href={`/resident/polls/${p.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface p-4 text-base"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-foreground-secondary">
                    <Badge>{eff === 'open' ? 'Open' : 'Closed'}</Badge>
                    {formatShortDate(p.created_at)}
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
