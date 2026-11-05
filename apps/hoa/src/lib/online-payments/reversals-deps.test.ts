import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('@/lib/email', () => ({ appUrl: (p: string) => `https://x.test${p}`, sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({ fetchOrgSandbox: async () => false }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/payments/stripe-connect', () => ({ getStripeConnect: () => null }))
vi.mock('@/lib/communications/audience', () => ({
  fetchBoardMembers: async () => [{ userId: 'u1', email: 'a@x.test' }, { userId: 'u2', email: 'b@x.test' }],
}))

import { supabaseReversalNotifier } from './reversals-deps'
import type { AttemptView } from './reversals'

const attempt = { id: 'att-1', organizationId: 'org-1', associationId: 'assoc-1' } as AttemptView
const build = () => ({ subject: 's', text: 'body' })

/** A notifications table with the (user, kind, entity) unique index. */
function fakeDb() {
  const seen = new Set<string>()
  return {
    from: (table: string) => {
      if (table === 'notifications') {
        return {
          insert: async (row: { user_id: string; kind: string; entity_id: string }) => {
            const key = `${row.user_id}|${row.kind}|${row.entity_id}`
            if (seen.has(key)) return { error: { code: '23505' } }
            seen.add(key)
            return { error: null }
          },
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Oak HOA' } }) }) }) }
    },
    rpc: async () => ({ data: null, error: null }),
  }
}

describe('board notice emailOnce', () => {
  beforeEach(() => sendEmail.mockClear())

  it('emails each board member on the first call and nobody on a retry', async () => {
    const n = supabaseReversalNotifier(fakeDb() as never)
    await n.board(attempt, 'online_payment_books_not_open', build, { emailOnce: true })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    await n.board(attempt, 'online_payment_books_not_open', build, { emailOnce: true })
    await n.board(attempt, 'online_payment_books_not_open', build, { emailOnce: true })
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('applies to refund_failed too, and a different kind still emails', async () => {
    const n = supabaseReversalNotifier(fakeDb() as never)
    await n.board(attempt, 'online_payment_refund_failed', build, { emailOnce: true })
    await n.board(attempt, 'online_payment_refund_failed', build, { emailOnce: true })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    await n.board(attempt, 'online_payment_books_not_open', build, { emailOnce: true })
    expect(sendEmail).toHaveBeenCalledTimes(4)
  })

  it('without emailOnce, behaviour is unchanged (email every time)', async () => {
    const n = supabaseReversalNotifier(fakeDb() as never)
    await n.board(attempt, 'online_payment_refund', build)
    await n.board(attempt, 'online_payment_refund', build)
    expect(sendEmail).toHaveBeenCalledTimes(4)
  })
})
