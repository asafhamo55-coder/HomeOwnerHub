import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
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
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/admin/tenants/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {t.org.name}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Edit tenant</h1>
        <p className="text-sm text-muted">
          Change is logged in the platform audit log.
        </p>
      </header>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t.org.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditTenantForm
            orgId={t.org.id}
            initialName={t.org.name}
            initialPlan={t.org.plan}
            initialDoorsCount={t.org.doors_count}
          />
        </CardContent>
      </Card>
    </div>
  )
}
