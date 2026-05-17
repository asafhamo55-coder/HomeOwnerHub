import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listAccounts,
} from '@/lib/accounting/queries'
import { listVendors } from '@/lib/vendors'
import { EnterBillForm } from './EnterBillForm'

export const metadata = { title: 'Enter Bill' }

export default async function NewInvoicePage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="Accounting not set up"
          description="This area is empty. Contact support to set up accounting for your association before entering bills."
        />
      </div>
    )
  }

  const [vendors, accounts] = await Promise.all([
    listVendors(),
    listAccounts(ctx.associationId),
  ])

  const expenseAccounts = accounts
    .filter((a) => a.account_type === 'expense' && a.is_active)
    .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.account_name}` }))

  const vendorOptions = vendors
    .filter((v) => v.status !== 'blacklisted')
    .map((v) => ({ id: v.id, label: v.legal_name + (v.dba ? ` (d/b/a ${v.dba})` : '') }))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/invoices"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Invoices
        </Link>
        <h1>Enter Bill</h1>
        <p className="text-sm text-muted">
          Records a vendor invoice and posts the bill journal entry
          (Dr Expense / Cr AP) in the operating fund.
        </p>
      </header>

      {vendorOptions.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No vendors on file"
          description="Add a vendor under Vendors before entering bills."
          action={
            <Link
              href="/vendors/new"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary/90"
            >
              Add vendor
            </Link>
          }
        />
      ) : expenseAccounts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No expense accounts"
          description="Your chart of accounts doesn't have any expense categories yet. Contact support to add the standard ones (Landscaping, Utilities, Insurance, and so on)."
        />
      ) : (
        <Card>
          <div className="p-6">
            <EnterBillForm
              vendors={vendorOptions}
              expenseAccounts={expenseAccounts}
            />
          </div>
        </Card>
      )}
    </div>
  )
}
