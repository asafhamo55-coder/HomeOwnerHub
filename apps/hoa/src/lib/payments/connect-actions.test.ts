import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, orgId: 'org-1' })),
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.test${p}` }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) q[m] = () => q
      q.limit = async () => ({ data: [{ id: 'assoc-1', name: 'Maple Grove', state: 'GA' }], error: null })
      return q
    },
  })),
}))

import { saveOnlinePaymentSettings } from './connect-actions'
import type { UntypedDb } from './connect-store'

const updates: Array<Record<string, unknown>> = []

function fakeDb(): UntypedDb {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'insert']) q[m] = () => q
      q.update = (patch: Record<string, unknown>) => {
        if (table === 'association_stripe_accounts') updates.push(patch)
        return q
      }
      q.maybeSingle = async () => ({
        data: {
          id: 'r1',
          organization_id: 'org-1',
          association_id: 'assoc-1',
          stripe_account_id: 'acct_x',
          charges_enabled: true,
          payouts_enabled: true,
          card_fee_acknowledged_at: '2026-11-01T00:00:00Z',
        },
        error: null,
      })
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok)
      return q
    },
  } as unknown as UntypedDb
}

const input = { onlinePaymentsEnabled: true, achFeePayer: 'association', cardFeePayer: 'homeowner', returnedPaymentFeeCents: null, acknowledgeCardFee: true }

beforeEach(() => {
  updates.length = 0
})

describe('saveOnlinePaymentSettings and the clearing accounts', () => {
  it('creates 1015 and 6150 before the switch goes on', async () => {
    const ensure = vi.fn(async () => true)
    const res = await saveOnlinePaymentSettings(input, { db: fakeDb(), ensureAccounts: ensure })
    expect(res).toEqual({ ok: true })
    expect(ensure).toHaveBeenCalledWith(expect.anything(), 'org-1', 'assoc-1')
    expect(updates[0]).toMatchObject({ online_payments_enabled: true })
  })

  it('keeps the switch off when the books are not set up', async () => {
    const res = await saveOnlinePaymentSettings(input, { db: fakeDb(), ensureAccounts: async () => false })
    expect(res.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('keeps the switch off when creating the accounts fails', async () => {
    const res = await saveOnlinePaymentSettings(input, {
      db: fakeDb(),
      ensureAccounts: async () => {
        throw new Error('chart insert failed')
      },
    })
    expect(res.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('does not touch the books when turning payments off', async () => {
    const ensure = vi.fn(async () => true)
    const res = await saveOnlinePaymentSettings({ ...input, onlinePaymentsEnabled: false }, { db: fakeDb(), ensureAccounts: ensure })
    expect(res).toEqual({ ok: true })
    expect(ensure).not.toHaveBeenCalled()
  })
})
