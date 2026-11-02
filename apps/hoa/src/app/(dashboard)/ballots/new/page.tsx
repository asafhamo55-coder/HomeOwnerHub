import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'
import { onlineVotingRule } from '@/lib/online-voting/law'
import { NewBallotForm } from '@/components/online-voting/NewBallotForm'

export const metadata = { title: 'New ballot' }
export const dynamic = 'force-dynamic'

export default async function NewBallotPage() {
  if (!onlineVotingAvailable()) notFound()
  await requireBoardOrAdmin()
  const org = await getCurrentOrg()
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const { data, error } = await supabase
    .from('associations')
    .select('id, state')
    .eq('organization_id', org?.id ?? '')
    .order('created_at')
    .limit(1)
  const assoc = (data ?? [])[0] as { id: string; state: string | null } | undefined
  const rule = onlineVotingRule(assoc?.state)

  return (
    <Page
      width="narrow"
      title="New ballot"
      description="Owners vote from their own sign-in. You see counts only after voting ends."
      breadcrumbs={[{ label: 'Online voting', href: '/ballots' }, { label: 'New ballot' }]}
      linkAs={Link}
    >
      {error || !assoc ? (
        <LoadFailed what="your association" retryHref="/ballots/new" />
      ) : rule.support === 'not_supported' ? (
        <Alert variant="warning" title="Use the paper election kit">
          {rule.summary}
        </Alert>
      ) : (
        <>
          <Alert variant="info" title="Check your rules first">
            {rule.summary}
          </Alert>
          <Card>
            <CardContent className="pt-5">
              <NewBallotForm associationId={assoc.id} state={assoc.state} />
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  )
}
