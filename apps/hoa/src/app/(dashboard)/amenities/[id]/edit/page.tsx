import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { requireBoardOrAdmin } from '@/lib/auth'
import { loadAmenities, type LooseDb } from '@/lib/amenities/queries'
import { AmenityForm } from '../../AmenityForm'

export const metadata = { title: 'Edit amenity' }
export const dynamic = 'force-dynamic'

const DESCRIPTION = 'Changes apply to new bookings. You choose what happens to bookings the change would break.'

export default async function EditAmenityPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireBoardOrAdmin()
  const { id } = await params
  if (!M11_APPLIED) notFound()
  const db = createAdminClient() as unknown as LooseDb
  // loadAmenities filters by the caller's organization, so another
  // organization's amenity id is simply not found.
  const all = await loadAmenities(db, org.id)
  if (all === null) {
    return (
      <Page width="narrow" title="Edit amenity" description={DESCRIPTION} breadcrumbs={[{ label: 'Amenities', href: '/amenities' }, { label: 'Edit' }]} linkAs={Link}>
        <LoadFailed what="this amenity" retryHref={`/amenities/${id}/edit`} />
      </Page>
    )
  }
  const amenity = all.find((a) => a.id === id && !a.retiredAt)
  if (!amenity) notFound()
  return (
    <Page
      width="narrow"
      title={`Edit ${amenity.name}`}
      description={DESCRIPTION}
      breadcrumbs={[{ label: 'Amenities', href: '/amenities' }, { label: amenity.name }, { label: 'Edit' }]}
      linkAs={Link}
    >
      <AmenityForm amenity={amenity} />
    </Page>
  )
}
