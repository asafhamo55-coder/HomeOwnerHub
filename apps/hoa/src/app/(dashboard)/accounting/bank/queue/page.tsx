import Link from 'next/link'
import { CheckCircle2, Sparkles } from 'lucide-react'
import {
  Alert,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  StatusPill,
  pageRange,
  parsePageParam,
} from '@homeowner-portal/ui'
import { getAccountingContext, listAccounts, pageBankTransactions } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { formatDay, formatStamp, plural, usd } from '@/lib/money/format'
import { PROPOSAL_STATUS, statusOf } from '@/lib/money/status'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { DispositionActions } from './DispositionActions'
import { ProposalActions } from './ProposalActions'

export const metadata = { title: 'Reconciliation Queue' }
export const dynamic = 'force-dynamic'

// Was two silent caps (200 transactions, 200 proposals) plus a 500-row
// scan of every W18 run in the org to find hints. Unmatched transactions
// now page; hints are fetched for exactly the transactions on this page.
const PAGE_SIZE = 25
const PROPOSAL_WINDOW = 100

interface AiRunOutput {
  matchMethod?: string
  matchedAssessmentId?: string | null
  confidence?: number
  notes?: string
}

export default async function ReconciliationQueuePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const crumbs = accountingCrumbs(['Bank', '/accounting/bank'], ['Matching queue'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Matching queue" what="the matching queue" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Matching queue" />

  const page = parsePageParam((await searchParams).page)
  const supabase = await getSupabaseServerClient()
  const [proposalsRes, unmatchedRes, accountsRes] = await Promise.all([
    // Postings W18 proposed (sub-project D). 'approved' only shows up here if
    // posting didn't finish. That row stays blocked rather than being re-posted
    // automatically, so an operator has to resolve it by hand.
    loadOrFail(
      'proposed postings',
      supabase
        .from('approval_requests')
        .select('id, subject_id, summary, amount, status, proposed_at, decided_at, error', { count: 'exact' })
        .eq('organization_id', ctx.organizationId)
        .eq('action_type', 'w18.cash_receipt')
        .eq('payload->>associationId', ctx.associationId)
        .in('status', ['proposed', 'approved'])
        .order('proposed_at', { ascending: true })
        .range(0, PROPOSAL_WINDOW - 1),
    ),
    tryLoad('unmatched transactions', () =>
      pageBankTransactions(ctx.associationId, { matched: 'unmatched' }, pageRange(page, PAGE_SIZE)),
    ),
    tryLoad('chart of accounts', () => listAccounts(ctx.associationId)),
  ])

  const proposals = proposalsRes.ok ? (proposalsRes.data ?? []) : []
  const proposalTotal = proposalsRes.ok ? (proposalsRes.count ?? proposals.length) : 0
  const proposedTxnIds = new Set(proposals.map((p) => p.subject_id))
  // A transaction with a live proposal is handled in the section above, so
  // it isn't offered a second time below. "Confirm match" there would post
  // around the approval.
  const unmatched = unmatchedRes.ok ? unmatchedRes.data.rows.filter((t) => !proposedTxnIds.has(t.id)) : []
  const expenseOptions = accountsRes.ok
    ? accountsRes.data
        .filter((a) => a.account_type === 'expense' && a.is_active)
        .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.account_name}` }))
    : []

  // The latest W18 run for each transaction on this page, for its notes.
  const latestByTxn = new Map<string, { output: AiRunOutput | null }>()
  if (unmatched.length > 0) {
    const runs = await loadOrFail(
      'matcher notes',
      supabase
        .from('ai_runs')
        .select('input, output, created_at')
        .eq('workflow_id', 'W18')
        .in('input->>bankTransactionId', unmatched.map((t) => t.id))
        .order('created_at', { ascending: false }),
    )
    if (runs.ok) {
      for (const r of (runs.data ?? []) as unknown as { input: { bankTransactionId?: string } | null; output: AiRunOutput | null }[]) {
        const id = r.input?.bankTransactionId
        if (id && !latestByTxn.has(id)) latestByTxn.set(id, { output: r.output })
      }
    }
  }

  const unmatchedTotal = unmatchedRes.ok ? unmatchedRes.data.total : 0

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Matching queue"
      description="Bank transactions the automatic matcher couldn’t place on its own. Approve its suggestions, categorize expenses, or set aside what doesn’t belong in the books."
    >
      <section id="proposed-postings" aria-labelledby="proposals-title" className="scroll-mt-24">
        <Card className="overflow-hidden">
          <CardHeader actions={proposalsRes.ok && proposalTotal > 0 ? <StatusPill tone="ai" label={`${proposalTotal} waiting`} /> : undefined}>
            <CardTitle as="h2" id="proposals-title">
              Suggested matches
            </CardTitle>
            <CardDescription>
              The AI matcher paired these deposits with an open charge by memo code and amount. Nothing posts, and no charge is marked
              paid, until a board member approves.
            </CardDescription>
          </CardHeader>
          {!proposalsRes.ok ? (
            <div className="px-5 pb-5">
              <LoadFailed what="suggested matches" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="flex items-center gap-3 border-t border-border px-5 py-4 text-sm text-foreground-secondary">
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
              No suggestions waiting for approval.
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {proposals.map((p) => {
                const s = statusOf(PROPOSAL_STATUS, p.status)
                return (
                  <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={s.tone} label={s.label} size="sm" icon={p.status === 'proposed' ? <Sparkles aria-hidden /> : undefined} />
                        <span className="text-xs text-muted">Suggested {formatStamp(p.proposed_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{p.summary}</p>
                      {p.status === 'approved' ? (
                        <p className="text-sm text-danger">
                          Approved{p.decided_at ? ` ${formatStamp(p.decided_at)}` : ''}, but the posting didn’t finish. It won’t retry on its own
                          (that could post twice) — check the ledger, then resolve it by hand.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className="num text-base font-semibold text-success">{p.amount === null ? '—' : `+${usd(Number(p.amount))}`}</span>
                      {p.status === 'proposed' ? <ProposalActions approvalRequestId={p.id} summary={p.summary} /> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {proposalsRes.ok && proposalTotal > proposals.length ? (
            <div className="border-t border-border px-5 py-3 text-xs text-muted">
              Showing the oldest {proposals.length} of {proposalTotal}. Decide these and the rest move up.
            </div>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="unmatched-title">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle as="h2" id="unmatched-title">
              Unmatched transactions
            </CardTitle>
            <CardDescription>
              {unmatchedRes.ok ? `${plural(unmatchedTotal, 'transaction')} without a ledger entry, newest first.` : 'Transactions without a ledger entry.'}
            </CardDescription>
          </CardHeader>
          {!unmatchedRes.ok ? (
            <div className="px-5 pb-5">
              <LoadFailed what="unmatched transactions" />
            </div>
          ) : unmatched.length === 0 && unmatchedTotal === 0 ? (
            <EmptyState
              variant="compact"
              icon={<CheckCircle2 aria-hidden />}
              title="Everything is matched"
              description="Every bank transaction has a ledger entry. New ones land here only if the matcher can’t place them."
            />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {unmatched.map((t) => {
                const out = latestByTxn.get(t.id)?.output ?? null
                const amount = Number(t.amount)
                const isInbound = amount > 0
                const description = t.merchant ?? t.memo ?? 'No description'
                return (
                  <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-muted">
                        {formatDay(t.posted_date)} · {t.bank_account?.account_name ?? 'Unknown account'}
                      </p>
                      <p className="truncate text-sm font-medium text-foreground">{description}</p>
                      {t.merchant && t.memo ? <p className="truncate text-xs text-muted">{t.memo}</p> : null}
                      {out ? (
                        <p className="flex items-start gap-1.5 text-xs text-foreground-secondary">
                          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-fg" aria-hidden />
                          <span>
                            Matcher: {out.matchMethod ?? 'no method'}
                            {typeof out.confidence === 'number' ? ` · ${(out.confidence * 100).toFixed(0)}% confident` : ''}
                            {out.notes ? ` · ${out.notes}` : ''}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted">The matcher hasn’t looked at this yet — Re-match runs it now.</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className={`num text-base font-semibold ${isInbound ? 'text-success' : 'text-foreground'}`}>
                        {isInbound ? `+${usd(amount)}` : usd(amount)}
                      </span>
                      <DispositionActions
                        bankTransactionId={t.id}
                        hintedAssessmentId={out?.matchedAssessmentId ?? null}
                        expenseAccounts={expenseOptions}
                        isInbound={isInbound}
                        amount={amount}
                        description={description}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {unmatchedRes.ok && unmatchedTotal > PAGE_SIZE ? (
            <div className="border-t border-border">
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={unmatchedTotal}
                rowCount={unmatchedRes.data.rows.length}
                hrefFor={(p) => (p > 1 ? `/accounting/bank/queue?page=${p}` : '/accounting/bank/queue')}
                linkAs={Link}
                noun="transactions"
              />
            </div>
          ) : null}
        </Card>
      </section>

      {unmatchedRes.ok && unmatched.length === 0 && unmatchedTotal > 0 ? (
        <Alert variant="info">Every transaction on this page has a suggested match above.</Alert>
      ) : null}
    </Page>
  )
}
