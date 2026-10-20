import { describe, expect, it, vi } from 'vitest'
import { AiPausedError } from '@homeowner-portal/ai'
import { runPlaidSync, type PlaidSyncStep } from './plaid-sync'

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
