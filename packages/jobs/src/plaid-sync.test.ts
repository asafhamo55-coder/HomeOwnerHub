import { describe, expect, it, vi } from 'vitest'
import { AiPausedError } from '@homeowner-portal/ai'
import {
  findUnreconciledTxnIds,
  runPlaidSync,
  syncOnePage,
  type PlaidSyncStep,
} from './plaid-sync'

// BL-112: with AI_PLATFORM_KILL_SWITCH on, W18's Step D throws
// AiPausedError (wrapped by defineWorkflow). plaid-sync must defer that
// transaction — the step returns normally (no Inngest retry loop), the row
// is NOT stamped (the next tick retries it), the rest of the batch still
// runs, and the log carries ids only.

function fakeDb() {
  const stamped: string[] = []
  const db = {
    from: (table: string) => {
      if (table === 'plaid_items') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: 'item-1',
                  organization_id: 'org-1',
                  association_id: 'a-1',
                  plaid_item_id: 'pi-1',
                  access_token: 'x',
                  sync_cursor: null,
                },
              ],
              error: null,
            }),
          }),
        }
      }
      if (table === 'bank_transactions') {
        return {
          update: () => ({
            eq: async (_c: string, id: string) => {
              stamped.push(id)
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db: db as never, stamped }
}

// The Plaid page and the unreconciled lookup are canned; only the W18 steps run.
const step: PlaidSyncStep = {
  run: async (id, fn) => {
    if (id.startsWith('sync-page-')) return { added: 0, modified: 0, removed: 0, hasMore: false }
    if (id.startsWith('find-unreconciled-')) return ['txn-paused', 'txn-exact']
    return fn()
  },
}

describe('runPlaidSync — AI paused', () => {
  it('defers the paused transaction, reconciles the rest, and logs ids only', async () => {
    const { db, stamped } = fakeDb()
    const logger = { warn: vi.fn(), info: vi.fn() }
    const w18 = {
      execute: vi.fn(async ({ bankTransactionId }: { bankTransactionId: string }) => {
        if (bankTransactionId === 'txn-paused') {
          throw new Error('workflow_W18_failed', { cause: new AiPausedError() })
        }
        return {}
      }),
    }
    const r = await runPlaidSync({} as never, db, step, logger, w18)
    expect(r).toMatchObject({ reconciled: 1, reconcileFailed: 0, reconcileDeferred: 1 })
    expect(stamped).toEqual(['txn-exact'])
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('[plaid-sync] AI paused; W18 deferred for txn-paused')
  })
})

// BL-175a M3/H2: every read and write is scoped by org (and item), so a Plaid
// account or transaction id that exists in another org is unreachable.
function recordingDb(tables: Record<string, { data: unknown }>) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, string, unknown]> }> = []
  const db = {
    from: (table: string) => {
      const entry = { table, op: 'select', filters: [] as Array<[string, string, unknown]> }
      calls.push(entry)
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => {
          entry.op = 'update'
          return chain
        },
        delete: () => {
          entry.op = 'delete'
          return chain
        },
        insert: () => chain,
        eq: (c: string, v: unknown) => {
          entry.filters.push(['eq', c, v])
          return chain
        },
        in: (c: string, v: unknown) => {
          entry.filters.push(['in', c, v])
          return chain
        },
        is: () => chain,
        single: async () => ({ data: { id: 'x' }, error: null }),
        maybeSingle: async () => ({ data: tables[table]?.data ?? null, error: null }),
        then: (r: (v: unknown) => unknown) =>
          r({ data: tables[table]?.data ?? [], error: null }),
      }
      return chain
    },
  }
  return { db: db as never, calls }
}

const logger = { warn: vi.fn(), info: vi.fn() }
const item = {
  id: 'item-1',
  organization_id: 'org-1',
  association_id: 'a-1',
  plaid_item_id: 'pi-1',
  access_token: 'x',
  sync_cursor: null,
}
const has = (f: Array<[string, string, unknown]>, c: string, v: unknown) =>
  f.some(([, col, val]) => col === c && val === v)

describe('plaid-sync tenant scoping', () => {
  it('scopes the account map and the update/delete by item and org', async () => {
    const { db, calls } = recordingDb({
      bank_accounts: { data: [{ id: 'ba-1', plaid_account_id: 'pa-1' }] },
      bank_transactions: { data: { id: 'bt-1', matched_journal_entry_id: null } },
    })
    const client = {
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [
            { account_id: 'pa-1', transaction_id: 't1', amount: 1, date: '2026-01-01', name: 'n' },
          ],
          removed: [{ transaction_id: 't2' }],
          next_cursor: 'c',
          has_more: false,
        },
      }),
    }
    await syncOnePage(client as never, db, item as never, logger)

    const acct = calls.find((c) => c.table === 'bank_accounts')!
    expect(has(acct.filters, 'plaid_item_id', 'pi-1')).toBe(true)
    expect(has(acct.filters, 'organization_id', 'org-1')).toBe(true)
    const upd = calls.find((c) => c.table === 'bank_transactions' && c.op === 'update')!
    expect(has(upd.filters, 'organization_id', 'org-1')).toBe(true)
    expect(has(upd.filters, 'bank_account_id', 'ba-1')).toBe(true)
    const del = calls.find((c) => c.table === 'bank_transactions' && c.op === 'delete')!
    expect(has(del.filters, 'organization_id', 'org-1')).toBe(true)
    const read = calls.filter((c) => c.table === 'bank_transactions' && c.op === 'select')
    expect(read.every((c) => has(c.filters, 'organization_id', 'org-1'))).toBe(true)
  })

  it('findUnreconciledTxnIds filters both queries by organization_id', async () => {
    const { db, calls } = recordingDb({ bank_accounts: { data: [{ id: 'ba-1' }] } })
    await findUnreconciledTxnIds(db, item, logger)
    const txn = calls.find((c) => c.table === 'bank_transactions')!
    expect(has(txn.filters, 'organization_id', 'org-1')).toBe(true)
    expect(has(calls.find((c) => c.table === 'bank_accounts')!.filters, 'organization_id', 'org-1')).toBe(true)
  })
})
