import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { unitIdsForProperties } from '@/lib/properties/resolve'
import { inspectHomes, type InspectHomes } from '@/lib/inspect/homes'
import { InspectMode } from './InspectMode'

// BL-028 — mobile inspection mode. A board member walking or driving the
// community picks a home, takes photos, picks what's wrong and saves; each
// save becomes a W3 violation DRAFT through the existing draft route, so it
// lands in /approvals and /violations/approval-queue. Nothing is filed
// until the board approves it there.

export const metadata = { title: 'Inspect homes' }
export const dynamic = 'force-dynamic'

export default async function InspectPage() {
  // Board-only. The (dashboard) layout already sends residents to
  // /resident; this answers 404 to anyone else who is not board or admin
  // rather than rendering a screen whose saves would all be refused.
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) notFound()

  const loaded = await loadHomes(gate.orgId)

  return (
    <Page
      width="narrow"
      title="Inspect homes"
      description="Pick a home, take photos, say what's wrong, save. Each home becomes a draft letter for the board to review. Nothing is sent to the owner."
      breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: 'Inspect' }]}
      linkAs={Link}
    >
      {loaded ? (
        <InspectMode orgId={gate.orgId} homes={loaded.homes} unlinked={loaded.unlinked} />
      ) : (
        <LoadFailed what="your homes" hint="You need the list of homes to start an inspection." />
      )}
    </Page>
  )
}

/** Same list as the violation wizard (archived homes excluded), keyed by unit. null = the read failed. */
async function loadHomes(orgId: string): Promise<InspectHomes | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('hoa_properties')
    .select('id, address, unit_number')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('address', { ascending: true })
  if (error) {
    console.error('inspect: property read failed', { orgId, code: error.code })
    return null
  }
  const properties = (data ?? []) as Array<{ id: string; address: string; unit_number: string | null }>
  try {
    const units = await unitIdsForProperties(supabase, orgId, properties.map((p) => p.id))
    return inspectHomes(properties, units)
  } catch {
    // unitIdsForProperties logs the failure (org id and message only).
    return null
  }
}
