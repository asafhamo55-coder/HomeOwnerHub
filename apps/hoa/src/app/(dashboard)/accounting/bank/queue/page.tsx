import { ListChecks, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { BackLink, Badge, Card, EmptyState, PageHeader } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listAccounts,
  listBankTransactions,
} from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DispositionActions } from './DispositionActions'
import { ProposalActions } from './ProposalActions'

export const metadata = { title: 'Reconciliation Queue' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface AiRunOutput {
  matchMethod?: string
  matchedAssessmentId?: string | null
  confidence?: number
  notes?: string
}

export default async function ReconciliationQueuePage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<ListChecks className="h-10 w-10" aria-hidden />}
          title="Reconciliation queue empty"
          description="Run pnpm seed:accounting and link a bank account before the queue lights up."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  const [allUnmatched, accounts, proposalsRes] = await Promise.all([
    listBankTransactions(ctx.associationId, { matched: 'unmatched', limit: 200 }),
    listAccounts(ctx.associationId),
    // Postings W18 proposed (sub-project D). 'approved' only shows up here if
    // posting didn't finish. That row stays blocked rather than being re-posted
    // automatically, so an operator has to resolve it by hand.
    supabase
      .from('approval_requests')
      .select('id, subject_id, summary, amount, status, proposed_at, decided_at, error')
      .eq('organization_id', ctx.organizationId)
      .eq('action_type', 'w18.cash_receipt')
      .eq('payload->>associationId', ctx.associationId)
      .in('status', ['proposed', 'approved'])
      .order('proposed_at', { ascending: true })
      .limit(200),
  ])
  const proposals = proposalsRes.data ?? []
  const proposedTxnIds = new Set(proposals.map((p) => p.subject_id))
  // A transaction with a live proposal is handled in the section above, so
  // it isn't offered a second time below. "Confirm match" there would post
  // around the approval.
  const unmatched = allUnmatched.filter((t) => !proposedTxnIds.has(t.id))
  const expenseOptions = accounts
    .filter((a) => a.account_type === 'expense' && a.is_active)
    .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.account_name}` }))

  // For each unmatched txn, pull its most-recent W18 run from ai_runs so
  // we can surface the workflow's notes/hint without re-firing it.
  // Single round-trip — we filter in memory.
  const { data: runs } = await supabase
    .from('ai_runs')
    .select('id, workflow_id, input, output, confidence, created_at')
    .eq('workflow_id', 'W18')
    .order('created_at', { ascending: false })
    .limit(500)

  type RunRow = {
    id: string
    input: { bankTransactionId?: string } | null
    output: AiRunOutput | null
    confidence: number | null
    created_at: string
  }
  const latestByTxn = new Map<string, RunRow>()
  for (const r of (runs ?? []) as unknown as RunRow[]) {
    const txnId = r.input?.bankTransactionId
    if (!txnId) continue
    if (!latestByTxn.has(txnId)) latestByTxn.set(txnId, r)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <BackLink href="/accounting/bank" label="Bank Accounts" />
        <PageHeader
          title="Reconciliation Queue"
          description={`${unmatched.length} transaction${unmatched.length === 1 ? '' : 's'} waiting on a human. The W18 agent's reasoning is shown for each row — confirm, edit, or post manually.`}
        />
      </div>

      {proposals.length > 0 ? (
        <section className="space-y-2" aria-labelledby="proposed-postings">
          <h2 id="proposed-postings" className="text-base font-semibold text-foreground">
            Proposed postings awaiting approval
          </h2>
          <p className="text-sm text-muted">
            W18 matched these deposits to an open assessment by memo code and
            amount. Nothing is posted and no assessment is marked paid until a
            board member or admin approves. Rejecting records your reason.
          </p>
          <Card>
            <ul className="divide-y divide-border">
              {proposals.map((p) => (
                <li key={p.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs text-muted">
                          proposed {format(new Date(p.proposed_at), 'MMM d, yyyy')}
                        </span>
                        <Badge variant={p.status === 'proposed' ? 'outline' : 'warning'} size="sm">
                          {p.status === 'proposed' ? 'awaiting approval' : 'approved, posting incomplete'}
                        </Badge>
                      </div>
                      <p className="mt-1 font-medium text-foreground">{p.summary}</p>
                      {p.status === 'approved' ? (
                        <p className="mt-1 text-xs text-muted">
                          Approved{p.decided_at ? ` ${format(new Date(p.decided_at), 'MMM d, yyyy')}` : ''}, but the posting didn&apos;t finish.
                          It won&apos;t be retried automatically because that could post twice. Check the ledger before you resolve it by hand.
                          {p.error ? ` (${p.error})` : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-base text-emerald-600">
                        {p.amount === null ? '—' : currency(Number(p.amount))}
                      </span>
                      {p.status === 'proposed' ? (
                        <ProposalActions approvalRequestId={p.id} />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {unmatched.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" aria-hidden />}
          title="Inbox zero"
          description="Every transaction in the last 200 has been matched. Nice."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {unmatched.map((t) => {
              const run = latestByTxn.get(t.id)
              const out = run?.output ?? null
              const isInbound = Number(t.amount) > 0
              return (
                <li key={t.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs text-muted">
                          {format(new Date(t.posted_date), 'MMM d, yyyy')}
                        </span>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-muted">
                          {t.bank_account?.account_name ?? '—'}
                        </span>
                        <Badge
                          variant={isInbound ? 'success' : 'outline'}
                          size="sm"
                        >
                          {isInbound ? 'inbound' : 'outbound'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate font-medium text-foreground">
                        {t.memo ?? t.merchant ?? '(no memo)'}
                      </p>
                      {t.merchant && t.memo ? (
                        <p className="text-xs text-muted">
                          merchant: {t.merchant}
                        </p>
                      ) : null}
                      {out ? (
                        <p className="mt-2 inline-flex items-start gap-1 text-xs text-muted">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span>
                            <span className="font-mono">{out.matchMethod ?? 'unknown'}</span>
                            {typeof out.confidence === 'number' ? (
                              <span className="ml-1">
                                · conf {(out.confidence * 100).toFixed(0)}%
                              </span>
                            ) : null}
                            {out.notes ? <span> · {out.notes}</span> : null}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted">
                          no W18 run yet — click re-match to fire the agent.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span
                        className={`font-mono text-base ${isInbound ? 'text-emerald-600' : 'text-destructive'}`}
                      >
                        {currency(Number(t.amount))}
                      </span>
                      <DispositionActions
                        bankTransactionId={t.id}
                        hintedAssessmentId={
                          (out as { matchedAssessmentId?: string | null } | null)?.matchedAssessmentId ??
                          null
                        }
                        expenseAccounts={expenseOptions}
                        isInbound={isInbound}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
