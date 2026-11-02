import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Button, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { currentScopeZones } from '@/lib/association-time-current'
import { formatBallotTime } from '@/lib/online-voting/time'
import { listBallots, onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'

export const metadata = { title: 'Online voting' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL = { draft: 'Draft', open: 'Open', closed: 'Finished' } as const

export default async function BallotsPage() {
  if (!onlineVotingAvailable()) notFound()
  await requireBoardOrAdmin()
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const res = await listBallots(supabase)
  const zoneOf = await currentScopeZones()

  return (
    <Page
      title="Online voting"
      description="Run a secret ballot for a director election or a yes or no question."
      actions={
        <Button asChild size="lg">
          <Link href="/ballots/new">New ballot</Link>
        </Button>
      }
      linkAs={Link}
    >
      {!res.ok ? (
        <LoadFailed what="your ballots" retryHref="/ballots" />
      ) : res.data.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-base">No ballots yet. Press New ballot to set one up.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {res.data.map((b) => (
            <li key={b.id}>
              <Link
                href={`/ballots/${b.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface p-4 text-base hover:bg-subtle"
              >
                <span className="font-medium">{b.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm text-foreground-secondary">
                  <Badge>{STATUS_LABEL[b.status]}</Badge>
                  {b.closes_at ? `Closes ${formatBallotTime(b.closes_at, zoneOf(b.association_id))}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
