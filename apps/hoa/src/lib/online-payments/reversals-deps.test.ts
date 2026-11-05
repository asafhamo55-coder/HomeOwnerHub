import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
vi.mock('@/lib/email', () => ({ appUrl: (p: string) => `https://x.test${p}`, sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({ fetchOrgSandbox: async () => false }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/payments/stripe-connect', () => ({ getStripeConnect: () => null }))
vi.mock('@/lib/communications/audience', () => ({
  fetchBoardMembers: async () => [{ userId: 'u1', email: 'a@x.test' }, { userId: 'u2', email: 'b@x.test' }],
}))

import { supabaseReversalNotifier, supabaseReversalStore } from './reversals-deps'
import { ReverseRefused, type AttemptView } from './reversals'

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

describe('emailOnce when the alert insert itself fails', () => {
  beforeEach(() => sendEmail.mockClear())

  it('logs and skips the email instead of emailing on every retry', async () => {
    const db = {
      from: (table: string) =>
        table === 'notifications'
          ? { insert: async () => ({ error: { code: 'XX000' } }) }
          : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Oak HOA' } }) }) }) },
      rpc: async () => ({ data: null, error: null }),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const n = supabaseReversalNotifier(db as never)
    await n.board(attempt, 'online_payment_books_not_open:refund:re_1', build, { emailOnce: true })
    await n.board(attempt, 'online_payment_books_not_open:refund:re_1', build, { emailOnce: true })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('alert insert failed'), expect.objectContaining({ attemptId: 'att-1', code: 'XX000' }))
    warn.mockRestore()
  })
})

describe('supabaseReversalStore.reverse booksClosed flag', () => {
  const call = (error: { code: string; message: string }) =>
    supabaseReversalStore({ from: () => ({}), rpc: async () => ({ data: null, error }) } as never)
      .reverse({ attemptId: 'a', kind: 'refund_failed', ref: 're_1' })
      .catch((e: unknown) => e)

  it('sets booksClosed for the exact 0082 messages', async () => {
    for (const message of ['reverse_online_payment: books_not_open', 'closed_period']) {
      const e = (await call({ code: '55000', message })) as ReverseRefused
      expect(e).toBeInstanceOf(ReverseRefused)
      expect(e.booksClosed, message).toBe(true)
    }
  })

  it('does not set it for a refund the books never took, or for 23514', async () => {
    const never = (await call({ code: '55000', message: 'reverse_online_payment: refund_failed for a refund the books never took' })) as ReverseRefused
    expect(never.booksClosed).toBe(false)
    const over = (await call({ code: '23514', message: 'books_not_open' })) as ReverseRefused
    expect(over.booksClosed).toBe(false)
  })
})
