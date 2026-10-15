import Link from 'next/link'
import { Alert, Page } from '@homeowner-portal/ui'
import { NewVendorForm } from './NewVendorForm'

export const metadata = { title: 'New vendor' }

export default function NewVendorPage() {
  return (
    <Page
      width="narrow"
      title="Add a vendor"
      description="Create the vendor record, then collect insurance, W-9 and license documents."
      breadcrumbs={[{ label: 'Vendors', href: '/vendors' }, { label: 'Add a vendor' }]}
      linkAs={Link}
    >
      <Alert variant="info" title="Private to your association">
        Vendor profiles and ratings are visible only to your organization and are never shared with
        other communities on the platform.
      </Alert>
      <NewVendorForm />
    </Page>
  )
}
