import Link from 'next/link'
import { ChevronRight, ClipboardCheck, ListChecks } from 'lucide-react'
import { Button, Card, EmptyState, LoadFailed, Page, StatusBadge } from '@homeowner-portal/ui'
import { listVendorsResult } from '@/lib/vendors'
import { vendorNeedsBoard, vendorReason } from '@/lib/approvals-inbox/model'
import { COMPLIANCE_LABELS, COMPLIANCE_TONES, complianceKey } from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { tradesLabel } from '@/components/vendors/format'

export const metadata = { title: 'Vendor approval queue' }

export default async function VendorApprovalQueuePage() {
  const result = await listVendorsResult()

  // Queue = anything that needs a human eye (the same rule /approvals uses):
  //   1. green + still prospect → board can flip to active
  //   2. yellow / red → board reviews the deficiencies
  //   3. missing → docs haven't been entered yet
  const queue = result.ok ? result.data.filter(vendorNeedsBoard) : []

  return (
    <Page
      title="Vendors"
      description="Vendors waiting on the board. Compliant prospects can be approved; the rest need a follow-up before they can do work."
      tabs={<VendorTabs current="/vendors/approval-queue" />}
      actions={
        <Button asChild variant="secondary" icon={<ListChecks aria-hidden />}>
          <Link href="/approvals?type=vendor">All approvals</Link>
        </Button>
      }
      linkAs={Link}
    >
      {!result.ok ? (
        <LoadFailed what="the approval queue" retryHref="/vendors/approval-queue" />
      ) : queue.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck aria-hidden />}
          title="Nothing waiting on the board"
          description="New compliance results that need a decision land here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {queue.map((v) => {
              const compliance = v.compliance?.status
              const deficiencies = v.compliance?.deficiencies ?? []
              return (
                <li key={v.id}>
                  <Link
                    href={`/vendors/${v.id}`}
                    className="group flex items-start gap-4 px-5 py-4 transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{v.legal_name}</p>
                        <StatusBadge
                          status={complianceKey(compliance)}
                          tones={COMPLIANCE_TONES}
                          labels={COMPLIANCE_LABELS}
                        />
                      </div>
                      <p className="text-sm text-foreground-secondary">{vendorReason(v.status, compliance)}</p>
                      <p className="text-xs text-muted">{tradesLabel(v.trades) ?? 'No trade on file'}</p>
                      {deficiencies.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted">
                          {deficiencies.slice(0, 3).map((d, i) => (
                            <li key={`${d.code}-${i}`}>• {d.detail}</li>
                          ))}
                          {deficiencies.length > 3 ? <li>+{deficiencies.length - 3} more</li> : null}
                        </ul>
                      ) : null}
                    </div>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                      Review
                      <ChevronRight className="size-4 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </Page>
  )
}
