import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listBankAccounts } from '@/lib/accounting/queries'
import { requireBoardOrAdmin } from '@/lib/auth'
import { MAX_FILE_BYTES, MAX_ROWS } from '@/lib/bank-import/parse'
import { tryLoad } from '@/lib/load-or-fail'
import { AccountingLoadFailed, accountingCrumbs } from '../../../_components/shared'
import { ImportStatementForm } from './ImportStatementForm'

export const metadata = { title: 'Import Statement' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ accountId: string }>
}

/** BL-144: import a CSV or OFX/QFX statement into a manual bank account. */
export default async function ImportStatementPage({ params }: PageProps) {
  await requireBoardOrAdmin()
  const { accountId } = await params
  const crumbs = accountingCrumbs(['Bank', '/accounting/bank'], ['Import statement'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Import statement" what="this bank account" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) notFound()
  const accountsRes = await tryLoad('bank accounts', () => listBankAccounts(ctx.associationId))
  if (!accountsRes.ok) return <AccountingLoadFailed title="Import statement" what="this bank account" breadcrumbs={crumbs} width="narrow" />
  const account = accountsRes.data.find((a) => a.id === accountId)
  if (!account) notFound()

  const linked = Boolean(account.plaid_item_id)

  return (
    <Page
      width="default"
      linkAs={Link}
      breadcrumbs={accountingCrumbs(['Bank', '/accounting/bank'], [account.account_name])}
      title={`Import a statement into ${account.account_name}`}
      description={`${account.bank_name ?? 'Bank'}${account.last4 ? ` ··${account.last4}` : ''}${account.fund ? ` · ${account.fund.name}` : ''}. Preview first: nothing is saved until you select Import.`}
    >
      {linked ? (
        <Alert
          variant="info"
          title="This account is linked through Plaid"
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href="/accounting/bank/queue">Matching queue</Link>
            </Button>
          }
        >
          Its transactions arrive on their own, so there’s nothing to import. Statements can only be imported into a manual account.
        </Alert>
      ) : !account.is_active ? (
        <Alert variant="warning" title="This account is inactive">
          Statements can’t be imported into an inactive account.
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Statement file</CardTitle>
            <CardDescription>
              Download the statement from your bank’s website as CSV, OFX or QFX (Quicken). Rows already in this account (same date,
              amount and description) are skipped, so overlapping statements are safe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportStatementForm bankAccountId={account.id} maxMb={MAX_FILE_BYTES / 1024 / 1024} maxRows={MAX_ROWS} />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
