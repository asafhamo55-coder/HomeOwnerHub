import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Badge, Card, CardContent } from '@homeowner-portal/ui'
import { listVendors, type ComplianceStatus } from '@/lib/vendors'

export const metadata = { title: 'Vendor approval queue' }

const VARIANT: Record<ComplianceStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
  missing: 'outline',
}

const LABEL: Record<ComplianceStatus, string> = {
  green: 'Compliant',
  yellow: 'Action soon',
  red: 'Non-compliant',
  missing: 'Docs missing',
}

export default async function VendorApprovalQueuePage() {
  const vendors = await listVendors()

  // Queue = anything that needs a human eye:
  //   1. green + still prospect → board can flip to active
  //   2. yellow / red → board reviews the deficiencies
  //   3. missing → docs haven't been entered yet
  const queue = vendors.filter((v) => {
    const c = v.compliance?.status
    if (v.status === 'prospect' && c === 'green') return true
    if (c === 'yellow' || c === 'red' || c === 'missing') return true
    return false
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-2xl font-bold text-muted">Vendor approval queue</h1>
        </div>
        <p className="text-sm text-muted-fg">
          Vendors awaiting board action. Green prospects can be approved;
          yellow / red need a follow-up before they can do work.
        </p>
      </header>

      {queue.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-sm text-muted-fg">
              Nothing pending. New vendor compliance results land here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {queue.map((v) => {
            const compliance = v.compliance?.status
            const reason = describeReason(v.status, compliance)
            return (
              <li key={v.id}>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-muted">{v.legal_name}</p>
                        <p className="text-xs text-muted-fg">
                          {(v.trades ?? []).join(', ') || 'No trades on file'}
                        </p>
                        <p className="mt-1 text-sm text-muted-fg">{reason}</p>
                        {v.compliance?.deficiencies?.length ? (
                          <ul className="mt-2 space-y-1 text-xs text-muted-fg">
                            {v.compliance.deficiencies.slice(0, 3).map((d, i) => (
                              <li key={`${d.code}-${i}`}>
                                <span className="font-mono">{d.code}</span>:{' '}
                                {d.detail}
                              </li>
                            ))}
                            {v.compliance.deficiencies.length > 3 ? (
                              <li>
                                +{v.compliance.deficiencies.length - 3} more
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-2">
                        {compliance ? (
                          <Badge variant={VARIANT[compliance]}>
                            {LABEL[compliance]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No review</Badge>
                        )}
                        <Link
                          href={`/vendors/${v.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Review →
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function describeReason(
  vendorStatus: string,
  compliance: ComplianceStatus | null | undefined,
): string {
  if (vendorStatus === 'prospect' && compliance === 'green') {
    return 'Compliant prospect — ready to approve as an active vendor.'
  }
  if (compliance === 'yellow') return 'Action item — review deficiencies.'
  if (compliance === 'red') return 'Non-compliant — vendor cannot do work yet.'
  if (compliance === 'missing') return 'Docs not yet entered — run a compliance check.'
  return ''
}
