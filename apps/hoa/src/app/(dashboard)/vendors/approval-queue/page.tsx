import Link from 'next/link'
import { ChevronRight, ClipboardCheck } from 'lucide-react'
import { Card, EmptyState, LoadFailed, Page, StatusBadge } from '@homeowner-portal/ui'
import { listVendorsResult, type ComplianceStatus } from '@/lib/vendors'
import { COMPLIANCE_LABELS, COMPLIANCE_TONES, complianceKey } from '@/lib/status/vendors'
import { VendorTabs } from '@/components/vendors/VendorTabs'
import { tradesLabel } from '@/components/vendors/format'

export const metadata = { title: 'Vendor approval queue' }

export default async function VendorApprovalQueuePage() {
  const result = await listVendorsResult()

  // Queue = anything that needs a human eye:
  //   1. green + still prospect → board can flip to active
  //   2. yellow / red → board reviews the deficiencies
  //   3. missing → docs haven't been entered yet
  const queue = result.ok
    ? result.data.filter((v) => {
        const c = v.compliance?.status
        if (v.status === 'prospect' && c === 'green') return true
        if (c === 'yellow' || c === 'red' || c === 'missing') return true
        return false
      })
    : []

  return (
    <Page
      title="Vendors"
      description="Vendors waiting on the board. Compliant prospects can be approved; the rest need a follow-up before they can do work."
      tabs={<VendorTabs current="/vendors/approval-queue" />}
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
                      <p className="text-sm text-foreground-secondary">{describeReason(v.status, compliance)}</p>
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

function describeReason(vendorStatus: string, compliance: ComplianceStatus | null | undefined): string {
  if (vendorStatus === 'prospect' && compliance === 'green') {
    return 'Compliant prospect — ready to approve as an active vendor.'
  }
  if (compliance === 'yellow') return 'Gaps that need follow-up soon — review the deficiencies.'
  if (compliance === 'red') return 'Non-compliant — do not assign work until cured.'
  if (compliance === 'missing') return 'Documents not entered yet — run a compliance check.'
  return ''
}
