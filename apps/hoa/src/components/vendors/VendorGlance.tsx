import Link from 'next/link'
import { Card, CardContent, StatusPill } from '@homeowner-portal/ui'
import { shortDate } from '@/components/vendors/format'
import type { Glance } from '@/components/vendors/glance'

function Stat({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span className="num text-lg font-semibold text-foreground">{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </>
  )
  const cls = 'flex min-w-0 flex-col gap-0.5'
  return href ? (
    <Link href={href} className={`${cls} rounded-md hover:underline`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** View only. Sends nothing; every link goes to an existing list. */
export function VendorGlance({ glance, bidsAvailable }: { glance: Glance; bidsAvailable: boolean }) {
  return (
    <Card aria-label="Vendor at a glance">
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-xs text-muted">Insurance</span>
            <StatusPill tone={glance.coiTone} label={glance.coiLabel} />
          </div>
          <Stat
            label="Days to expiry"
            value={glance.daysToExpiry === null ? 'None' : String(glance.daysToExpiry)}
            hint={glance.daysLabel}
          />
          <Stat
            label="Open bids"
            value={bidsAvailable ? String(glance.openBids) : 'Unavailable'}
            href="/rfps"
            hint={bidsAvailable && glance.openBids === 0 ? 'No bids in progress' : undefined}
          />
          <Stat
            label="Open RFPs"
            value={bidsAvailable ? String(glance.openRfps) : 'Unavailable'}
            href="/rfps"
            hint={bidsAvailable && glance.openRfps === 0 ? 'Not on any open RFP' : undefined}
          />
          <Stat label="Last activity" value={shortDate(glance.lastActivity) ?? 'None yet'} />
        </div>
      </CardContent>
    </Card>
  )
}
