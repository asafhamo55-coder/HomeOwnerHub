import Link from 'next/link'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { reserveFunds } from '@/lib/accounting/reserves'
import type { Fund } from '@/lib/accounting/queries'
import { OpenBooksForm } from '../../_components/OpenBooksForm'

const FUND_TYPE_LABEL: Record<string, string> = {
  operating: 'Operating',
  reserve: 'Reserve',
  special_assessment: 'Special assessment',
  capex: 'Capital projects',
}

/**
 * The association's funds, anchored at #funds — where the dashboard's and
 * the board report's "Set up a reserve fund" lead (BL-120). Without an
 * active reserve fund an admin gets "Open the books", which adds the
 * missing Reserve fund (and only what is missing); a board member is sent
 * to the admins.
 */
export function FundsCard({ funds, isAdmin }: { funds: Fund[]; isAdmin: boolean }) {
  const hasReserve = reserveFunds(funds).length > 0
  return (
    <Card id="funds" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2">Funds</CardTitle>
        <CardDescription>Each account belongs to a fund, so reserve money stays apart from day-to-day operating money.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {funds.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {funds.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium text-foreground">{f.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{FUND_TYPE_LABEL[f.fund_type] ?? f.fund_type}</span>
                  {f.is_active ? null : <StatusPill tone="neutral" label="Inactive" size="sm" />}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {hasReserve ? null : (
          <Alert
            variant="info"
            title="Set up a reserve fund"
            actions={
              isAdmin ? (
                <OpenBooksForm returnTo="/accounting/coa#funds" variant="secondary" />
              ) : (
                <Button asChild variant="secondary">
                  <Link href="/settings/members">See your HOA’s admins</Link>
                </Button>
              )
            }
          >
            {isAdmin
              ? 'There’s no reserve fund yet, so the dashboard and the monthly board report can’t show reserves. Opening the books adds a Reserve fund and its accounts, and never changes what is already there.'
              : 'There’s no reserve fund yet, so the dashboard and the monthly board report can’t show reserves. Only an admin of your HOA can add it — ask one to open this page.'}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
