import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { PropertyForm } from './PropertyForm'

export const metadata = { title: 'Add property' }

export default function NewPropertyPage() {
  return (
    <Page
      width="narrow"
      title="Add a property"
      description="Only the address is required. Residents, tenure and dues can be added from the property afterwards."
      breadcrumbs={[{ label: 'Properties', href: '/properties' }, { label: 'Add property' }]}
      linkAs={Link}
    >
      <PropertyForm />
    </Page>
  )
}
