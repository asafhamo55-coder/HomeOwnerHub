import Link from 'next/link'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { requireBoardOrAdmin } from '@/lib/auth'
import type { LooseDb } from '@/lib/amenities/queries'
import { AmenityForm } from '../AmenityForm'

export const metadata = { title: 'Add an amenity' }
export const dynamic = 'force-dynamic'

const DESCRIPTION = 'Residents pick a day and a free time that fit your rules. Two bookings can never overlap.'
const CRUMBS = [{ label: 'Amenities', href: '/amenities' }, { label: 'Add an amenity' }]

export default async function NewAmenityPage() {
  const { org } = await requireBoardOrAdmin()
  if (!M11_APPLIED) {
    return (
      <Page width="narrow" title="Add an amenity" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <LoadFailed what="the amenity form" retryHref="/amenities" />
      </Page>
    )
  }
  const db = createAdminClient() as unknown as LooseDb
  const { data, error } = (await db
    .from('associations')
    .select('id, name')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true })
    .range(0, 99)) as { data: { id: string; name: string }[] | null; error: { code?: string } | null }
  return (
    <Page width="narrow" title="Add an amenity" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
      {error ? (
        <LoadFailed what="your communities" retryHref="/amenities/new" />
      ) : (
        <AmenityForm amenity={null} associations={(data ?? []).map((a) => ({ id: a.id, name: a.name }))} />
      )}
    </Page>
  )
}
