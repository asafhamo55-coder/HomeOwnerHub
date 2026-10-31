import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { formatDay } from '@/lib/money/format'
import { formatCents, POLICY_KIND_LABELS } from '@/lib/insurance/model'
import type { OwnerPolicySummary } from '@/lib/insurance/analysis'
import { IconTile } from '@/components/resident/screen'

export function PolicyRow({ p }: { p: OwnerPolicySummary }) {
  // expiresOn is a DATE column: formatDay is zone-proof. Left out when missing.
  const through = p.expiresOn ? formatDay(p.expiresOn) : '—'
  return (
    <div className="flex min-h-16 items-start gap-3 bg-surface px-4 py-3">
      <IconTile icon={<ShieldCheck />} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{POLICY_KIND_LABELS[p.kind]}</p>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">{p.carrier || 'Insurance company not recorded'}</p>
        <dl className="grid grid-cols-2 gap-x-4 text-xs">
          <div>
            <dt className="text-muted">Limit</dt>
            <dd className="num text-foreground">{formatCents(p.coverageLimitCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Deductible</dt>
            <dd className="num text-foreground">{formatCents(p.deductibleCents)}</dd>
          </div>
        </dl>
        {through !== '—' ? <p className="text-xs text-muted">In force through {through}</p> : null}
      </div>
    </div>
  )
}
