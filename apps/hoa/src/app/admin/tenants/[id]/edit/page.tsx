import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, Page } from '@homeowner-portal/ui'
import { getTenantDetail } from '@/lib/platform-admin'
import { EditTenantForm } from './EditTenantForm'

export const metadata = { title: 'Edit tenant' }

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTenantDetail(id)
  if (!t) notFound()

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[
        { label: 'Tenants', href: '/admin/tenants' },
        { label: t.org.name, href: `/admin/tenants/${t.org.id}` },
        { label: 'Edit' },
      ]}
      title="Edit tenant"
      description="Changes are written to the platform audit log."
    >
      <Card>
        <EditTenantForm
          orgId={t.org.id}
          initialName={t.org.name}
          initialPlan={t.org.plan}
          initialDoorsCount={t.org.doors_count}
        />
      </Card>
    </Page>
  )
}
