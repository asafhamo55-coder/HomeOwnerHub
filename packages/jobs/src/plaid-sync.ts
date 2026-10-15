import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { createAdminClient } from '@homeowner-portal/db'
import { bankReconciliationAgent } from '@homeowner-portal/workflows'
import { inngest } from './client'

/**
 * Every 4 hours: for each active plaid_items row, call
 * /transactions/sync, upsert new transactions into bank_transactions,
 * advance the sync_cursor, then run W18 against every bank_transaction
 * that is still unreconciled.
 *
 * Requires PLAID_CLIENT_ID + PLAID_SECRET in env. If missing the job
 * logs once and returns rather than throwing, so a missing key doesn't
 * red the Inngest runs panel.
 *
 * The plaid_items table is added by migration 0009_plaid_items.sql.
 * Until that migration is applied this job will skip with a clear log
 * message (the SELECT will return an error from the missing table).
 *
 * ── Why the page walk, the W18 fan-out, and the cursor write are no
 * longer one step.run ──
 *
 * `sync_cursor` is null until first sync (migrations/0009_plaid_items.sql),
 * and the exchange route never seeds it, so the very first firing per item
 * has no cursor — Plaid returns up to 24 months of history. The old code
 * walked every page, inserted every transaction, wrote the cursor, and then
 * ran W18 (which can make a paid LLM call) sequentially per new
 * transaction, all inside one `step.run`, under this app's 60s
 * `maxDuration`. A mid-run kill left the inserts committed but the loop
 * never reached the rest of the batch; on retry `sync_cursor` was still
 * null, so the page walk repeated and every already-inserted transaction
 * hit `bank_transactions.plaid_transaction_id`'s UNIQUE constraint (23505)
 * and was silently skipped — never reaching the W18 call list. Those
 * transactions then sat unreconciled forever, with the run reporting
 * success because the cursor eventually advanced.
 *
 * The fix has three parts:
 *   1. `syncOnePage` is bounded to a single Plaid page (`count: 500`, the
 *      API max) and persists the cursor after that one page, checking the
 *      write for an error and throwing if it fails — a 24-month backlog is
 *      walked one page per 4-hour tick instead of unboundedly in one step,
 *      and a cursor-write failure fails the run instead of being silently
 *      swallowed.
 *   2. W18 no longer runs inside the sync step at all. Reconciliation
 *      targets are found by querying `bank_transactions` directly for rows
 *      with `matched_journal_entry_id IS NULL` — not by trusting which
 *      inserts happened to be "new" in this pass. That makes an orphaned
 *      transaction (inserted, then never reconciled because the function
 *      died) just as reachable on the next run as it was on the run that
 *      inserted it, because it is found by what it still lacks rather than
 *      by when it arrived. `bank_transactions` has no "needs
 *      reconciliation" / "attempted" column to add without a migration,
 *      and `matched_journal_entry_id IS NULL` is already the schema's own
 *      signal for "not yet reconciled" (it already backs a partial index,
 *      `bank_transactions_unmatched_idx`).
 *   3. Each unreconciled transaction gets its own `step.run('w18-' + id,
 *      ...)`, so it has its own 60s budget and its own memoized retry —
 *      one transaction throwing can't prevent the others from running, in
 *      this tick or the next.
 *
 * Trade-off worth flagging: W18's Step B (fuzzy match) and Step D
 * (unmatched / LLM triage) intentionally never set
 * `matched_journal_entry_id` — they queue for human review instead. Those
 * rows look identical, to this query, to a transaction orphaned by a
 * crash: both are `matched_journal_entry_id IS NULL`. So a transaction
 * sitting in the manager queue awaiting a human will be re-submitted to
 * W18 (including a fresh Step D LLM call) on every 4-hour tick until a
 * human disposes of it, not just once. W18 is idempotent against this
 * (Step A/C no-op on an already-matched row; this one just isn't matched
 * yet), so it is not a correctness bug, but it is a recurring LLM cost for
 * a backlog of manual-review items. Fixing that cleanly needs a real
 * "reconciliation attempted" column — out of scope here per instruction
 * not to invent one; flagged for a follow-up migration instead.
 */
export const plaidSyncJob = inngest.createFunction(
  { id: 'plaid-sync', name: 'Plaid Transaction Sync' },
  { cron: 'TZ=America/New_York 0 */4 * * *' },
  async ({ step, logger }) => {
    const client = getPlaidClient()
    if (!client) {
      logger.warn('[plaid-sync] PLAID_CLIENT_ID/SECRET not set — skipping')
      return { skipped: true }
    }

    const db = createAdminClient()
    return runPlaidSync(client, db, step, logger)
  },
)

type Db = ReturnType<typeof createAdminClient>

/**
 * Deliberately NON-generic: Inngest's real `step.run` returns
 * `Jsonify<Awaited<T>>`, which is not assignable back to an arbitrary
 * `T`, so a generic signature fails structural typing against the real
 * step object. See mailbox-send.ts:27-32 and the same finding applied at
 * ticket-notifications.ts and recurring-jes.ts.
 */
export interface PlaidSyncStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

export interface PlaidSyncLogger {
  warn: (msg: string) => void
  info?: (msg: string) => void
}

/** Minimal slice of Plaid's `/transactions/sync` surface this job needs. */
export interface PlaidSyncTransaction {
  transaction_id: string
  account_id: string
  amount: number
  date: string
  name: string
  merchant_name?: string | null
}

export interface PlaidSyncRemoved {
  transaction_id?: string | null
}

export interface PlaidSyncPageData {
  added: PlaidSyncTransaction[]
  modified: PlaidSyncTransaction[]
  removed: PlaidSyncRemoved[]
  next_cursor: string
  has_more: boolean
}

export interface PlaidSyncClient {
  transactionsSync(args: {
    access_token: string
    cursor?: string
    count?: number
  }): Promise<{ data: PlaidSyncPageData }>
}

/** The W18 call this job fires per unreconciled transaction. Narrowed to
 *  exactly the shape `bankReconciliationAgent.execute` has, so a fake can
 *  be injected in tests without pulling in the real workflow (LLM calls,
 *  ai_runs audit rows, the full accounting schema). */
export interface PlaidSyncW18Runner {
  execute(
    input: { bankTransactionId: string },
    ctx: { organizationId: string },
  ): Promise<unknown>
}

export interface PlaidSyncResult {
  items: number
  added: number
  modified: number
  removed: number
  reconciled: number
  reconcileFailed: number
}

type ItemRow = {
  id: string
  organization_id: string
  association_id: string
  plaid_item_id: string
  access_token: string
  sync_cursor: string | null
}

/**
 * Runs the Plaid sync + W18 fan-out. Exported so it can be driven against
 * a real database with a fake Plaid client and a fake W18 runner. The
 * Inngest wrapper above is a thin shell: it resolves the Plaid client and
 * supplies the admin client, and holds no logic worth testing on its own.
 */
export async function runPlaidSync(
  client: PlaidSyncClient,
  db: Db,
  step: PlaidSyncStep,
  logger: PlaidSyncLogger,
  w18: PlaidSyncW18Runner = bankReconciliationAgent,
): Promise<PlaidSyncResult> {
  // SELECT via admin client (cron has no user session). The cast
  // unblocks types until 0009 is regenerated; the runtime query is
  // fully typed.
  const { data: items, error } = await db
    .from('plaid_items' as never)
    .select(
      'id, organization_id, association_id, plaid_item_id, access_token, sync_cursor',
    )
    .eq('is_active', true)

  if (error) {
    logger.warn(
      `[plaid-sync] read failed (apply migrations/0009_plaid_items.sql?): ${error.message}`,
    )
    return {
      items: 0,
      added: 0,
      modified: 0,
      removed: 0,
      reconciled: 0,
      reconcileFailed: 0,
    }
  }

  const rows = (items ?? []) as unknown as ItemRow[]

  let totalAdded = 0
  let totalModified = 0
  let totalRemoved = 0
  let totalReconciled = 0
  let totalReconcileFailed = 0

  for (const item of rows) {
    const page = (await step.run(`sync-page-${item.plaid_item_id}`, () =>
      syncOnePage(client, db, item, logger),
    )) as { added: number; modified: number; removed: number; hasMore: boolean }
    totalAdded += page.added
    totalModified += page.modified
    totalRemoved += page.removed

    const unreconciledIds = (await step.run(
      `find-unreconciled-${item.plaid_item_id}`,
      () => findUnreconciledTxnIds(db, item, logger),
    )) as string[]

    // One step per transaction: its own 60s budget, its own memoized
    // retry. A throw here is caught so one bad transaction can't stop
    // the rest of this tick's batch — it stays unreconciled and is
    // found again (and retried) on the next tick by the query above.
    for (const txnId of unreconciledIds) {
      try {
        await step.run(`w18-${txnId}`, () =>
          w18.execute({ bankTransactionId: txnId }, { organizationId: item.organization_id }),
        )
        totalReconciled += 1
      } catch (err) {
        totalReconcileFailed += 1
        logger.warn(
          `[plaid-sync] W18 failed for ${txnId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  return {
    items: rows.length,
    added: totalAdded,
    modified: totalModified,
    removed: totalRemoved,
    reconciled: totalReconciled,
    reconcileFailed: totalReconcileFailed,
  }
}

/**
 * One bounded page of `/transactions/sync` (`count: 500`, Plaid's max):
 * process `added`/`modified`/`removed`, then persist the advanced cursor.
 * Does NOT loop on `has_more` — a 24-month first sync is walked one page
 * per 4-hour tick rather than unboundedly inside a single 60s step. The
 * next tick picks up from the persisted cursor, so no page is ever
 * dropped; `hasMore` is returned for visibility/logging only.
 *
 * The cursor write is checked: on error this throws, which fails the
 * Inngest step (and therefore the run) instead of silently reporting
 * success with the cursor never having moved.
 */
async function syncOnePage(
  client: PlaidSyncClient,
  db: Db,
  item: ItemRow,
  logger: PlaidSyncLogger,
): Promise<{ added: number; modified: number; removed: number; hasMore: boolean }> {
  const resp = await client.transactionsSync({
    access_token: item.access_token,
    cursor: item.sync_cursor ?? undefined,
    count: 500,
  })
  const data = resp.data

  let added = 0
  let modified = 0
  let removed = 0

  // Map plaid account_id → our bank_accounts.id (cached for this page).
  const acctIds = new Set<string>()
  for (const t of [...data.added, ...data.modified]) acctIds.add(t.account_id)
  const { data: bankAccts } = await db
    .from('bank_accounts')
    .select('id, plaid_account_id')
    .in('plaid_account_id', [...acctIds])
  const bankIdByPlaid = new Map<string, string>(
    (bankAccts ?? [])
      .filter((r): r is { id: string; plaid_account_id: string } =>
        Boolean(r.plaid_account_id),
      )
      .map((r) => [r.plaid_account_id, r.id]),
  )

  // Added — insert with plaid_transaction_id unique. A 23505 means this
  // transaction already landed on a prior (killed/retried) pass — not an
  // error, just not new.
  for (const t of data.added) {
    const bankAccountId = bankIdByPlaid.get(t.account_id)
    if (!bankAccountId) continue
    const { error } = await db
      .from('bank_transactions')
      .insert({
        organization_id: item.organization_id,
        bank_account_id: bankAccountId,
        plaid_transaction_id: t.transaction_id,
        // Plaid amounts: positive = outbound from depository (e.g. card
        // swipe), negative = inbound. We invert so positive = inbound
        // money to align with the rest of the accounting code.
        amount: -t.amount,
        posted_date: t.date,
        memo: t.name,
        merchant: t.merchant_name ?? null,
      })
      .select('id')
      .single()
    if (!error) {
      added += 1
    } else if (error.code !== '23505') {
      logger.warn(`[plaid-sync] insert failed for ${t.transaction_id}: ${error.message}`)
    }
  }

  // Modified — update the few fields that can change post-pending.
  for (const t of data.modified) {
    const bankAccountId = bankIdByPlaid.get(t.account_id)
    if (!bankAccountId) continue
    const { error } = await db
      .from('bank_transactions')
      .update({
        amount: -t.amount,
        posted_date: t.date,
        memo: t.name,
        merchant: t.merchant_name ?? null,
      })
      .eq('plaid_transaction_id', t.transaction_id)
    if (!error) modified += 1
  }

  // Removed — Plaid retracts a pending txn. Our schema has no soft-
  // delete column for this; we hard-delete (it never produced a JE
  // since we hadn't matched it yet, by Plaid policy these are usually
  // pending-stage). Matched transactions are skipped to avoid orphan
  // JEs.
  for (const t of data.removed) {
    if (!t.transaction_id) continue
    const { data: existing } = await db
      .from('bank_transactions')
      .select('id, matched_journal_entry_id')
      .eq('plaid_transaction_id', t.transaction_id)
      .maybeSingle()
    if (existing && !existing.matched_journal_entry_id) {
      await db.from('bank_transactions').delete().eq('id', existing.id)
      removed += 1
    }
  }

  // Persist the new cursor + sync timestamp — checked, not swallowed.
  const { error: cursorErr } = await db
    .from('plaid_items' as never)
    .update({
      sync_cursor: data.next_cursor ?? null,
      last_synced_at: new Date().toISOString(),
    } as never)
    .eq('id', item.id)
  if (cursorErr) {
    throw new Error(
      `[plaid-sync] cursor write failed for item ${item.id}: ${cursorErr.message}`,
    )
  }

  return { added, modified, removed, hasMore: data.has_more }
}

/**
 * Finds reconciliation targets by what they still lack
 * (`matched_journal_entry_id IS NULL`), not by which inserts happened to
 * be new in this pass — so a transaction inserted on an earlier, killed
 * run is just as reachable here as one inserted this tick. Scoped to this
 * item's bank accounts via `bank_accounts.plaid_item_id`, which already
 * carries Plaid's item id (migration 0006_accounting.sql) — no join
 * through `plaid_items` needed.
 */
async function findUnreconciledTxnIds(
  db: Db,
  item: { plaid_item_id: string },
  logger: PlaidSyncLogger,
): Promise<string[]> {
  const { data: accts, error: acctErr } = await db
    .from('bank_accounts')
    .select('id')
    .eq('plaid_item_id', item.plaid_item_id)
  if (acctErr) {
    logger.warn(`[plaid-sync] bank_accounts lookup failed: ${acctErr.message}`)
    return []
  }
  const acctIds = (accts ?? []).map((a) => a.id)
  if (acctIds.length === 0) return []

  const { data: txns, error } = await db
    .from('bank_transactions')
    .select('id')
    .in('bank_account_id', acctIds)
    .is('matched_journal_entry_id', null)
  if (error) {
    logger.warn(`[plaid-sync] unreconciled lookup failed: ${error.message}`)
    return []
  }
  return (txns ?? []).map((t) => t.id)
}

// Local client singleton — duplicated from apps/hoa/src/lib/plaid.ts
// since the jobs package can't depend on the app.
let _client: PlaidApi | null = null
function getPlaidClient(): PlaidApi | null {
  if (_client) return _client
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) return null
  const envName = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  const config = new Configuration({
    basePath: PlaidEnvironments[envName] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret },
    },
  })
  _client = new PlaidApi(config)
  return _client
}
