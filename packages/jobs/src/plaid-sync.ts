import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { createAdminClient } from '@homeowner-portal/db'
import { bankReconciliationAgent } from '@homeowner-portal/workflows'
import { inngest } from './client'

/**
 * Every 4 hours: for each active plaid_items row, call
 * /transactions/sync, upsert new transactions into bank_transactions,
 * advance the sync_cursor, and fire W18 against every new transaction
 * so auto-match runs without a separate kick.
 *
 * Requires PLAID_CLIENT_ID + PLAID_SECRET in env. If missing the job
 * logs once and returns rather than throwing, so a missing key doesn't
 * red the Inngest runs panel.
 *
 * The plaid_items table is added by migration 0009_plaid_items.sql.
 * Until that migration is applied this job will skip with a clear log
 * message (the SELECT will return an error from the missing table).
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
      return { items: 0, synced: 0, error: error.message }
    }

    type ItemRow = {
      id: string
      organization_id: string
      association_id: string
      plaid_item_id: string
      access_token: string
      sync_cursor: string | null
    }
    const rows = (items ?? []) as unknown as ItemRow[]

    let totalAdded = 0
    let totalModified = 0
    let totalRemoved = 0

    for (const item of rows) {
      const result = await step.run(`sync-${item.plaid_item_id}`, async () => {
        return syncOneItem(client, db, item, logger)
      })
      totalAdded += result.added
      totalModified += result.modified
      totalRemoved += result.removed
    }

    return {
      items: rows.length,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    }
  },
)

type Db = ReturnType<typeof createAdminClient>
type Logger = { warn: (msg: string) => void; info?: (msg: string) => void }

async function syncOneItem(
  client: PlaidApi,
  db: Db,
  item: {
    id: string
    organization_id: string
    association_id: string
    plaid_item_id: string
    access_token: string
    sync_cursor: string | null
  },
  logger: Logger,
): Promise<{ added: number; modified: number; removed: number }> {
  // Walk pages of /transactions/sync until has_more=false.
  let cursor = item.sync_cursor ?? undefined
  let added = 0
  let modified = 0
  let removed = 0
  const newTransactionIds: string[] = []

  while (true) {
    const resp = await client.transactionsSync({
      access_token: item.access_token,
      cursor,
    })
    const data = resp.data

    // Map plaid account_id → our bank_accounts.id (cached per page).
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

    // Added — insert with plaid_transaction_id unique.
    for (const t of data.added) {
      const bankAccountId = bankIdByPlaid.get(t.account_id)
      if (!bankAccountId) continue
      const { data: inserted, error } = await db
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
      if (!error && inserted) {
        added += 1
        newTransactionIds.push(inserted.id)
      } else if (error && error.code !== '23505') {
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

    cursor = data.next_cursor
    if (!data.has_more) break
  }

  // Persist the new cursor + sync timestamp.
  await db
    .from('plaid_items' as never)
    .update({
      sync_cursor: cursor ?? null,
      last_synced_at: new Date().toISOString(),
    } as never)
    .eq('id', item.id)

  // Fire W18 against each newly-added transaction so auto-match runs
  // without waiting on the next manual queue visit. Done sequentially
  // so one bad txn can't 500 the whole batch.
  for (const txnId of newTransactionIds) {
    try {
      await bankReconciliationAgent.execute(
        { bankTransactionId: txnId },
        { organizationId: item.organization_id },
      )
    } catch (err) {
      logger.warn(
        `[plaid-sync] W18 failed for ${txnId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return { added, modified, removed }
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
