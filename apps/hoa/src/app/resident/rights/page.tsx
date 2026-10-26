import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Button, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { GA_OWNER_RIGHTS_TAKES_EFFECT, gaOwnerRightsInForce } from '@/lib/owner-rights/law'
import { loadResidentRightsScope } from '@/lib/owner-rights/load'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { OwnerRightsView } from './OwnerRightsView'

export const metadata = { title: 'Your rights as an owner' }
export const dynamic = 'force-dynamic'

/**
 * BL-164: Georgia owners' rights, O.C.G.A. § 43-17A-7, for owners of a
 * Georgia association. Before 2027-01-01 it is a preview that says the law
 * "takes effect Jan 1, 2027". The resident layout has already sent
 * non-residents away; nothing here writes or sends anything.
 */
export default async function OwnerRightsPage() {
  const [org, actor] = await Promise.all([getCurrentOrg(), getResidentActor()])
  if (!org) return <NoOrgSelected href="/resident" />
  if (actor.impersonating && actor.orgId !== org.id) return <NoOrgSelected href="/resident" />

  const scope = await loadResidentRightsScope(org.id)
  const subtitle =
    scope.ok && scope.georgia
      ? gaOwnerRightsInForce(scope.today)
        ? 'Georgia law, in force since Jan 1, 2027.'
        : `Georgia law. It ${GA_OWNER_RIGHTS_TAKES_EFFECT}.`
      : 'What the law gives you as an owner.'
  const header = <ScreenHeader back={{ href: '/resident/documents', label: 'Documents' }} title="Your rights as an owner" subtitle={subtitle} />

  if (!scope.ok) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="your association’s details" retryHref="/resident/rights" />
      </div>
    )
  }

  if (!scope.georgia) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<Scale />}
          title="Not available for your association"
          description="This page lists the rights Georgia law gives owners. Your association isn’t recorded as a Georgia one, so your governing documents and your state’s law apply."
          action={
            <Button asChild variant="secondary">
              <Link href="/resident/documents">Governing documents</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <OwnerRightsView today={scope.today} recordsLive={RECORDS_REQUESTS_LIVE} />
    </div>
  )
}
