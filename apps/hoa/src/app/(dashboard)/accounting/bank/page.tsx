import Link from 'next/link'
import { ArrowRight, Banknote, FileUp, Landmark, ListChecks } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  StatusPill,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listBankAccounts,
  listFunds,
  pageBankTransactions,
  type BankAccountWithFund,
  type BankTransactionRow,
} from '@/lib/accounting/queries'
import { getCurrentUserRole } from '@/lib/auth'
import { tryLoad } from '@/lib/load-or-fail'
import { SummaryStrip } from '@/components/SummaryStrip'
import { bankSummaryTiles, needsReconciliation } from '@/lib/accounting/bank-summary'
import { loadLastReconciled } from '@/lib/accounting/last-reconciled'
import { dayOf } from '@/lib/association-time'
import { formatDay, formatStamp, plural, todayIso, usd } from '@/lib/money/format'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { AddManualAccountButton } from './AddManualAccountButton'
import { LinkPlaidButton } from './LinkPlaidButton'

export const metadata = { title: 'Bank Accounts' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function BankAccountsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Bank accounts" what="bank accounts" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Bank accounts" returnTo="/accounting/bank" />

  const page = parsePageParam((await searchParams).page)
  const [accounts, txns, unmatched, funds] = await Promise.all([
    tryLoad('bank accounts', () => listBankAccounts(ctx.associationId)),
    tryLoad('bank transactions', () => pageBankTransactions(ctx.associationId, {}, pageRange(page, PAGE_SIZE))),
    tryLoad('unmatched transactions', () => pageBankTransactions(ctx.associationId, { matched: 'unmatched' }, { from: 0, to: 0 })),
    tryLoad('funds', () => listFunds(ctx.associationId)),
  ])
  // Last reconciliation per account, for the strip and the cards. Needs the
  // account list first; a failure shows "Not available", never "never".
  const recs = accounts.ok ? await tryLoad('last reconciliations', () => loadLastReconciled(accounts.data.map((a) => a.id))) : null
  const lastReconciled = recs && recs.ok ? recs.data : null
  const today = todayIso(ctx.timeZone)
  const tiles = bankSummaryTiles({
    accounts: accounts.ok ? accounts.data : null,
    lastReconciled,
    unmatched: unmatched.ok ? unmatched.data.total : null,
    today,
    timeZone: ctx.timeZone,
  })
  const fundOptions = funds.ok ? funds.data.map((f) => ({ id: f.id, label: f.name })) : []
  // BL-064: an admin can open the books from the dialog when there are no funds.
  const canOpenBooks = (await getCurrentUserRole())?.role === 'admin'
  const hasAccounts = accounts.ok && accounts.data.length > 0
  const unmatchedCount = unmatched.ok ? unmatched.data.total : 0

  return (
    <Page
      title="Bank accounts"
      description="Linked through Plaid, or kept by hand from imported statements. Transactions are matched to the ledger, and what can’t be matched waits in the queue."
      tabs={<AccountingTabs />}
      // With no accounts yet, the empty state below carries the one primary
      // "Connect bank" action, so the header only offers the manual route.
      actions={
        funds.ok ? (
          <>
            <AddManualAccountButton funds={fundOptions} variant={hasAccounts || !accounts.ok ? 'ghost' : 'secondary'} />
            {hasAccounts || !accounts.ok ? <LinkPlaidButton funds={fundOptions} canOpenBooks={canOpenBooks} variant="secondary" /> : null}
          </>
        ) : undefined
      }
    >
      <SummaryStrip ariaLabel="Bank accounts at a glance" testId="bank-summary" tiles={tiles} />

      {unmatchedCount > 0 ? (
        <Alert
          variant="warning"
          title={`${plural(unmatchedCount, 'transaction')} need${unmatchedCount === 1 ? 's' : ''} a match`}
          actions={
            <Button asChild size="sm">
              <Link href="/accounting/bank/queue">
                Review queue
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        >
          The automatic matcher couldn’t place these in the ledger. Until they’re matched, bank and ledger balances won’t agree.
        </Alert>
      ) : null}

      {!accounts.ok ? (
        <LoadFailed what="bank accounts" />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          icon={<Banknote aria-hidden />}
          title="No bank accounts linked"
          description="Link your operating and reserve accounts so transactions flow in and match to the ledger on their own. Rather not link? Add a manual account and import statements instead."
          action={
            funds.ok ? (
              <LinkPlaidButton funds={fundOptions} canOpenBooks={canOpenBooks} label="Connect bank" />
            ) : (
              // Linking needs the fund list; when that read failed, reloading
              // is the honest next step (the dialog would offer no funds).
              <Button asChild>
                <Link href="/accounting/bank">Reload to connect a bank</Link>
              </Button>
            )
          }
        />
      ) : (
        <section aria-label="Accounts" className="grid gap-4 sm:grid-cols-2">
          {accounts.data.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              rec={
                lastReconciled
                  ? { known: true, at: lastReconciled.get(a.id) ?? null, due: needsReconciliation(a, lastReconciled.get(a.id) ?? null, today, ctx.timeZone) }
                  : { known: false }
              }
              timeZone={ctx.timeZone}
            />
          ))}
        </section>
      )}

      {hasAccounts ? (
        <Card className="overflow-hidden">
          <CardHeader
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/accounting/bank/queue">
                  <ListChecks aria-hidden />
                  Matching queue
                </Link>
              </Button>
            }
          >
            <CardTitle as="h2">Transactions</CardTitle>
            <CardDescription>Newest first, across every linked account.</CardDescription>
          </CardHeader>
          {!txns.ok ? (
            <div className="px-5 pb-5">
              <LoadFailed what="bank transactions" />
            </div>
          ) : (
            <DataTable
              framed={false}
              density="compact"
              mobile="cards"
              caption="Bank transactions"
              columns={TXN_COLUMNS}
              rows={txns.data.rows}
              rowKey={(t) => t.id}
              empty={
                <EmptyState
                  variant="compact"
                  icon={<Landmark aria-hidden />}
                  title="No transactions yet"
                  description="They appear after the first sync, usually within a few hours of linking. Dues and invoices already post to the ledger."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/accounting/ledger">Open the ledger</Link>
                    </Button>
                  }
                />
              }
              footer={
                txns.data.total > PAGE_SIZE ? (
                  <Pager
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={txns.data.total}
                    rowCount={txns.data.rows.length}
                    hrefFor={(p) => (p > 1 ? `/accounting/bank?page=${p}` : '/accounting/bank')}
                    linkAs={Link}
                    noun="transactions"
                  />
                ) : undefined
              }
            />
          )}
        </Card>
      ) : null}
    </Page>
  )
}

type RecState = { known: true; at: string | null; due: boolean } | { known: false }

function AccountCard({ account: a, rec, timeZone }: { account: BankAccountWithFund; rec: RecState; timeZone: string }) {
  // BL-144: no Plaid item means the board keeps it from imported statements.
  const manual = !a.plaid_item_id
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 p-5 pb-0">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{a.account_name}</h2>
          <p className="text-sm text-muted">
            {a.bank_name ?? 'Bank'}
            {a.last4 ? <span className="num"> ··{a.last4}</span> : null}
            {a.fund ? ` · ${a.fund.name}` : ''}
          </p>
        </div>
        {!a.is_active ? (
          <StatusPill tone="neutral" label="Inactive" size="sm" />
        ) : manual ? (
          <StatusPill tone="neutral" label="Manual" size="sm" />
        ) : (
          <StatusPill tone="success" label="Linked" size="sm" />
        )}
      </div>
      <div className="flex-1 px-5 pb-5 pt-4">
        <p className="num text-3xl font-semibold tracking-tight text-foreground">
          {a.current_balance != null ? usd(Number(a.current_balance)) : '—'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {manual
            ? a.last_synced_at
              ? `Statement last imported ${formatStamp(a.last_synced_at)}`
              : 'No statement imported yet'
            : a.last_synced_at
              ? `Bank balance · synced ${formatStamp(a.last_synced_at)}`
              : 'Never synced'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {!rec.known
            ? 'Last reconciled: not available'
            : rec.at
              ? `Last reconciled ${formatDay(dayOf(rec.at, timeZone))}`
              : 'Never reconciled'}
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        {manual && a.is_active ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/accounting/bank/${a.id}/import`}>
              <FileUp aria-hidden />
              Import statement
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={a.is_active && rec.known && rec.due ? 'secondary' : 'ghost'} size="sm">
          <Link href={`/accounting/bank/${a.id}/reconcile`}>
            Reconcile now
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  )
}

const TXN_COLUMNS: DataTableColumn<BankTransactionRow>[] = [
  { key: 'date', header: 'Date', className: 'whitespace-nowrap text-muted', cell: (t) => formatDay(t.posted_date) },
  {
    key: 'memo',
    header: 'Description',
    mobilePrimary: true,
    cell: (t) => (
      <span className="block min-w-0">
        <span className="block truncate text-foreground">{t.merchant ?? t.memo ?? 'No description'}</span>
        {t.merchant && t.memo ? <span className="block truncate text-xs text-muted">{t.memo}</span> : null}
      </span>
    ),
  },
  { key: 'account', header: 'Account', hideBelowLg: true, className: 'whitespace-nowrap text-muted', cell: (t) => t.bank_account?.account_name ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    cell: (t) => <span className={Number(t.amount) > 0 ? 'text-success' : 'text-foreground'}>{Number(t.amount) > 0 ? `+${usd(Number(t.amount))}` : usd(Number(t.amount))}</span>,
  },
  {
    key: 'match',
    header: 'Ledger',
    cell: (t) =>
      t.matched_journal_entry_id ? (
        <Link href={`/accounting/ledger/${t.matched_journal_entry_id}`} className="no-underline">
          <StatusPill tone="success" label={t.match_method === 'manual' ? 'Matched by hand' : 'Matched'} size="sm" />
        </Link>
      ) : (
        <Link href="/accounting/bank/queue" className="no-underline">
          <StatusPill tone="warning" label="Unmatched" size="sm" />
        </Link>
      ),
  },
]
