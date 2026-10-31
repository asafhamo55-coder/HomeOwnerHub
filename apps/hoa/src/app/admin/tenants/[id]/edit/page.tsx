import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, LoadFailed, Page } from '@homeowner-portal/ui'
import { getTenantDetail } from '@/lib/platform-admin'
import { EditTenantForm } from './EditTenantForm'

export const metadata = { title: 'Edit tenant' }

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const res = await getTenantDetail(id)
  if (!res.ok) {
    if (res.reason === 'not_found') notFound()
    return (
      <Page width="narrow" title="Edit tenant">
        <LoadFailed what="this tenant" retryHref={`/admin/tenants/${id}/edit`} />
      </Page>
    )
  }
  const t = res.data

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
