import { Wallet } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { getResidentUnits } from '@/lib/resident'

export const metadata = { title: 'My Dues' }

export default async function ResidentDuesPage() {
  const units = await getResidentUnits()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="My Dues"
        description={`Current balance and payment history for your unit${units.length === 1 ? '' : 's'}.`}
      />
      {/* TODO: wire in real dues data via getResidentDues() — filter assessments
          + ledger entries by user → owners → units. Until then this page shows
          the linked units and an informational Alert. */}

      {units.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No unit linked to your account"
          description="Once your HOA admin links you to a unit, dues information will appear here."
        />
      ) : (
        <>
          <Alert variant="info" title="Dues data is being wired in">
            <span className="block text-sm">
              Your unit is linked, but the dues integration is currently
              being completed by your association. Check back soon, or
              contact your manager for a current statement.
            </span>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your unit{units.length === 1 ? '' : 's'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {units.map((u) => (
                  <li key={u.unit_id} className="rounded-md border border-border bg-foreground/5 px-3 py-2 text-sm">
                    <p className="font-medium">{u.unit_number ?? u.address ?? 'Your unit'}</p>
                    {u.unit_number && u.address ? (
                      <p className="text-xs text-muted">{u.address}</p>
                    ) : null}
                    {u.association_name ? (
                      <p className="text-xs text-muted">{u.association_name}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
