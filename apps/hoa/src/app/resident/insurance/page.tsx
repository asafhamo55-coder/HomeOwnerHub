import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Button, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { formatCents, POLICY_KINDS, POLICY_KIND_LABELS } from '@/lib/insurance/model'
import { ownerPolicySummaries, type OwnerPolicySummary } from '@/lib/insurance/analysis'
import { loadOwnerInsurancePolicies, type LooseDb } from '@/lib/insurance/queries'
import { IconTile, Panel, RowGroup, ScreenEmpty, ScreenHeader, Section } from '@/components/resident/screen'

export const metadata = { title: 'Insurance' }
export const dynamic = 'force-dynamic'

const SUBTITLE = 'What the association insures, with whom, and for how much.'
const ASK_ABOUT_INSURANCE = `/resident/tickets/new?${new URLSearchParams({
  subject: 'Question about the association’s insurance',
}).toString()}`

/**
 * BL-142: the owner-facing insurance summary — each policy in force: its
 * type, the insurance company, the limit and the deductible. No premiums,
 * no policy numbers, no notes: those columns are never read
 * (OWNER_INSURANCE_COLUMNS).
 *
 * insurance_policies RLS is board/admin only, so the read uses the service
 * role, confined to the signed-in member's current org (getCurrentOrg only
 * returns orgs the user belongs to; the resident layout has already sent
 * non-residents away). While impersonating, only the target's own org.
 */
export default async function ResidentInsurancePage() {
  const [org, actor] = await Promise.all([getCurrentOrg(), getResidentActor()])
  if (!org) return <NoOrgSelected href="/resident" />
  if (actor.impersonating && actor.orgId !== org.id) return <NoOrgSelected href="/resident" />

  const header = <ScreenHeader title="Insurance" subtitle={SUBTITLE} />
  const askBoard = (
    <Button asChild>
      <Link href={ASK_ABOUT_INSURANCE}>Ask the board</Link>
    </Button>
  )

  if (!M4_APPLIED) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<ShieldCheck />}
          title="Not available yet"
          description="Your board hasn’t shared the association’s insurance here yet. Ask them if you have a question."
          action={askBoard}
        />
      </div>
    )
  }

  const [rows, timeZone] = await Promise.all([
    loadOwnerInsurancePolicies(createAdminClient() as unknown as LooseDb, org.id),
    currentTimeZone(),
  ])
  if (rows === null) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="the association’s insurance" retryHref="/resident/insurance" />
      </div>
    )
  }

  const policies = ownerPolicySummaries(rows, todayIn(timeZone), POLICY_KINDS)

  return (
    <div className="space-y-6">
      {header}
      {policies.length === 0 ? (
        <ScreenEmpty
          icon={<ShieldCheck />}
          title="No policies shared yet"
          description="Your board hasn’t recorded the association’s insurance here yet. Ask them if you have a question."
          action={askBoard}
        />
      ) : (
        <Section label="Policies in force" aside={<span className="num text-xs text-muted">{policies.length}</span>}>
          <RowGroup>
            {policies.map((p) => (
              <PolicyRow key={p.id} p={p} />
            ))}
          </RowGroup>
        </Section>
      )}

      <Panel className="space-y-3">
        <p className="text-sm text-foreground-secondary">
          The association’s policies cover what the association owns or is responsible for under your governing
          documents. They usually don’t cover the inside of your home or your belongings: ask your own insurance agent
          what your policy should cover.
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link href={ASK_ABOUT_INSURANCE}>Ask the board</Link>
        </Button>
      </Panel>
    </div>
  )
}

function PolicyRow({ p }: { p: OwnerPolicySummary }) {
  return (
    <div className="flex min-h-16 items-start gap-3 bg-surface px-4 py-3">
      <IconTile icon={<ShieldCheck />} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{POLICY_KIND_LABELS[p.kind]}</p>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">{p.carrier || 'Insurance company not recorded'}</p>
        <dl className="grid grid-cols-2 gap-x-4 text-xs">
          <div>
            <dt className="text-muted">Limit</dt>
            <dd className="num text-foreground">{formatCents(p.coverageLimitCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Deductible</dt>
            <dd className="num text-foreground">{formatCents(p.deductibleCents)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
