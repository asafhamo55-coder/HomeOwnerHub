import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScrollText, Sparkles } from 'lucide-react'
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Kpi,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { getAccountingContext, getInvoice, type InvoiceDetail } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { daysSince, formatDay, formatStamp, usd } from '@/lib/money/format'
import { INVOICE_STATUS, sourceLabel, statusOf } from '@/lib/money/status'
import { AccountingLoadFailed, accountingCrumbs } from '../../_components/shared'
import { MarkInvoicePaidButton } from './MarkInvoicePaidButton'
import { InvoiceActions } from './InvoiceActions'

export const metadata = { title: 'Invoice' }

interface PageProps {
  params: Promise<{ id: string }>
}

type JeRow = InvoiceDetail['journalEntries'][number]

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const crumbs = accountingCrumbs(['Invoices', '/accounting/invoices'], ['Invoice'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Invoice" what="this invoice" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) notFound()
  const res = await tryLoad('invoice', () => getInvoice(ctx.associationId, id))
  if (!res.ok) return <AccountingLoadFailed title="Invoice" what="this invoice" breadcrumbs={crumbs} />
  const invoice = res.data
  if (!invoice) notFound()

  const totalPaid = (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const balance = Math.max(Number(invoice.amount) - totalPaid, 0)
  const isPaid = invoice.status === 'paid'
  const isPayable = invoice.status === 'approved' || invoice.status === 'coded'
  const status = statusOf(INVOICE_STATUS, invoice.status)
  const late = invoice.due_date && !isPaid && invoice.status !== 'cancelled' ? daysSince(invoice.due_date) : 0
  const lastPaidAt = (invoice.payments ?? []).map((p) => p.paid_at).filter(Boolean).sort().at(-1) ?? null
  const vendorName = invoice.vendor
    ? `${invoice.vendor.legal_name}${invoice.vendor.dba ? ` (d/b/a ${invoice.vendor.dba})` : ''}`
    : 'Unknown vendor'

  return (
    <Page
      width="default"
      linkAs={Link}
      breadcrumbs={accountingCrumbs(['Invoices', '/accounting/invoices'], [invoice.invoice_number])}
      eyebrow={<span className="num">Invoice {invoice.invoice_number}</span>}
      title={vendorName}
      description={`Dated ${formatDay(invoice.invoice_date)}${invoice.due_date ? ` · due ${formatDay(invoice.due_date)}` : ' · no due date'}`}
      meta={
        <>
          <StatusPill tone={status.tone} label={status.label} />
          {invoice.ai_generated ? <StatusPill tone="ai" label="Read by AI" icon={<Sparkles aria-hidden />} /> : null}
        </>
      }
      actions={isPaid ? undefined : <InvoiceActions invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />}
    >
      <section aria-label="Amounts" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Kpi label="Billed" value={usd(Number(invoice.amount))} />
        <Kpi label="Paid" value={usd(totalPaid)} hint={lastPaidAt ? `Last payment ${formatStamp(lastPaidAt)}` : 'No payments yet'} />
        <Kpi
          className="col-span-2 lg:col-span-1"
          label="Balance"
          value={usd(balance)}
          hint={late > 0 && balance > 0 ? `${late} days past due` : isPaid ? 'Paid in full' : undefined}
        />
      </section>

      {late > 0 && balance > 0 ? (
        <Alert variant="warning" title={`${late} days past due`}>
          Due {formatDay(invoice.due_date)}. Late vendor payments can carry fees — pay it or mark it disputed with the vendor.
        </Alert>
      ) : null}

      {isPayable ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Record payment</CardTitle>
            <CardDescription>Posts the payment from operating cash and closes the bill.</CardDescription>
          </CardHeader>
          <CardContent>
            <MarkInvoicePaidButton invoiceId={invoice.id} amount={Number(invoice.amount)} />
          </CardContent>
        </Card>
      ) : invoice.status === 'received' ? (
        <Alert variant="info" title="Not ready to pay">
          This bill is received but not yet coded or approved, so it can’t be paid from here.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2">Journal entries</CardTitle>
          <CardDescription>Every ledger entry this invoice produced — the bill, then any payment.</CardDescription>
        </CardHeader>
        <DataTable<JeRow>
          framed={false}
          density="compact"
          caption="Journal entries for this invoice"
          columns={[
            {
              key: 'entry',
              header: 'Entry',
              cell: (je) => (
                <Link href={`/accounting/ledger/${je.id}`} className="group block no-underline">
                  <span className="block font-medium text-foreground group-hover:text-primary group-hover:underline">{je.memo}</span>
                  <span className="num block text-xs text-muted">{je.entry_number}</span>
                </Link>
              ),
            },
            { key: 'date', header: 'Date', className: 'whitespace-nowrap text-muted', cell: (je) => formatDay(je.entry_date) },
            { key: 'source', header: 'Source', className: 'whitespace-nowrap text-muted', cell: (je) => sourceLabel(je.source) },
          ]}
          rows={invoice.journalEntries}
          rowKey={(je) => je.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<ScrollText aria-hidden />}
              title="No journal entries yet"
              description="The bill posts to the ledger when it is entered; a payment adds a second entry."
            />
          }
        />
      </Card>
    </Page>
  )
}
