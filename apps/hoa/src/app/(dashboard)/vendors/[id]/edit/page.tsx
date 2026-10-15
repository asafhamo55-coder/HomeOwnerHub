import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Page } from '@homeowner-portal/ui'
import { getVendor } from '@/lib/vendors'
import { EditVendorForm } from './EditVendorForm'

export const metadata = { title: 'Edit vendor' }

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vendor = await getVendor(id)
  if (!vendor) notFound()

  return (
    <Page
      width="narrow"
      title="Edit vendor"
      description={vendor.legal_name}
      breadcrumbs={[
        { label: 'Vendors', href: '/vendors' },
        { label: vendor.legal_name, href: `/vendors/${id}` },
        { label: 'Edit' },
      ]}
      linkAs={Link}
    >
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
    </Page>
  )
}
