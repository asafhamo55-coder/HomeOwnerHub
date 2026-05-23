import { notFound } from 'next/navigation'
import { BackLink, PageHeader } from '@homeowner-portal/ui'
import { getVendor } from '@/lib/vendors'
import { EditVendorForm } from './EditVendorForm'

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vendor = await getVendor(id)
  if (!vendor) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href={`/vendors/${id}`} label="Back to vendor" />
      <PageHeader title={`Edit ${vendor.legal_name}`} />
      <EditVendorForm
        vendorId={vendor.id}
        defaultValues={{
          legalName: vendor.legal_name,
          dba: vendor.dba ?? '',
          primaryEmail: vendor.primary_email ?? '',
          primaryPhone: vendor.primary_phone ?? '',
          trades: (vendor.trades ?? []).join(', '),
          notes: vendor.notes ?? '',
        }}
      />
    </div>
  )
}
