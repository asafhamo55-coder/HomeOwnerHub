import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentUserRole } from '@/lib/auth'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getLeaseCap } from '@/lib/leases'
import { DEFAULT_ASSOCIATION_TIME_ZONE, todayIn } from '@/lib/association-time'
import { resolvePropertyUrl } from '@/lib/properties/canonical'
import { asPropertyId } from '@/lib/properties/resolve'
import { loadProperty360 } from '@/lib/properties/property-360'
import { loadPlanStandings } from '@/lib/accounting/plan-standings'
import { tryLoad } from '@/lib/load-or-fail'
import { parsePropertyListParams, propertyListQuery } from '@/lib/properties/list-params'
import { parseSection } from '@/lib/properties/sections'
import { PropertyDetailView } from './PropertyDetailView'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { loadEmailConsent } from '@/lib/email-consent'

export const metadata = { title: 'Property' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One home, everything about it. A full page rather than the old panel
 * beside the list: the 360 needs the width (sections side by side, an
 * anchor nav), and dropping the list aside means opening a home no longer
 * re-reads the whole roster. The list's state rides in the query string,
 * so "Properties" goes back to the exact view it came from.
 *
 * Round trips (BL-074): the URL check and both of the loader's waves run
 * against the same id at once — the loader is started optimistically and
 * its result is simply unused when the id turns out to be a unit's (a
 * redirect). Lease cap and the association's day run alongside.
 */
export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id: rawId }, sp, supabase, ctx] = await Promise.all([params, searchParams, getSupabaseServerClient(), getCurrentUserRole()])
  if (!ctx) notFound()

  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const listParams = parsePropertyListParams({ filter: one('filter'), sort: one('sort'), dir: one('dir'), q: one('q'), page: one('page') })
  const incoming = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'))

  const [target, loaded, assocInfo] = await Promise.all([
    resolvePropertyUrl(supabase, ctx.org.id, rawId, incoming),
    // Not for a malformed id: resolvePropertyUrl 404s it, and the reads would only error.
    UUID.test(rawId) ? loadProperty360(supabase, { orgId: ctx.org.id, propertyId: asPropertyId(rawId) }) : Promise.resolve({ kind: 'not_found' } as const),
    getPrimaryAssociation().then(async (assoc) => ({ assoc, cap: assoc ? await getLeaseCap(assoc.id) : null })),
  ])
  if (target.kind === 'redirect') redirect(target.href)
  if (target.kind === 'not_found' || loaded.kind === 'not_found') notFound()

  const query = propertyListQuery(listParams)
  const listHref = query ? `/properties?${query}` : '/properties'

  if (loaded.kind === 'failed') {
    return (
      <Page width="wide" title="Property" back={{ href: listHref, label: 'Properties' }} linkAs={Link}>
        <LoadFailed what="this property" />
      </Page>
    )
  }

  const today = todayIn(assocInfo.assoc?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE)

  // BL-080: "Behind on plan" / "Completed <day>" for the listed plans.
  const plans = loaded.data.plans?.ok ? loaded.data.plans.data : []
  const assoc = assocInfo.assoc
  const standingPlans = plans.filter((p): p is typeof p & { unit_id: string } => typeof p.unit_id === 'string')
  const standings =
    assoc && standingPlans.some((p) => p.status === 'active' || p.status === 'completed')
      ? await tryLoad('payment plan progress', () =>
          loadPlanStandings(supabase, { organizationId: ctx.org.id, associationId: assoc.id }, standingPlans, today),
        )
      : null
  // BL-020 (M1): owners' consent to official notices by email — board only,
  // and not read at all until M1_APPLIED.
  const canManage = ctx.role === 'admin' || ctx.role === 'board'
  const consentRes = M1_APPLIED && canManage ? await loadEmailConsent(supabase, ctx.org.id) : null
  const consent = !consentRes ? undefined : !consentRes.ok ? ('failed' as const) : consentRes.available ? consentRes.consent : undefined
  const data = standings ? { ...loaded.data, planStandings: standings.ok ? { ok: true as const, data: standings.data } : { ok: false as const } } : loaded.data

  return (
    <PropertyDetailView
      data={data}
      now={new Date()}
      today={today}
      isAdmin={ctx.role === 'admin'}
      canManage={canManage}
      {...(consent !== undefined ? { consent } : {})}
      capInPlace={assocInfo.cap?.capPct !== null && assocInfo.cap?.capPct !== undefined}
      section={parseSection(one('tab'))}
      listHref={listHref}
      listQuery={query}
    />
  )
}

