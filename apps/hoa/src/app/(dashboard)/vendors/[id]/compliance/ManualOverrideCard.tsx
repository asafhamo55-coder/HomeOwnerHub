'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Select,
  StatusBadge,
  Textarea,
} from '@homeowner-portal/ui'
import { COMPLIANCE_HELP, COMPLIANCE_LABELS, COMPLIANCE_TONES, complianceKey } from '@/lib/status/vendors'
import { setVendorComplianceManually, type ComplianceStatus } from '@/lib/vendors'

// Manual escape hatch from the AI compliance grading. When the W21
// check is wrong, stuck, or simply not what the board wants to use,
// a board member or admin can set the status directly. Logged in the
// audit table; persists deficiencies as a single "manual_override"
// record so the rest of the UI keeps rendering normally.

const STATUSES: Array<{ value: ComplianceStatus; label: string; help: string }> = (
  ['green', 'yellow', 'red', 'missing'] as const
).map((value) => ({ value, label: COMPLIANCE_LABELS[value], help: COMPLIANCE_HELP[value] }))

export function ManualOverrideCard({
  vendorId,
  currentStatus,
}: {
  vendorId: string
  currentStatus: ComplianceStatus | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [status, setStatus] = useState<ComplianceStatus>(currentStatus ?? 'green')
  const [summary, setSummary] = useState<string>('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await setVendorComplianceManually({
        vendorId,
        status,
        summary: summary.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(`Status set to ${COMPLIANCE_LABELS[status].toLowerCase()}.`)
      router.refresh()
    })
  }

  const meta = STATUSES.find((s) => s.value === status)!

  return (
    <Card>
      <CardHeader
        className="pb-4"
        actions={
          <StatusBadge
            status={complianceKey(currentStatus)}
            tones={COMPLIANCE_TONES}
            labels={COMPLIANCE_LABELS}
          />
        }
      >
        <CardTitle as="h2">Manual override</CardTitle>
        <CardDescription>
          For offline proof the check can’t see — a signed paper COI, a phone-verified license. Every
          override is logged in the audit trail with your name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="New status" hint={meta.help}>
            <Select value={status} onValueChange={(v) => setStatus(v as ComplianceStatus)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason" optional hint="Shown in the deficiencies list on the vendor page.">
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.currentTarget.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. COI verified by phone with the carrier — policy active through 12/31."
            />
          </Field>

          {error ? (
            <Alert variant="error" title="Couldn’t set the status">
              {error}
            </Alert>
          ) : null}
          {success ? <Alert variant="success">{success}</Alert> : null}

          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={pending} icon={<ShieldCheck aria-hidden />}>
              Set to {COMPLIANCE_LABELS[status].toLowerCase()}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
