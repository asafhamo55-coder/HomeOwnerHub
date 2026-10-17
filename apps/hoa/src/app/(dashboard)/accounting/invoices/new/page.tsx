import Link from 'next/link'
import { BookOpen, Store } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listAccounts } from '@/lib/accounting/queries'
import { listVendors } from '@/lib/vendors'
import { tryLoad } from '@/lib/load-or-fail'
import { DEFAULT_CHART_OF_ACCOUNTS } from '@/lib/association-setup'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { BooksNotOpen } from '../../../_components/BooksNotOpen'
import { EnterBillForm } from './EnterBillForm'
import { BillScanUpload } from './BillScanUpload'

export const metadata = { title: 'Enter Bill' }

export default async function NewInvoicePage() {
  const crumbs = accountingCrumbs(['Invoices', '/accounting/invoices'], ['Enter bill'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Enter a bill" what="the bill form" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Enter a bill" tabs={false} returnTo="/accounting/invoices/new" />

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
  // BL-064: "Open the books" helps only if it would add an expense account.
  const haveNumbers = new Set(accountsRes.data.map((a) => a.account_number))
  const missingStandardExpense = DEFAULT_CHART_OF_ACCOUNTS.some((a) => a.type === 'expense' && !haveNumbers.has(a.number))
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
      ) : expenseAccounts.length === 0 && missingStandardExpense ? (
        <BooksNotOpen
          title="No expense accounts"
          needFor="A bill posts to an expense account, and this association has no active ones yet (landscaping, utilities, insurance…)."
          returnTo="/accounting/invoices/new"
        />
      ) : expenseAccounts.length === 0 ? (
        // Every standard expense account exists but is inactive: opening the
        // books would add nothing, so point at the chart instead.
        <EmptyState
          icon={<BookOpen aria-hidden />}
          title="No active expense accounts"
          description="Every expense account in your chart of accounts is marked inactive. Reactivate one to enter bills against it."
          action={
            <Button asChild variant="secondary">
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
