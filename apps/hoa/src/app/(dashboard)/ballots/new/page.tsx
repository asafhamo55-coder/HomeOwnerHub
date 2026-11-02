import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Button, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { onlineVotingAvailable, type BallotClient } from '@/lib/online-voting/store'
import { onlineVotingRule } from '@/lib/online-voting/law'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone } from '@/lib/association-time'
import { NewBallotForm } from '@/components/online-voting/NewBallotForm'

export const metadata = { title: 'New ballot' }
export const dynamic = 'force-dynamic'

export default async function NewBallotPage({ searchParams }: { searchParams: Promise<{ association?: string }> }) {
  if (!onlineVotingAvailable()) notFound()
  await requireBoardOrAdmin()
  const org = await getCurrentOrg()
  const supabase = (await getSupabaseServerClient()) as unknown as BallotClient
  const { data, error } = await supabase
    .from('associations')
    .select(`id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('organization_id', org?.id ?? '')
    .order('created_at')
    .range(0, 99)
  const associations = (data ?? []) as unknown as Array<{ id: string; name: string; state: string | null }>
  // Several communities: the board picks one first. Only ids from this org's own list are accepted.
  const { association: chosenId } = await searchParams
  const assoc = associations.length > 1 ? associations.find((a) => a.id === chosenId) : associations[0]
  const needsChoice = !error && associations.length > 1 && !assoc
  const rule = onlineVotingRule(assoc?.state)

  return (
    <Page
      width="narrow"
      title="New ballot"
      description="Owners vote from their own sign-in. You see counts only after voting ends."
      breadcrumbs={[{ label: 'Online voting', href: '/ballots' }, { label: 'New ballot' }]}
      linkAs={Link}
    >
      {error || (!assoc && !needsChoice) ? (
        <LoadFailed what="your association" retryHref="/ballots/new" />
      ) : needsChoice ? (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h2 className="text-lg font-semibold text-foreground">Which community is this ballot for?</h2>
            <ul className="space-y-3">
              {associations.map((a) => (
                <li key={a.id}>
                  <Button asChild size="lg" variant="secondary">
                    <Link href={`/ballots/new?association=${a.id}`}>{a.name}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : !assoc ? null : rule.support === 'not_supported' ? (
        <Alert variant="warning" title="Use the paper election kit">
          {rule.summary}
        </Alert>
      ) : (
        <>
          <Alert variant="info" title="Check your rules first">
            {rule.summary}
          </Alert>
          {associations.length > 1 ? (
            <p className="text-base text-foreground-secondary">
              For <strong className="text-foreground">{assoc.name}</strong>.{' '}
              <Link href="/ballots/new" className="font-medium underline">
                Choose a different community
              </Link>
            </p>
          ) : null}
          <Card>
            <CardContent className="pt-5">
              <NewBallotForm associationId={assoc.id} timeZone={associationTimeZone(assoc)} />
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  )
}
