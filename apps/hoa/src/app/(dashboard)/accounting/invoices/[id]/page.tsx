import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, FileText, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card } from '@homeowner-portal/ui'
import { getAccountingContext, getInvoice } from '@/lib/accounting/queries'
import { MarkInvoicePaidButton } from './MarkInvoicePaidButton'

export const metadata = { title: 'Invoice' }

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

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const ctx = await getAccountingContext()
  if (!ctx) notFound()
  const invoice = await getInvoice(ctx.associationId, id)
  if (!invoice) notFound()

  const totalPaid = (invoice.payments ?? []).reduce(
    (s, p) => s + Number(p.amount),
    0,
  )
  const balance = Math.max(Number(invoice.amount) - totalPaid, 0)
  const isPaid = invoice.status === 'paid'
  const isPayable = invoice.status === 'approved' || invoice.status === 'coded'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/invoices"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Invoices
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-bold text-foreground">
            {invoice.invoice_number}
          </h1>
          <Badge
            variant={
              invoice.status === 'paid'
                ? 'success'
                : invoice.status === 'disputed'
                  ? 'destructive'
                  : invoice.status === 'cancelled'
                    ? 'outline'
                    : 'warning'
            }
          >
            {invoice.status}
          </Badge>
          {invoice.ai_generated ? (
            <Badge variant="outline">
              <Sparkles className="mr-1 h-3 w-3" />
              AI-extracted
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-foreground">
          {invoice.vendor?.legal_name ?? '—'}
          {invoice.vendor?.dba ? ` (d/b/a ${invoice.vendor.dba})` : ''}
        </p>
        <p className="text-xs text-muted">
          Invoice date {format(new Date(invoice.invoice_date), 'PP')}
          {invoice.due_date ? ` · due ${format(new Date(invoice.due_date), 'PP')}` : ''}
        </p>
      </header>

      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Billed</p>
            <p className="mt-1 font-mono text-lg text-foreground">
              {currency(Number(invoice.amount))}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Paid</p>
            <p className="mt-1 font-mono text-lg text-foreground">{currency(totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Balance</p>
            <p className="mt-1 font-mono text-lg text-foreground">{currency(balance)}</p>
          </div>
        </div>
        {isPayable ? (
          <div className="border-t border-border p-4">
            <MarkInvoicePaidButton invoiceId={invoice.id} amount={Number(invoice.amount)} />
          </div>
        ) : null}
        {isPaid ? (
          <div className="border-t border-border bg-emerald-500/5 p-4 text-sm text-emerald-700">
            Paid in full.
          </div>
        ) : null}
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Journal entries</h2>
        {invoice.journalEntries.length === 0 ? (
          <Card>
            <div className="p-6 text-sm text-muted">
              No journal entries on this invoice yet.
            </div>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {invoice.journalEntries.map((je) => (
                <li key={je.id}>
                  <Link
                    href={`/accounting/ledger/${je.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                  >
                    <FileText className="h-4 w-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        <span className="font-mono text-xs text-muted">{je.entry_number}</span>{' '}
                        · {je.memo}
                      </p>
                      <p className="text-xs text-muted">
                        {format(new Date(je.entry_date), 'PP')} ·{' '}
                        <span className="font-mono">{je.source}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
