/**
 * plaid-sync: the partial-state / orphaned-reconciliation bug.
 *
 * plaidSyncJob was registered in serve() today after sitting dormant
 * since it was written, so its 4-hour cron now actually fires. Review
 * found that the old code ran the full Plaid page walk, the inserts, the
 * cursor write, AND W18 (which can make a paid LLM call) sequentially per
 * new transaction, all inside one `step.run`, under this app's 60s
 * `maxDuration`. A mid-run kill left transactions inserted but never
 * reconciled — and because reconciliation targets were "whichever inserts
 * happened to be new this pass" rather than a durable query, a killed run
 * lost those transactions to W18 forever: `plaid_transaction_id` is
 * UNIQUE, so a retry's re-insert hits 23505, is skipped, and never
 * rejoins the new-transaction list. The run reports success because the
 * cursor still advances.
 *
 * These tests seed bank_transactions directly (simulating "already
 * inserted by an earlier, killed run") rather than going through Plaid's
 * sync response, since the bug and its fix live entirely in how
 * reconciliation TARGETS are found, independent of how the rows arrived.
 *
 * Asserted against real Postgres: `matched_journal_entry_id`'s FK to
 * journal_entries and the unreconciled lookup are both exercised for
 * real, not mocked.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { postJournalEntry } from '../../../packages/db/src'
import {
  runPlaidSync,
  type PlaidSyncClient,
  type PlaidSyncLogger,
  type PlaidSyncPageData,
  type PlaidSyncStep,
  type PlaidSyncW18Runner,
} from '../../../packages/jobs/src/plaid-sync'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  type AccountingRefs,
  type Db,
  type OrgFixture,
} from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

/** Steps execute inline, exactly once — see the same fake at
 *  ticket-notifications.test.ts:16-19 / recurring-jes.test.ts:24-26. */
function inlineStep(): PlaidSyncStep {
  return { run: async (_id, fn) => fn() }
}

/** Same as inlineStep, but records every step id passed to `run` — used
 *  to prove each transaction gets its OWN step id, not a shared one. */
function recordingStep(): PlaidSyncStep & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    run: async (id, fn) => {
      calls.push(id)
      return fn()
    },
  }
}

function collectingLogger(): PlaidSyncLogger & { warnings: string[] } {
  const warnings: string[] = []
  return { warn: (m: string) => { warnings.push(m) }, warnings }
}

/** A Plaid client that returns one empty, already-caught-up page. These
 *  tests are about finding EXISTING unreconciled transactions, not about
 *  the page walk, so the sync step should be a no-op pass-through. */
function emptyPagePlaidClient(nextCursor = `cursor-${randomUUID()}`): PlaidSyncClient {
  const data: PlaidSyncPageData = {
    added: [],
    modified: [],
    removed: [],
    next_cursor: nextCursor,
    has_more: false,
  }
  return { transactionsSync: async () => ({ data }) }
}

/**
 * Wraps a real Db so that `plaid_items` updates (the cursor +
 * last_synced_at write) fail, while every other table passes through
 * untouched. Simulates a real Postgres error on that one write without
 * needing to break the schema itself.
 */
function dbWithFailingCursorWrite(real: Db): Db {
  const realFrom = real.from.bind(real)
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver)
      return (table: never) => {
        const builder = realFrom(table)
        if (table !== ('plaid_items' as never)) return builder
        return new Proxy(builder, {
          get(bTarget, bProp, bReceiver) {
            if (bProp !== 'update') return Reflect.get(bTarget, bProp, bReceiver)
            return () => ({
              eq: async () => ({
                data: null,
                error: { message: 'simulated cursor write failure', code: 'TEST500' },
              }),
            })
          },
        })
      }
    },
  }) as Db
}

async function seedPlaidItem(
  org: OrgFixture,
  plaidItemId: string,
  syncCursor: string | null,
): Promise<string> {
  const { data, error } = await adminDb()
    .from('plaid_items')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      plaid_item_id: plaidItemId,
      access_token: 'test-access-token',
      sync_cursor: syncCursor,
      is_active: true,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedPlaidItem failed: ${error?.message}`)
  return data.id
}

async function seedBankAccount(org: OrgFixture, fundId: string, plaidItemId: string): Promise<string> {
  const { data, error } = await adminDb()
    .from('bank_accounts')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      fund_id: fundId,
      plaid_item_id: plaidItemId,
      plaid_account_id: `plaid-acct-${randomUUID()}`,
      account_name: 'Test Checking',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedBankAccount failed: ${error?.message}`)
  return data.id
}

/** A bank_transaction with matched_journal_entry_id left NULL — exactly
 *  the state an inserted-but-never-reconciled row is left in by the bug. */
async function seedUnreconciledTxn(org: OrgFixture, bankAccountId: string): Promise<string> {
  const { data, error } = await adminDb()
    .from('bank_transactions')
    .insert({
      organization_id: org.orgId,
      bank_account_id: bankAccountId,
      plaid_transaction_id: `txn-${randomUUID()}`,
      amount: 100,
      posted_date: '2026-10-01',
      memo: 'test memo',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedUnreconciledTxn failed: ${error?.message}`)
  return data.id
}

/** A real, balanced, posted JE to use as the FK target when the fake W18
 *  runner "reconciles" a transaction. */
async function seedJournalEntry(org: OrgFixture, acct: AccountingRefs): Promise<string> {
  const je = await postJournalEntry(adminDb(), {
    organizationId: org.orgId,
    associationId: org.associationId,
    fiscalPeriodId: acct.fiscalPeriodId,
    entryDate: '2026-10-01',
    memo: 'bank rec test JE',
    source: 'bank_rec',
    lines: [
      { accountId: acct.accountIds['1010'], fundId: acct.fundIds.OPERATING, debit: 100, credit: 0 },
      { accountId: acct.accountIds['4000'], fundId: acct.fundIds.OPERATING, debit: 0, credit: 100 },
    ],
  })
  if (!je.ok) throw new Error(`seedJournalEntry failed: ${je.error}`)
  return je.journalEntryId
}

/** A fake W18 runner: "reconciles" (sets matched_journal_entry_id) every
 *  transaction NOT in `throwFor`, and throws for each one that is —
 *  simulating the 60s kill landing mid-loop on a specific transaction. */
function fakeW18(opts: { jeId: string; throwFor: Set<string> }): PlaidSyncW18Runner & { executed: string[] } {
  const executed: string[] = []
  return {
    executed,
    async execute(input) {
      executed.push(input.bankTransactionId)
      if (opts.throwFor.has(input.bankTransactionId)) {
        throw new Error(`simulated 60s kill reconciling ${input.bankTransactionId}`)
      }
      const { error } = await adminDb()
        .from('bank_transactions')
        .update({
          matched_journal_entry_id: opts.jeId,
          match_method: 'auto_exact',
          match_confidence: 1,
        })
        .eq('id', input.bankTransactionId)
      if (error) throw new Error(`fakeW18: update failed: ${error.message}`)
      return { matchMethod: 'auto_exact' }
    },
  }
}

async function matchedIds(txnIds: string[]): Promise<Set<string>> {
  const { data } = await adminDb()
    .from('bank_transactions')
    .select('id, matched_journal_entry_id')
    .in('id', txnIds)
  return new Set((data ?? []).filter((r) => r.matched_journal_entry_id).map((r) => r.id))
}

/**
 * Like fakeW18, but lets each transaction's outcome be chosen explicitly —
 * needed to distinguish the two states migration 0057 exists to tell
 * apart:
 *   - 'match'   mirrors W18 Step A/C: sets matched_journal_entry_id.
 *   - 'decline' mirrors Step B/D leaving a row for human review: execute()
 *     returns successfully but matched_journal_entry_id stays NULL.
 *   - 'throw'   simulates a kill or a genuine W18 failure mid-step.
 * Any transaction not named in `outcomes` is NOT called at all — the
 * query is expected to have already filtered it out — so a test asserts
 * "not resubmitted" via `executed`, not via outcome.
 */
function fakeW18WithOutcomes(opts: {
  jeId: string
  outcomes: Record<string, 'match' | 'decline' | 'throw'>
}): PlaidSyncW18Runner & { executed: string[] } {
  const executed: string[] = []
  return {
    executed,
    async execute(input) {
      executed.push(input.bankTransactionId)
      const outcome = opts.outcomes[input.bankTransactionId] ?? 'match'
      if (outcome === 'throw') {
        throw new Error(`simulated failure reconciling ${input.bankTransactionId}`)
      }
      if (outcome === 'match') {
        const { error } = await adminDb()
          .from('bank_transactions')
          .update({
            matched_journal_entry_id: opts.jeId,
            match_method: 'auto_exact',
            match_confidence: 1,
          })
          .eq('id', input.bankTransactionId)
        if (error) throw new Error(`fakeW18: update failed: ${error.message}`)
      }
      // 'decline': deliberately does not touch matched_journal_entry_id.
      return { matchMethod: outcome === 'match' ? 'auto_exact' : null }
    },
  }
}

/** Reads reconciliation_attempted_at for a set of transactions, keyed by id. */
async function attemptedAtById(txnIds: string[]): Promise<Map<string, string | null>> {
  const { data } = await adminDb()
    .from('bank_transactions')
    .select('id, reconciliation_attempted_at')
    .in('id', txnIds)
  return new Map((data ?? []).map((r) => [r.id, r.reconciliation_attempted_at]))
}

describe('plaid-sync', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  // The headline bug. Three transactions are already sitting unreconciled
  // (as if inserted by an earlier, killed run). The W18 runner throws for
  // the middle one, simulating the 60s kill landing on it. Before the
  // fix, reconciliation targets came from "new transactions this pass" —
  // these three are NOT new this pass (they're pre-seeded), so the old
  // code would never call W18 for any of them at all. After the fix,
  // targets come from querying bank_transactions for
  // matched_journal_entry_id IS NULL, so all three are found, one throws
  // and is skipped, and the other two succeed in the SAME run. A second
  // run then finds only the still-unreconciled one and reconciles it too.
  it('a W18 throw partway through does not strand the other transactions, and a second run reconciles the survivor', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const jeId = await seedJournalEntry(org, acct)

    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, `cursor-${randomUUID()}`)
    const bankAccountId = await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)

    const txnIds = [
      await seedUnreconciledTxn(org, bankAccountId),
      await seedUnreconciledTxn(org, bankAccountId),
      await seedUnreconciledTxn(org, bankAccountId),
    ]
    const killId = txnIds[1]

    const client = emptyPagePlaidClient()
    const logger = collectingLogger()

    // Run 1: the middle transaction's W18 call throws.
    const run1W18 = fakeW18({ jeId, throwFor: new Set([killId]) })
    const result1 = await runPlaidSync(client, adminDb(), inlineStep(), logger, run1W18)

    expect(result1.reconciled, 'two of three should reconcile despite one throw').toBe(2)
    expect(result1.reconcileFailed).toBe(1)

    const matchedAfterRun1 = await matchedIds(txnIds)
    expect(matchedAfterRun1.has(killId), 'the thrown transaction must not be marked reconciled').toBe(false)
    expect(matchedAfterRun1.has(txnIds[0])).toBe(true)
    expect(matchedAfterRun1.has(txnIds[2])).toBe(true)

    // Run 2: nothing throws this time. The orphan from run 1 must still
    // be findable — this is the core claim under test.
    const run2W18 = fakeW18({ jeId, throwFor: new Set() })
    const result2 = await runPlaidSync(client, adminDb(), inlineStep(), logger, run2W18)

    expect(result2.reconciled, 'the surviving orphan should reconcile on retry').toBe(1)
    expect(result2.reconcileFailed).toBe(0)
    // Only the orphan should be re-submitted — the two already-matched
    // transactions must not be re-sent to W18.
    expect(run2W18.executed).toEqual([killId])

    const matchedAfterRun2 = await matchedIds(txnIds)
    expect(matchedAfterRun2.size, 'all three transactions must end up reconciled').toBe(3)
  })

  // Requirement: each transaction gets its own step id, so Inngest can
  // retry one independently of the others.
  it('gives each transaction its own w18 step id', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const jeId = await seedJournalEntry(org, acct)
    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, `cursor-${randomUUID()}`)
    const bankAccountId = await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)

    const txnIds = [
      await seedUnreconciledTxn(org, bankAccountId),
      await seedUnreconciledTxn(org, bankAccountId),
    ]

    const step = recordingStep()
    await runPlaidSync(
      emptyPagePlaidClient(),
      adminDb(),
      step,
      collectingLogger(),
      fakeW18({ jeId, throwFor: new Set() }),
    )

    for (const id of txnIds) {
      expect(step.calls).toContain(`w18-${id}`)
    }
    // Distinct ids, not a shared/batched one.
    expect(new Set(step.calls).size).toBe(step.calls.length)
  })

  // Requirement: a cursor-write failure must fail the run, not report
  // success with the cursor silently un-advanced.
  it('reports a cursor-write failure as a failure, not a success', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, null)
    await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)

    const failingDb = dbWithFailingCursorWrite(adminDb())

    await expect(
      runPlaidSync(
        emptyPagePlaidClient(),
        failingDb,
        inlineStep(),
        collectingLogger(),
        fakeW18({ jeId: randomUUID(), throwFor: new Set() }),
      ),
    ).rejects.toThrow(/cursor write failed/)
  })

  // The cost leak migration 0057 exists to close. Before the fix, "found by
  // matched_journal_entry_id IS NULL" could not tell a declined row (W18
  // ran, found nothing confident, queued it for human review) apart from
  // one that was never attempted — so the whole human-review backlog was
  // re-submitted to W18 (including a fresh paid Step D LLM call) on every
  // 4-hour tick. This must fail against the pre-fix query (no
  // reconciliation_attempted_at filter) and pass once that filter — and the
  // post-execute stamp — are in place.
  it('a transaction W18 declines (left unmatched, attempt stamped) is not re-submitted on the next run', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const jeId = await seedJournalEntry(org, acct)
    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, `cursor-${randomUUID()}`)
    const bankAccountId = await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)

    const declinedId = await seedUnreconciledTxn(org, bankAccountId)

    const client = emptyPagePlaidClient()
    const logger = collectingLogger()

    // Run 1: W18 declines — this is Step B/D's legitimate "queue for human
    // review" outcome, not a throw.
    const run1 = fakeW18WithOutcomes({ jeId, outcomes: { [declinedId]: 'decline' } })
    const result1 = await runPlaidSync(client, adminDb(), inlineStep(), logger, run1)
    expect(run1.executed).toEqual([declinedId])
    expect(result1.reconciled, 'a non-throwing decline counts as a completed attempt').toBe(1)

    const matchedAfterRun1 = await matchedIds([declinedId])
    expect(matchedAfterRun1.has(declinedId), 'a decline must not set matched_journal_entry_id').toBe(false)

    const attemptedAfterRun1 = await attemptedAtById([declinedId])
    expect(
      attemptedAfterRun1.get(declinedId),
      'the attempt must be stamped even though W18 declined to match',
    ).not.toBeNull()

    // Run 2: the declined row is still matched_journal_entry_id IS NULL —
    // exactly what made this ambiguous pre-fix. It must NOT be
    // re-submitted now that an attempt is on record.
    const run2 = fakeW18WithOutcomes({ jeId, outcomes: {} })
    await runPlaidSync(client, adminDb(), inlineStep(), logger, run2)
    expect(run2.executed, 'a declined transaction must not be resubmitted to W18').toEqual([])
  })

  // The regression guard for the resumability the prior fix bought: a
  // transaction whose W18 step genuinely throws (kill, transient failure)
  // must stay unstamped and be retried on the next run. If the stamp
  // ordering were wrong (e.g. stamped before execute(), or in a step that
  // always completes), this test would catch it going red.
  it('a transaction whose W18 step threw is retried on the next run', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const jeId = await seedJournalEntry(org, acct)
    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, `cursor-${randomUUID()}`)
    const bankAccountId = await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)
    const txnId = await seedUnreconciledTxn(org, bankAccountId)

    const client = emptyPagePlaidClient()
    const logger = collectingLogger()

    const run1 = fakeW18WithOutcomes({ jeId, outcomes: { [txnId]: 'throw' } })
    const result1 = await runPlaidSync(client, adminDb(), inlineStep(), logger, run1)
    expect(result1.reconcileFailed).toBe(1)

    const attemptedAfterThrow = await attemptedAtById([txnId])
    expect(attemptedAfterThrow.get(txnId), 'a thrown step must NOT be stamped').toBeNull()

    // Run 2: nothing throws now — the surviving orphan must still be found.
    const run2 = fakeW18WithOutcomes({ jeId, outcomes: {} })
    const result2 = await runPlaidSync(client, adminDb(), inlineStep(), logger, run2)
    expect(run2.executed, 'the thrown transaction must be retried').toEqual([txnId])
    expect(result2.reconciled).toBe(1)
  })

  // Requirement: a human/operator can force W18 to look again at a
  // declined transaction simply by clearing the new column — nothing else
  // should gate that.
  it('clearing reconciliation_attempted_at re-queues a declined transaction', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const jeId = await seedJournalEntry(org, acct)
    const plaidItemId = `item-${randomUUID()}`
    await seedPlaidItem(org, plaidItemId, `cursor-${randomUUID()}`)
    const bankAccountId = await seedBankAccount(org, acct.fundIds.OPERATING, plaidItemId)
    const txnId = await seedUnreconciledTxn(org, bankAccountId)

    const client = emptyPagePlaidClient()
    const logger = collectingLogger()

    const run1 = fakeW18WithOutcomes({ jeId, outcomes: { [txnId]: 'decline' } })
    await runPlaidSync(client, adminDb(), inlineStep(), logger, run1)
    expect(run1.executed).toEqual([txnId])

    const run2 = fakeW18WithOutcomes({ jeId, outcomes: {} })
    await runPlaidSync(client, adminDb(), inlineStep(), logger, run2)
    expect(run2.executed, 'sanity check: declined row is skipped before clearing').toEqual([])

    // An operator (or a human-review tool) forces a retry by clearing the
    // attempt timestamp. Nothing else should block this.
    const { error } = await adminDb()
      .from('bank_transactions')
      .update({ reconciliation_attempted_at: null })
      .eq('id', txnId)
    expect(error).toBeNull()

    const run3 = fakeW18WithOutcomes({ jeId, outcomes: {} })
    await runPlaidSync(client, adminDb(), inlineStep(), logger, run3)
    expect(
      run3.executed,
      'clearing the attempt timestamp must be sufficient to re-queue the transaction',
    ).toEqual([txnId])
  })
})
