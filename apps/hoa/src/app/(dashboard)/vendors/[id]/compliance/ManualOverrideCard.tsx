'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Textarea,
} from '@homeowner-portal/ui'
import { setVendorComplianceManually, type ComplianceStatus } from '@/lib/vendors'

// Manual escape hatch from the AI compliance grading. When the W21
// check is wrong, stuck, or simply not what the board wants to use,
// a board member or admin can set the status directly. Logged in the
// audit table; persists deficiencies as a single "manual_override"
// record so the rest of the UI keeps rendering normally.

const STATUSES: Array<{ value: ComplianceStatus; label: string; help: string; tone: 'success' | 'warning' | 'destructive' | 'outline' }> = [
  { value: 'green',   label: 'Green — Compliant',     help: 'All required documents on file and valid.',   tone: 'success' },
  { value: 'yellow',  label: 'Yellow — Action soon',  help: 'Minor gaps; will become a problem in 30-60 days.', tone: 'warning' },
  { value: 'red',     label: 'Red — Non-compliant',   help: 'Major gap; should not assign work until cured.',   tone: 'destructive' },
  { value: 'missing', label: 'Missing — Not on file', help: 'Vendor has not submitted documents yet.',          tone: 'outline' },
]

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
      setSuccess(`Status set to ${status}.`)
      router.refresh()
    })
  }

  const meta = STATUSES.find((s) => s.value === status)!

  return (
    <Card variant="elevated" className="border-amber-200 dark:border-amber-900/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-base">Manual override</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert variant="warning" title="Bypass the AI check">
          <span className="block text-sm">
            Use this when you have offline proof (a signed COI on paper,
            phone-verified license) that the AI grading can't see. Each
            override is logged in the audit trail.
          </span>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">New status</span>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ComplianceStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
              <p className="text-[11px] text-muted">{meta.help}</p>
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">Current status</span>
              <div className="pt-1">
                {currentStatus ? (
                  <Badge variant={STATUSES.find((s) => s.value === currentStatus)?.tone ?? 'outline'}>
                    {currentStatus}
                  </Badge>
                ) : (
                  <Badge variant="outline">not set</Badge>
                )}
              </div>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Reason (optional)</span>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.currentTarget.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. COI verified by phone with State Farm — policy active through 12/31."
            />
            <p className="text-[11px] text-muted">
              Recorded with your name and timestamp in the audit log. Shown
              in the deficiencies list on the vendor page.
            </p>
          </label>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              {success}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {pending ? 'Saving…' : `Set to ${status}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
