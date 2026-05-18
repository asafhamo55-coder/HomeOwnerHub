import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { NewTenantForm } from './NewTenantForm'

export const metadata = { title: 'New tenant' }

export default function NewTenantPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/tenants"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tenants
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Create a new tenant</h1>
        <p className="text-sm text-muted">
          Onboard a new HOA / community onto HomeownerHub. Creates the org +
          one initial association. Optionally invites the first admin so
          they get a sign-in email.
        </p>
      </header>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Tenant details</CardTitle>
        </CardHeader>
        <CardContent>
          <NewTenantForm />
        </CardContent>
      </Card>
    </div>
  )
}
