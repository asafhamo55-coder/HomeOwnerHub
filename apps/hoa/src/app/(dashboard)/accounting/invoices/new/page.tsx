import Link from 'next/link'
import { BookOpen, Store } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listAccounts } from '@/lib/accounting/queries'
import { listVendors } from '@/lib/vendors'
import { tryLoad } from '@/lib/load-or-fail'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { EnterBillForm } from './EnterBillForm'
import { BillScanUpload } from './BillScanUpload'

export const metadata = { title: 'Enter Bill' }

export default async function NewInvoicePage() {
  const crumbs = accountingCrumbs(['Invoices', '/accounting/invoices'], ['Enter bill'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Enter a bill" what="the bill form" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Enter a bill" tabs={false} />

  const [vendorsRes, accountsRes] = await Promise.all([
    tryLoad('vendors', () => listVendors()),
    tryLoad('chart of accounts', () => listAccounts(ctx.associationId)),
  ])
  if (!vendorsRes.ok || !accountsRes.ok) {
    return <AccountingLoadFailed title="Enter a bill" what={!vendorsRes.ok ? 'vendors' : 'expense accounts'} breadcrumbs={crumbs} width="narrow" />
  }

  const expenseAccounts = accountsRes.data
    .filter((a) => a.account_type === 'expense' && a.is_active)
    .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.account_name}` }))
  const vendorOptions = vendorsRes.data
    .filter((v) => v.status !== 'blacklisted')
    .map((v) => ({ id: v.id, label: v.legal_name + (v.dba ? ` (d/b/a ${v.dba})` : '') }))

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Enter a bill"
      description="Records the vendor invoice and posts the expense to the operating fund (Dr expense, Cr accounts payable)."
    >
      {vendorOptions.length === 0 ? (
        <EmptyState
          icon={<Store aria-hidden />}
          title="Add a vendor first"
          description="Bills are entered against a vendor on file."
          action={
            <Button asChild>
              <Link href="/vendors/new">Add vendor</Link>
            </Button>
          }
        />
      ) : expenseAccounts.length === 0 ? (
        <EmptyState
          icon={<BookOpen aria-hidden />}
          title="No expense accounts"
          description="Your chart of accounts has no active expense accounts yet. Contact support to add the standard ones (landscaping, utilities, insurance…)."
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/accounting/coa">View chart of accounts</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* BL-021: the AI reads an uploaded bill into a proposal for /approvals. */}
          <BillScanUpload />
          <Card>
            <CardHeader>
              <CardTitle as="h2">Enter by hand</CardTitle>
            </CardHeader>
            <CardContent>
              <EnterBillForm vendors={vendorOptions} expenseAccounts={expenseAccounts} />
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  )
}
