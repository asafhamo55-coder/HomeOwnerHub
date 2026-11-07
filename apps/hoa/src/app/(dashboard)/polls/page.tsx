import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Button, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatShortDate } from '@/lib/format-datetime'
import { getPrimaryAssociation } from '@/lib/vendors'
import { listPolls, pollsAvailable, type PollsClient } from '@/lib/polls/store'
import { effectiveStatus } from '@/lib/polls/rules'
import { PollNotice } from '@/components/polls/PollNotice'

export const metadata = { title: 'Polls' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL = { draft: 'Draft', open: 'Open', closed: 'Closed' } as const

export default async function PollsPage() {
  if (!pollsAvailable()) notFound()
  const { org } = await requireBoardOrAdmin()
  const assoc = await getPrimaryAssociation()
  const supabase = await getSupabaseServerClient()
  const res = await listPolls(supabase as unknown as PollsClient, undefined, org.id)
  const now = new Date()

  return (
    <Page
      title="Polls"
      description={
        assoc
          ? `Ask residents of ${assoc.name} a quick question and see how homes answered.`
          : 'Ask residents a quick question and see how homes answered.'
      }
      actions={
        <Button asChild size="lg">
          <Link href="/polls/new">New poll</Link>
        </Button>
      }
      linkAs={Link}
    >
      <PollNotice />
      {!res.ok ? (
        <LoadFailed what="your polls" retryHref="/polls" />
      ) : res.data.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-base">
            No polls yet. Press New poll to ask your first question.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {res.data.map((p) => {
            const eff = effectiveStatus(p, now)
            return (
              <li key={p.id}>
                <Link
                  href={`/polls/${p.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface p-4 text-base hover:bg-subtle"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-foreground-secondary">
                    <Badge>{STATUS_LABEL[eff]}</Badge>
                    {formatShortDate(p.created_at)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
