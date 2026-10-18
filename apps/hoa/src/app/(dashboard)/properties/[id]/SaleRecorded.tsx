'use client'

import { Alert } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import type { RecordSaleResult } from '@/lib/properties/sale-actions'
import { InviteToPortalButton } from './InviteToPortalButton'

type Done = Extract<RecordSaleResult, { ok: true }>['data']

/**
 * What the board sees after "Record a sale": what changed, then each buyer
 * with "Invite to portal" (nothing was sent by recording the sale), and a
 * nudge to set tenure when it was reset.
 */
export function SaleRecorded({ propertyId, settlementDate, done }: { propertyId: string; settlementDate: string; done: Done }) {
  const invitable = done.buyers.filter((b) => b.email)
  return (
    <div className="space-y-4">
      <Alert variant="success" title={`Sale recorded, settled ${formatDay(settlementDate)}`}>
        The previous owners’ portal access to this home has ended
        {done.movedOut > 0 ? `, and ${done.movedOut} ${done.movedOut === 1 ? 'person' : 'people'} moved out of the household list` : ''}
        {done.leasesEnded > 0 ? `; ${done.leasesEnded} ${done.leasesEnded === 1 ? 'lease' : 'leases'} ended` : ''}. The balance stayed with the home.
      </Alert>

      <section aria-labelledby="sale-invite" className="space-y-2">
        <h3 id="sale-invite" className="text-sm font-medium text-foreground">
          Invite the new {done.buyers.length === 1 ? 'owner' : 'owners'}
        </h3>
        {invitable.length === 0 ? (
          <p className="text-sm text-muted">No buyer has an email on file, so there’s no one to invite yet. Add an email from the People section later.</p>
        ) : (
          <>
            <p className="text-xs text-muted">No email has been sent. Each invite goes out only when you click it.</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {done.buyers.map((b, i) => (
                <li key={i} className="flex flex-col gap-2 px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{b.name}</p>
                    <p className="truncate text-xs text-muted">{b.email ?? 'No email on file'}</p>
                  </div>
                  {b.email ? <InviteToPortalButton propertyId={propertyId} name={b.name} email={b.email} /> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {done.tenureReset ? (
        <Alert variant="info" title="Set how the home is used">
          Tenure is now “Unknown”. Once you know whether the new owner lives there or rents it out, set it under Leases → Tenure on
          this page.
        </Alert>
      ) : null}
    </div>
  )
}
