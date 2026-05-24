import Link from 'next/link'
import { ScrollText, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { BackLink, Badge, Button, Card, EmptyState, PageHeader, Select } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listFiscalPeriods,
  listJournalEntries,
} from '@/lib/accounting/queries'

export const metadata = { title: 'General Ledger' }
export const dynamic = 'force-dynamic'

const SOURCES = [
  'manual',
  'ap_invoice',
  'ar_payment',
  'bank_rec',
  'recurring',
  'closing',
  'reversing',
] as const

const STATUSES = ['posted', 'draft', 'reversed'] as const

interface PageProps {
  searchParams: Promise<{ period?: string; source?: string; status?: string }>
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export default async function GeneralLedgerPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<ScrollText className="h-10 w-10" aria-hidden />}
          title="No ledger yet"
          description="Run pnpm seed:accounting to bootstrap the general ledger."
        />
      </div>
    )
  }

  const sp = await searchParams
  const periods = await listFiscalPeriods(ctx.associationId)
  const periodId =
    sp.period && periods.some((p) => p.id === sp.period)
      ? sp.period
      : ctx.currentPeriod?.id

  const entries = await listJournalEntries(ctx.associationId, {
    periodId,
    source: sp.source,
    status: sp.status,
  })

  const totalPosted = entries
    .filter((e) => e.status === 'posted')
    .reduce((s, e) => s + e.totalAmount, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <BackLink href="/accounting" label="Accounting" />
        <PageHeader
          title="General Ledger"
          description={`${entries.length} journal ${entries.length === 1 ? 'entry' : 'entries'} · ${currency(totalPosted)} posted`}
        />
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <FilterSelect
            label="Period"
            name="period"
            value={periodId ?? ''}
            options={periods.map((p) => ({
              value: p.id,
              label: `${format(new Date(p.start_date), 'yyyy')} · ${p.status}`,
            }))}
          />
          <FilterSelect
            label="Source"
            name="source"
            value={sp.source ?? ''}
            options={SOURCES.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Status"
            name="status"
            value={sp.status ?? ''}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Link
            href="/accounting/ledger"
            className="text-xs text-muted hover:text-foreground"
          >
            Reset
          </Link>
        </form>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-10 w-10" aria-hidden />}
          title="No journal entries in this view"
          description="Try a different period or clear the filters. Entries land automatically when assessments materialize or payments are recorded."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Memo</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((je) => (
                <tr key={je.id} className="border-b border-border last:border-0 hover:bg-background/50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/accounting/ledger/${je.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {je.entry_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {format(new Date(je.entry_date), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-foreground">{je.memo}</span>
                    {je.ai_generated ? (
                      <Sparkles className="ml-1 inline h-3 w-3 text-primary" aria-label="AI-generated" />
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{je.source}</td>
                  <td className="px-4 py-2 text-right font-mono text-foreground">
                    {currency(je.totalAmount)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        je.status === 'posted'
                          ? 'success'
                          : je.status === 'reversed'
                            ? 'destructive'
                            : 'outline'
                      }
                      size="sm"
                    >
                      {je.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string
  name: string
  value: string
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <Select name={name} defaultValue={value}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  )
}
