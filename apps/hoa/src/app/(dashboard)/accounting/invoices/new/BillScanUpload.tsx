'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, FileUp, Sparkles } from 'lucide-react'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

// BL-021: upload a vendor bill, the AI reads it, and a proposal lands in
// /approvals under "Bills to enter". Nothing is entered here — the result
// says so, and says plainly what the AI could not read or was unsure of.

type ScanResult =
  | {
      duplicate: false
      approvalRequestId: string
      summary: string
      amountCents: number | null
      missing: string[]
      needsCheck: string[]
      warnings: string[]
    }
  | { duplicate: true; approvalRequestId: string }

function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function usdFromCents(c: number): string {
  return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function BillScanUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/accounting/bill-scan', { method: 'POST', body: fd })
      if (!res.ok) {
        setError(await responseErrorMessage(res, 'The bill couldn’t be scanned. Enter it by hand below.'))
        return
      }
      setResult((await res.json()) as ScanResult)
    } catch {
      setError('The upload failed. Check your connection and try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader actions={<StatusPill tone="ai" size="sm" label="AI" />}>
        <CardTitle as="h2">Scan a bill</CardTitle>
        <CardDescription>
          Upload the vendor’s bill and the AI reads the vendor, invoice number, dates, line items and total, and suggests an expense
          account. It goes to Approvals — nothing is entered until a board member approves it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-subtle p-5 text-center">
          <FileUp className="size-5 text-muted" aria-hidden />
          <p className="text-sm text-foreground-secondary">PDF, JPG, PNG or WebP. Photos up to 3 MB.</p>
          <input
            ref={inputRef}
            id="bill-scan-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a bill to scan"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <Button
            type="button"
            variant="secondary"
            icon={<Sparkles aria-hidden />}
            onClick={() => inputRef.current?.click()}
            loading={busy}
          >
            {busy ? 'Reading the bill…' : 'Choose a bill'}
          </Button>
        </div>

        <div aria-live="polite" className="space-y-3">
          {error ? (
            <Alert variant="error" title="Couldn’t scan this bill">
              {error}
            </Alert>
          ) : null}
          {result?.duplicate ? (
            <Alert variant="info" title="This bill is already waiting for approval">
              The same file was scanned before.{' '}
              <Link href="/approvals?type=bill" className="font-medium text-primary">
                Open Bills to enter
              </Link>
            </Alert>
          ) : null}
          {result && !result.duplicate ? (
            <Alert
              variant={result.missing.length > 0 ? 'warning' : 'success'}
              title={result.missing.length > 0 ? 'Sent to Approvals — incomplete' : 'Sent to Approvals'}
            >
              <div className="space-y-1.5">
                <p className="break-words">
                  {result.summary}
                  {result.amountCents !== null ? <span className="num"> · {usdFromCents(result.amountCents)}</span> : null}
                </p>
                {result.missing.length > 0 ? (
                  <p>
                    The AI couldn’t find {joinList(result.missing)}. It was left blank, not guessed — reject it in Approvals and enter
                    the bill by hand below.
                  </p>
                ) : null}
                {result.needsCheck.length > 0 ? (
                  <p>Low confidence on the {joinList(result.needsCheck)} — check against the bill before approving.</p>
                ) : null}
                {result.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <Link href="/approvals?type=bill" className="inline-flex items-center gap-1 font-medium text-primary">
                  Review in Approvals <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </Alert>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
