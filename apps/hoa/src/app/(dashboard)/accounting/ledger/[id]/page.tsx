import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card } from '@homeowner-portal/ui'
import { getAccountingContext, getJournalEntry } from '@/lib/accounting/queries'
import { ReverseEntryButton } from './ReverseEntryButton'
import { PromoteRecurringButton } from './PromoteRecurringButton'

export const metadata = { title: 'Journal Entry' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function JournalEntryDetailPage({ params }: PageProps) {
  const { id } = await params
  const ctx = await getAccountingContext()
  if (!ctx) notFound()

  const je = await getJournalEntry(ctx.associationId, id)
  if (!je) notFound()

  const totalDr = je.lines.reduce((s, l) => s + l.debit_amount, 0)
  const totalCr = je.lines.reduce((s, l) => s + l.credit_amount, 0)
  const isBalanced = totalDr === totalCr

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/ledger"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          General Ledger
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-bold text-foreground">
            {je.header.entry_number}
          </h1>
          <Badge
            variant={
              je.header.status === 'posted'
                ? 'success'
                : je.header.status === 'reversed'
                  ? 'destructive'
                  : 'outline'
            }
          >
            {je.header.status}
          </Badge>
          {je.header.ai_generated ? (
            <Badge variant="outline">
              <Sparkles className="mr-1 h-3 w-3" />
              AI generated
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-foreground">{je.header.memo}</p>
        <p className="text-xs text-muted">
          {format(new Date(je.header.entry_date), 'PPP')} · source:{' '}
          <span className="font-mono">{je.header.source}</span>
          {je.header.posted_at
            ? ` · posted ${format(new Date(je.header.posted_at), 'PPp')}`
            : null}
        </p>
        {je.header.status === 'posted' && !je.header.reversed_by_id ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <ReverseEntryButton journalEntryId={je.header.id} />
            <PromoteRecurringButton journalEntryId={je.header.id} />
          </div>
        ) : null}
      </header>

      {je.header.reverses_id ? (
        <Card>
          <div className="p-4 text-sm">
            This entry reverses{' '}
            <Link
              href={`/accounting/ledger/${je.header.reverses_id}`}
              className="font-mono text-primary hover:underline"
            >
              the original
            </Link>
            .
          </div>
        </Card>
      ) : null}
      {je.header.reversed_by_id ? (
        <Card>
          <div className="p-4 text-sm">
            This entry was reversed by{' '}
            <Link
              href={`/accounting/ledger/${je.header.reversed_by_id}`}
              className="font-mono text-primary hover:underline"
            >
              a later entry
            </Link>
            .
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Fund</th>
              <th className="px-4 py-2 font-medium">Memo</th>
              <th className="px-4 py-2 text-right font-medium">Debit</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {je.lines.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <div className="font-mono text-xs text-muted">
                    {l.account.account_number}
                  </div>
                  <div className="text-foreground">{l.account.account_name}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted">{l.fund.code}</td>
                <td className="px-4 py-2 text-xs text-muted">{l.memo ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {l.debit_amount > 0 ? currency(l.debit_amount) : '—'}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {l.credit_amount > 0 ? currency(l.credit_amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border bg-background/30">
            <tr>
              <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted" colSpan={3}>
                Totals
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {currency(totalDr)}
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {currency(totalCr)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right text-xs">
                {isBalanced ? (
                  <span className="text-emerald-500">✓ balanced</span>
                ) : (
                  <span className="text-destructive">
                    ✗ off by {currency(Math.abs(totalDr - totalCr))}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
