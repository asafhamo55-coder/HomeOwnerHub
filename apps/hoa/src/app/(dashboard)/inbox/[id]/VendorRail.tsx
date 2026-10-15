import Link from 'next/link'
import { ArrowRight, Briefcase } from 'lucide-react'
import { Alert, StatusBadge } from '@homeowner-portal/ui'
import type { ThreadDetail } from '@/lib/inbox/queries'
import { AssignVendorForm, UnassignVendorButton } from './AssignVendorForm'
import { RailLabel } from './PropertyRail'

export interface RailVendor {
  vendorId: string
  legalName: string
  trades: string[] | null
  status: string
  incomplete: boolean
}

const VENDOR_TONES = { active: 'success', prospect: 'info', inactive: 'neutral', blacklisted: 'danger' } as const

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
  loadFailed = false,
  senderEmail,
  senderName,
}: {
  thread: ThreadDetail
  vendor: RailVendor | null
  /** The vendor read failed — not the same as the vendor being gone. */
  loadFailed?: boolean
  senderEmail: string | null
  senderName: string | null
}) {
  if (thread.vendorId && loadFailed) {
    return (
      <div className="space-y-3 border-t border-border p-4">
        <RailLabel>Vendor</RailLabel>
        <Alert variant="warning" title="Vendor couldn’t load">
          This thread is filed under a vendor, but its record couldn&apos;t be read right now.
          Refresh to try again.
        </Alert>
      </div>
    )
  }

  if (thread.vendorId && vendor) {
    return (
      <div className="space-y-3 border-t border-border p-4">
        <RailLabel>Vendor</RailLabel>
        <Link
          href={`/vendors/${vendor.vendorId}`}
          className="group flex items-start gap-2 rounded-lg no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Briefcase className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-semibold text-foreground group-hover:text-primary">
            {vendor.legalName}
          </span>
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={vendor.status} tones={VENDOR_TONES} />
          <span>{vendor.trades?.join(' · ') || 'No trades on file'}</span>
        </div>
        {vendor.incomplete ? (
          <Alert variant="warning" hideIcon className="p-3 text-xs">
            Setup incomplete — this vendor still needs an EIN and a trade before it can be used for
            1099s, RFPs, or compliance checks.
          </Alert>
        ) : null}
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
      <div className="space-y-3 border-t border-border p-4">
        <RailLabel>Vendor</RailLabel>
        <p className="text-xs text-muted">Filed under a vendor that no longer exists. Re-file it below.</p>
        <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-border p-4">
      <RailLabel>Vendor</RailLabel>
      <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
    </div>
  )
}
