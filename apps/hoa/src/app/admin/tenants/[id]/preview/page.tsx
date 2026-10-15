import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Briefcase } from 'lucide-react'
import { Alert, Badge, Button, Page } from '@homeowner-portal/ui'
import { getTenantPreview } from '@/lib/platform-admin'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { ActivityBar } from '@/components/dashboard/ActivityBar'
import type { DonutSegment } from '@/lib/dashboard/charts'
import { TenantStatusPill, planLabel } from '../../../_components/tenant-status'

export const metadata = { title: 'Tenant preview' }

// Read-only preview of a tenant's dashboard. The data comes from
// getTenantPreview() which uses the service-role client (cross-tenant
// access requires platform-admin gating, enforced inside that helper).
// Every visit emits a platform_admin_audit row of type 'tenant.preview'.

export default async function TenantPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const preview = await getTenantPreview(id)
  if (!preview) notFound()

  return (
    <Page
      width="wide"
      linkAs={Link}
      breadcrumbs={[
        { label: 'Tenants', href: '/admin/tenants' },
        { label: preview.org.name, href: `/admin/tenants/${preview.org.id}` },
        { label: 'Preview' },
      ]}
      title={`${preview.org.name} — preview`}
      meta={<TenantStatusPill tenant={preview.org} />}
      description={<Badge variant="neutral">{planLabel(preview.org.plan)} plan</Badge>}
      actions={
        <Button asChild variant="secondary">
          <Link href={`/admin/tenants/${preview.org.id}`} className="no-underline">
            Exit preview
          </Link>
        </Button>
      }
    >
      <Alert variant="warning" title="Read-only platform preview">
        You’re seeing this tenant’s dashboard data as a platform admin. Nothing here writes to the tenant, and
        every visit is recorded in the platform audit log.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusDonut
          title="Violations by status"
          icon={<AlertTriangle className="size-4 text-muted" aria-hidden />}
          segments={preview.violations_donut.segments as DonutSegment[]}
          total={preview.violations_donut.total}
          emptyTitle="No violations on file"
          emptyDescription="This tenant has no violations recorded yet."
        />
        <StatusDonut
          title="Vendor compliance"
          icon={<Briefcase className="size-4 text-muted" aria-hidden />}
          segments={preview.vendor_compliance_donut.segments as DonutSegment[]}
          total={preview.vendor_compliance_donut.total}
          emptyTitle="No vendors graded"
          emptyDescription="This tenant has no vendor compliance reviews."
        />
      </div>

      <ActivityBar buckets={preview.activity_30d} />
    </Page>
  )
}
