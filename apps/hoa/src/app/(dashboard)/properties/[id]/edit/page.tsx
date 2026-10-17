import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Page } from '@homeowner-portal/ui'
import { getPropertyDetail } from '@/lib/properties'
import { EditPropertyForm } from './EditPropertyForm'

export const metadata = { title: 'Edit property' }

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getPropertyDetail(id)
  if (!detail) notFound()
  const p = detail.property

  return (
    <Page
      width="narrow"
      title="Edit property"
      description="Changes apply to the property record. Residents and tenure are managed on the property itself."
      breadcrumbs={[
        { label: 'Properties', href: '/properties' },
        { label: p.address, href: propertyHref(asPropertyId(id)) },
        { label: 'Edit' },
      ]}
      linkAs={Link}
    >
      <EditPropertyForm
        propertyId={p.id}
        defaultValues={{
          address: p.address,
          unitNumber: p.unit_number ?? '',
          ownerName: p.owner_name ?? '',
          ownerEmail: p.owner_email ?? '',
          ownerPhone: p.owner_phone ?? '',
          notes: p.notes ?? '',
        }}
      />
    </Page>
  )
}
