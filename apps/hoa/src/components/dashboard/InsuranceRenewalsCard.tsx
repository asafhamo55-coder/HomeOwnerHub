import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { POLICY_KIND_LABELS, reminderLabel, type PolicyReminder } from '@/lib/insurance/model'
import { FailedNote } from './BreakdownList'

/**
 * BL-132: insurance policies that expire within 90 days, or already have,
 * with no renewal recorded. Board-facing only. Renders nothing when there
 * is nothing to show; `reminders` null = the read failed.
 */
export function InsuranceRenewalsCard({ reminders }: { reminders: PolicyReminder[] | null }) {
  if (reminders !== null && reminders.length === 0) return null
  return (
    <Card id="insurance-renewals">
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted" aria-hidden />
          Insurance renewals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {reminders === null ? (
          <FailedNote what="your insurance policies" />
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.policyId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-foreground">
                  {POLICY_KIND_LABELS[r.kind]}
                  <span className="text-muted"> · {r.carrier}</span>
                </span>
                <StatusPill
                  tone={r.tone === 'expired' || r.tone === '30' ? 'danger' : r.tone === '60' ? 'warning' : 'info'}
                  label={reminderLabel(r)}
                />
              </li>
            ))}
          </ul>
        )}
        <Link href="/insurance" className="inline-block font-medium text-primary hover:underline">
          Record the renewal
        </Link>
      </CardContent>
    </Card>
  )
}
