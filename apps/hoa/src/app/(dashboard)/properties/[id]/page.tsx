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
import { parsePropertyListParams, propertyListQuery } from '@/lib/properties/list-params'
import { parseSection } from '@/lib/properties/sections'
import { PropertyDetailView } from './PropertyDetailView'

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
  return (
    <PropertyDetailView
      data={loaded.data}
      now={new Date()}
      today={today}
      isAdmin={ctx.role === 'admin'}
      capInPlace={assocInfo.cap?.capPct !== null && assocInfo.cap?.capPct !== undefined}
      section={parseSection(one('tab'))}
      listHref={listHref}
      listQuery={query}
    />
  )
}

