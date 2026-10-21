import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { coverageCheck, policyReminders, type InsurancePolicy } from '@/lib/insurance/model'
import { loadInsuranceDocumentOptions, loadInsurancePolicies, type LooseDb } from '@/lib/insurance/queries'
import { fidelityAdequacy, renewalComparisons, type FidelityAdequacy } from '@/lib/insurance/analysis'
import { isActive } from '@/lib/insurance/model'
import { loadHeldFunds } from '@/lib/insurance/held-funds'
import { CoverageCheckPanel } from './CoverageCheckPanel'
import { FidelityPanel, RenewalPanel } from './RenewalPanel'
import { PolicyList } from './PolicyList'

export const metadata = { title: 'Insurance' }
export const dynamic = 'force-dynamic'

// BL-132: the association's insurance policies and fidelity bond, the
// expiry countdown, and what the loaded statute text says about coverage.
// Board or admin only: requireBoardOrAdmin redirects residents before any
// read. With M4_APPLIED off (migration 0068 not yet applied) the page says
// so and reads nothing.
//
// BL-142 adds the renewal comparison (each renewed policy against its
// previous term, matched by kind + carrier + adjacent dates since there is
// no link column) and the fidelity bond against today's reserve balance
// plus operating cash, read only for associations with a bond in force.

const DESCRIPTION =
  'The association’s insurance policies and fidelity bond: who insures you, for how much, and when each policy ends. The board gets a reminder 90, 60 and 30 days before a policy expires.'

export default async function InsurancePage() {
  const { org } = await requireBoardOrAdmin()

  if (!M4_APPLIED) {
    return (
      <Page title="Insurance" description={DESCRIPTION} linkAs={Link}>
        <EmptyState
          icon={<ShieldCheck aria-hidden />}
          title="Insurance tracking is almost ready"
          description="It turns on after a database update. Until then, keep your policies in Documents."
          action={
            <Button asChild variant="secondary">
              <Link href="/documents">Open Documents</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const [supabase, timeZone] = await Promise.all([getSupabaseServerClient(), currentTimeZone()])
  const db = supabase as unknown as LooseDb
  const [policies, documents, assocRes] = await Promise.all([
    loadInsurancePolicies(db, org.id),
    loadInsuranceDocumentOptions(db, org.id),
    loadOrFail('associations', supabase.from('associations').select('id, name, state').eq('organization_id', org.id).order('name')),
  ])

  if (policies === null || !assocRes.ok) {
    return (
      <Page title="Insurance" description={DESCRIPTION} linkAs={Link}>
        <LoadFailed what={policies === null ? 'your insurance policies' : 'your association'} retryHref="/insurance" />
      </Page>
    )
  }

  const today = todayIn(timeZone)
  const associations = ((assocRes.data ?? []) as Array<{ id: string; name: string | null; state: string | null }>).map((a) => ({
    id: a.id,
    name: a.name?.trim() || 'Your association',
    state: a.state,
  }))
  const reminders = policyReminders(policies, today)
  // One coverage check per association, over its own policies plus any not
  // tied to an association.
  const checks = (associations.length > 0 ? associations : [{ id: null, name: 'Your association', state: null }]).map((a) => {
    const own: InsurancePolicy[] = policies.filter((p) => p.associationId === null || p.associationId === a.id)
    return { associationId: a.id, associationName: a.name, check: coverageCheck(a.state, own, today) }
  })
  const renewals = renewalComparisons(policies, today)
  const fidelityRows = await Promise.all(
    associations
      .filter((a) =>
        policies.some((p) => p.kind === 'fidelity' && (p.associationId === null || p.associationId === a.id) && isActive(p, today)),
      )
      .map(async (a) => {
        const own = policies.filter((p) => p.associationId === null || p.associationId === a.id)
        const held = await tryLoad('fidelity held funds', () => loadHeldFunds(supabase, a.id, today))
        const result: { ok: true; data: FidelityAdequacy } | { ok: false } = held.ok
          ? (() => {
              const f = fidelityAdequacy({ state: a.state, policies: own, today, ...held.data })
              return f ? { ok: true as const, data: f } : { ok: false as const }
            })()
          : { ok: false }
        return { associationId: a.id, associationName: associations.length > 1 ? a.name : null, result }
      }),
  )

  return (
    <Page title="Insurance" description={DESCRIPTION} linkAs={Link}>
      <PolicyList
        policies={policies}
        reminders={reminders}
        today={today}
        associations={associations.map(({ id, name }) => ({ id, name }))}
        documents={documents ?? []}
        documentsFailed={documents === null}
      />
      <RenewalPanel comparisons={renewals} />
      <FidelityPanel rows={fidelityRows} />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Coverage check</CardTitle>
          <CardDescription>What your state’s law, as loaded in HomeownerHub, says about the policies on record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {checks.map((c) => (
            <CoverageCheckPanel
              key={c.associationId ?? 'org'}
              check={c.check}
              associationName={checks.length > 1 ? c.associationName : null}
            />
          ))}
        </CardContent>
      </Card>
    </Page>
  )
}
