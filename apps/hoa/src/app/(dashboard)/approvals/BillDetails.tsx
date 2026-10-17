import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import type { BillCard } from '@/lib/approvals-inbox/model'
import { usd } from '@/lib/money/format'

// BL-021: what the AI read off the bill, field by field. A field it could
// not read says "Not found" (never a placeholder value); a field it read
// with less than high confidence carries a "Check" badge.

type Conf = 'high' | 'medium' | 'low'

function Flag({ value, confidence }: { value: unknown; confidence: Conf }) {
  if (value === null) return <Badge variant="danger">Not found</Badge>
  if (confidence === 'high') return null
  return <Badge variant="warning">{confidence === 'low' ? 'Low confidence — check' : 'Check'}</Badge>
}

function Row({ label, children, flag }: { label: string; children: React.ReactNode; flag?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
      {flag}
    </div>
  )
}

const dash = <span className="text-muted">—</span>

export function BillDetails({ bill }: { bill: BillCard }) {
  const p = bill.payload
  const vendor = p.vendor.vendorLabel
    ? p.vendor.vendorLabel
    : p.vendor.extractedName
      ? `“${p.vendor.extractedName}” — not on file`
      : null
  const vendorConfidence: Conf =
    p.vendor.matchConfidence === 'high' && p.vendor.nameConfidence === 'high' ? 'high' : p.vendor.vendorId ? 'medium' : 'low'

  return (
    <div className="space-y-2 rounded-md border border-border bg-subtle p-3 text-xs">
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <Row label="Vendor" flag={<Flag value={p.vendor.vendorId} confidence={vendorConfidence} />}>
          {vendor ?? dash}
          {p.vendor.match === 'close' ? <span className="text-muted"> (similar name)</span> : null}
        </Row>
        <Row label="Invoice #" flag={<Flag value={p.invoiceNumber.value} confidence={p.invoiceNumber.confidence} />}>
          {p.invoiceNumber.value ?? dash}
        </Row>
        <Row label="Invoice date" flag={<Flag value={p.invoiceDate.value} confidence={p.invoiceDate.confidence} />}>
          <span className="num">{p.invoiceDate.value ?? dash}</span>
        </Row>
        <Row label="Due" flag={p.dueDate.value === null ? undefined : <Flag value={p.dueDate.value} confidence={p.dueDate.confidence} />}>
          <span className="num">{p.dueDate.value ?? 'Not stated'}</span>
        </Row>
        <Row label="Total" flag={<Flag value={p.total.value} confidence={p.total.confidence} />}>
          <span className="num">{p.total.value === null ? dash : usd(p.total.value)}</span>
        </Row>
        <Row label="Expense account" flag={<Flag value={p.expenseAccount.accountId} confidence={p.expenseAccount.confidence} />}>
          {p.expenseAccount.label ?? dash}
        </Row>
      </dl>

      {p.lineItems.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer font-medium text-foreground-secondary">
            {p.lineItems.length} line item{p.lineItems.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {p.lineItems.map((li, i) => (
              <li key={i} className="flex min-w-0 justify-between gap-3">
                <span className="min-w-0 break-words text-foreground-secondary">{li.description}</span>
                <span className="num shrink-0 text-foreground">{li.amount === null ? '—' : usd(li.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {p.warnings.length > 0 ? (
        <ul className="space-y-1">
          {p.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-foreground-secondary">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 break-words">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {bill.documentUrl ? (
        <a
          href={bill.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary"
        >
          View the bill <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : (
        <p className="text-muted">The uploaded bill isn’t available to view.</p>
      )}
    </div>
  )
}
