import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Briefcase, Shield } from 'lucide-react'
import { Alert, Badge, Button } from '@homeowner-portal/ui'
import { getTenantPreview } from '@/lib/platform-admin'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { ActivityBar } from '@/components/dashboard/ActivityBar'
import type { DonutSegment } from '@/lib/dashboard/charts'

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
    <div className="mx-auto max-w-6xl space-y-6">
      <Alert variant="warning" title="Platform admin preview — read-only">
        <span className="block text-sm">
          <Shield className="mr-1 inline h-3.5 w-3.5" />
          You're viewing <strong>{preview.org.name}</strong> as a platform admin.
          This is a read-only snapshot — no actions on this page write data into
          the tenant. Every visit is logged to the platform audit log.
        </span>
      </Alert>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/tenants/${preview.org.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to tenant detail
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{preview.org.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" size="sm" className="capitalize">{preview.org.plan}</Badge>
            {preview.org.suspended_at ? (
              <Badge variant="destructive" size="sm">Suspended</Badge>
            ) : (
              <Badge variant="success" size="sm">Active</Badge>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tenants">Exit preview</Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusDonut
          title="Violations by status"
          icon={<AlertTriangle className="h-4 w-4 text-muted" />}
          segments={preview.violations_donut.segments as DonutSegment[]}
          total={preview.violations_donut.total}
          emptyTitle="No violations on file"
          emptyDescription="This tenant has no violations recorded yet."
        />
        <StatusDonut
          title="Vendor compliance"
          icon={<Briefcase className="h-4 w-4 text-muted" />}
          segments={preview.vendor_compliance_donut.segments as DonutSegment[]}
          total={preview.vendor_compliance_donut.total}
          emptyTitle="No vendors graded"
          emptyDescription="This tenant has no vendor compliance reviews."
        />
      </div>

      <ActivityBar buckets={preview.activity_30d} />
    </div>
  )
}
