import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendPushToUsers = vi.fn(async (..._a: unknown[]) => 1)
vi.mock('./web-push', () => ({ sendPushToUsers: (...a: unknown[]) => sendPushToUsers(...a) }))

import { runTicketNotifications } from './ticket-notifications'

type Res = { data?: unknown; error?: { code?: string; message: string } | null }

interface Plan {
  ticket?: Res
  members?: Res
  existing?: Res
  insert?: Res
}

const TICKET = {
  id: 'tk-1',
  subject: 'secret subject',
  category: null,
  unit_id: null,
  submitted_by: null,
  organization_id: 'org-1',
}
const MEMBERS = [
  { user_id: 'u1', role: 'board' },
  { user_id: 'u2', role: 'admin' },
]

function makeDb(plan: Plan) {
  const inserted: Array<Record<string, unknown>> = []
  const db = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => plan.ticket ?? { data: TICKET, error: null },
        insert: async (rows: Array<Record<string, unknown>>) => {
          inserted.push(...rows)
          return plan.insert ?? { error: null }
        },
        then: (r: (v: unknown) => unknown) =>
          r(
            table === 'org_members'
              ? (plan.members ?? { data: MEMBERS, error: null })
              : (plan.existing ?? { data: [], error: null }),
          ),
      }
      return chain
    },
  }
  return { db, inserted }
}

// Real step semantics for the parts that matter: run the callback, let it throw.
const step = { run: async (_id: string, fn: () => Promise<unknown>) => fn() }
const payload = { ticketId: 'tk-1', organizationId: 'org-1' }
const err = { code: 'XX000', message: 'boom with 10 Main St' }

beforeEach(() => sendPushToUsers.mockClear())

describe('runTicketNotifications read/insert errors', () => {
  it('load-ticket throws on a read error, without leaking the message', async () => {
    const { db } = makeDb({ ticket: { data: null, error: err } })
    const logger = { warn: vi.fn() }
    const p = runTicketNotifications(db as never, step, logger, payload)
    await expect(p).rejects.toThrow('load-ticket read failed (XX000)')
    await expect(p).rejects.not.toThrow(/Main St/)
  })

  it('a genuinely missing ticket returns quietly', async () => {
    const { db } = makeDb({ ticket: { data: null, error: null } })
    await expect(runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)).resolves.toEqual({
      notified: 0,
    })
  })

  it('resolve-recipients throws on an org_members read error', async () => {
    const { db } = makeDb({ members: { data: null, error: err } })
    await expect(runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)).rejects.toThrow(
      'resolve-recipients read failed',
    )
  })

  it('no board members (no error) still returns quietly', async () => {
    const { db } = makeDb({ members: { data: [{ user_id: 'u9', role: 'resident' }], error: null } })
    await expect(runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)).resolves.toEqual({
      notified: 0,
    })
  })

  it('write-notifications throws on a non-23505 insert error and does not push', async () => {
    const { db } = makeDb({ insert: { error: err } })
    await expect(runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)).rejects.toThrow(
      'notifications insert failed (XX000)',
    )
    expect(sendPushToUsers).not.toHaveBeenCalled()
  })

  it('write-notifications throws when the dedupe read fails (no blind insert)', async () => {
    const { db, inserted } = makeDb({ existing: { data: null, error: err } })
    await expect(runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)).rejects.toThrow(
      'write-notifications read failed',
    )
    expect(inserted).toHaveLength(0)
  })

  it('a 23505 race is not an error and pushes nobody (the winner owns the push)', async () => {
    const { db } = makeDb({ insert: { error: { code: '23505', message: 'dup' } } })
    const r = await runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)
    expect(r.notified).toBe(2)
    expect(sendPushToUsers).not.toHaveBeenCalled()
  })
})

describe('retry after partial success', () => {
  it('only newly recorded users are inserted and pushed', async () => {
    // u1 was recorded (and pushed) on an earlier attempt; u2 was not.
    const { db, inserted } = makeDb({ existing: { data: [{ user_id: 'u1' }], error: null } })
    await runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)
    expect(inserted.map((r) => r.user_id)).toEqual(['u2'])
    expect(sendPushToUsers).toHaveBeenCalledTimes(1)
    expect(sendPushToUsers.mock.calls[0][2]).toEqual(['u2'])
  })

  it('everyone already notified: no insert and no push', async () => {
    const { db, inserted } = makeDb({ existing: { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null } })
    const r = await runTicketNotifications(db as never, step, { warn: vi.fn() }, payload)
    expect(inserted).toHaveLength(0)
    expect(sendPushToUsers).not.toHaveBeenCalled()
    expect(r.pushed).toBe(0)
  })
})
