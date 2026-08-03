import Link from 'next/link'
import type { ThreadDetail } from '@/lib/inbox/queries'
import { AssignVendorForm, UnassignVendorButton } from './AssignVendorForm'

export interface RailVendor {
  vendorId: string
  legalName: string
  trades: string[] | null
  status: string
  incomplete: boolean
}

/**
 * Rendered independently of PropertyRail, not nested inside it.
 *
 * A thread can be filed under a vendor whether or not it has a property —
 * the landscaper writing about 907 Urban Ash is both — and PropertyRail
 * early-returns on `thread.unitId`. Nesting this inside those branches
 * would make an unfiled thread unable to receive a vendor at all.
 */
export function VendorRail({
  thread,
  vendor,
  senderEmail,
  senderName,
}: {
  thread: ThreadDetail
  vendor: RailVendor | null
  senderEmail: string | null
  senderName: string | null
}) {
  if (thread.vendorId && vendor) {
    return (
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Vendor</p>
        <p className="font-semibold text-foreground">{vendor.legalName}</p>
        <p className="text-xs text-muted">
          {vendor.trades?.join(' · ') || 'No trades on file'} · {vendor.status}
        </p>
        {vendor.incomplete ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Setup incomplete — this vendor still needs an EIN and a trade before
            it can be used for 1099s, RFPs, or compliance checks.
          </p>
        ) : null}
        <Link href={`/vendors/${vendor.vendorId}`} className="block text-xs underline">
          Open vendor →
        </Link>
        <UnassignVendorButton threadId={thread.id} />
      </div>
    )
  }

  // vendorId is set but the vendor row is gone (deleted between the two
  // reads, or a dangling reference). Say so rather than silently showing the
  // assign form, which would misrepresent a filed thread as unfiled — the
  // same distinction PropertyRail draws for a missing property record.
  if (thread.vendorId && !vendor) {
    return (
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Vendor</p>
        <p className="text-xs text-muted">
          Filed under a vendor that no longer exists. Re-file it below.
        </p>
        <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t border-border p-3">
      <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
    </div>
  )
}
