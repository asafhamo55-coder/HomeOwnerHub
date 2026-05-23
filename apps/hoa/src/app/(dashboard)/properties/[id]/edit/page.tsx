import { notFound } from 'next/navigation'
import { BackLink, PageHeader } from '@homeowner-portal/ui'
import { getPropertyDetail } from '@/lib/properties'
import { EditPropertyForm } from './EditPropertyForm'

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
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href={`/properties/${id}`} label="Back to property" />
      <PageHeader title="Edit property" />
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
    </div>
  )
}
