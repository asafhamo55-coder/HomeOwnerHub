import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { NewTenantForm } from './NewTenantForm'

export const metadata = { title: 'New tenant' }

export default function NewTenantPage() {
  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[{ label: 'Tenants', href: '/admin/tenants' }, { label: 'New tenant' }]}
      title="Create a tenant"
      description="Onboard an HOA or community: creates the organization and its first association, and can invite the first admin."
    >
      <NewTenantForm />
    </Page>
  )
}
