import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { ImportForm } from './ImportForm'
import { loadImportFormOptions } from './actions'

export const metadata = { title: 'Import properties & residents' }

export default async function ImportUnitsPage() {
  const { orgs, associations } = await loadImportFormOptions()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to admin
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Import properties &amp; residents</h1>
        <p className="text-sm text-muted">
          Bulk-load <code>Properties.csv</code> + <code>Residents.csv</code>{' '}
          (HomeownerHub export format) into a tenant. Properties become units;
          residents become ownerships (type=owner) or tenancies (type=tenant).
        </p>
      </header>

      <Alert variant="info" title="How idempotency works">
        <span className="block text-sm">
          Re-running is safe. A unit is matched by{' '}
          <code>(organization_id, address_line1)</code> — existing rows are
          reused, not duplicated. An ownership is matched by{' '}
          <code>(unit_id, lower(owner_email))</code>. Always run a dry-run
          first to verify counts.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Run import</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm orgs={orgs} associations={associations} />
        </CardContent>
      </Card>
    </div>
  )
}
