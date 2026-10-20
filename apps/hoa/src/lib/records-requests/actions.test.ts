import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-123 (3): both writes are inert until RECORDS_REQUESTS_LIVE — no client,
// no query, no insert. With it on: the resident files a 'records_request'
// ticket with the statutory due day; the board closes one with an internal
// note. Nothing is sent to a resident.

const flag = vi.hoisted(() => ({ live: false }))
vi.mock('@homeowner-portal/db/records-requests', () => ({
  get RECORDS_REQUESTS_LIVE() {
    return flag.live
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const sent = vi.hoisted(() => ({ events: [] as unknown[] }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn(async (e: unknown) => sent.events.push(e)) } }))
const gate = vi.hoisted(() => ({
  value: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: string; orgId?: string; error?: string },
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => gate.value),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
const actor = vi.hoisted(() => ({ impersonating: false }))
vi.mock('@/lib/impersonation', () => ({
  IMPERSONATION_READONLY_MSG: 'read only',
  getResidentActor: vi.fn(async () => actor),
}))
const UNIT = '33333333-3333-4333-8333-333333333333'
vi.mock('@/lib/resident', () => ({
  getResidentUnits: vi.fn(async () => [{ unit_id: UNIT, association_id: 'assoc-1', unit_number: '4', address: null }]),
}))

const ME = '11111111-1111-4111-8111-111111111111'
const TICKET = '22222222-2222-4222-8222-222222222222'

const db = vi.hoisted(() => ({
  clients: 0,
  calls: [] as unknown[][],
  state: 'FL' as string | null,
  updated: [{ id: 'x' }] as unknown[],
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    db.clients += 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
      from: (table: string) => {
        const b: Record<string, unknown> = {}
        for (const op of ['select', 'eq', 'is', 'update']) {
          b[op] = (...args: unknown[]) => {
            db.calls.push([table, op, ...args])
            if (op === 'select' && table === 'tickets' && db.calls.some((c) => c[0] === 'tickets' && c[1] === 'update')) {
              return Promise.resolve({ data: db.updated, error: null })
            }
            return b
          }
        }
        b.insert = (row: unknown) => {
          db.calls.push([table, 'insert', row])
          if (table === 'ticket_messages') return Promise.resolve({ error: null })
          return b
        }
        b.maybeSingle = async () => ({ data: { state: db.state }, error: null })
        b.single = async () => ({ data: { id: TICKET }, error: null })
        return b
      },
    }
  }),
}))

const { createRecordsRequest, markRecordsRequestFulfilled } = await import('./actions')
const { RECORDS_NOT_LIVE } = await import('./law')

const VALID = { unitId: UNIT, kind: 'financial', period: 'current', format: 'electronic', details: 'The 2025 bank statements.' } as const

beforeEach(() => {
  flag.live = false
  db.clients = 0
  db.calls.length = 0
  db.state = 'FL'
  db.updated = [{ id: 'x' }]
  sent.events.length = 0
  actor.impersonating = false
  gate.value = { ok: true, role: 'board', orgId: 'org-1' }
})

describe('flag off: nothing is written or read', () => {
  it('createRecordsRequest returns "not available" without a client', async () => {
    expect(await createRecordsRequest(VALID)).toEqual({ ok: false, error: RECORDS_NOT_LIVE })
    expect(db.clients).toBe(0)
    expect(sent.events).toHaveLength(0)
  })

  it('markRecordsRequestFulfilled returns "not available" without a client', async () => {
    expect(await markRecordsRequestFulfilled({ ticketId: TICKET })).toEqual({ ok: false, error: RECORDS_NOT_LIVE })
    expect(db.clients).toBe(0)
  })
})

describe('flag on', () => {
  beforeEach(() => {
    flag.live = true
  })

  it('files a records_request ticket with the Florida due day and tells the board', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))
    try {
      const res = await createRecordsRequest(VALID)
      expect(res).toEqual({ ok: true, data: { ticketId: TICKET } })
    } finally {
      vi.useRealTimers()
    }
    const insert = db.calls.find((c) => c[0] === 'tickets' && c[1] === 'insert')![2] as Record<string, unknown>
    expect(insert).toMatchObject({
      organization_id: 'org-1',
      unit_id: UNIT,
      submitted_by: ME,
      category: 'records_request',
      subject: 'Records request: Financial records',
      status: 'open',
      records_due_at: '2026-11-03T17:00:00.000Z',
    })
    expect(String(insert.description)).toContain('Preferred format: Electronic copies')
    expect(sent.events).toEqual([{ name: 'ticket/created', data: { ticketId: TICKET, organizationId: 'org-1' } }])
  })

  it('a state with no loaded statute files with no due date', async () => {
    db.state = 'TX'
    await createRecordsRequest(VALID)
    const insert = db.calls.find((c) => c[0] === 'tickets' && c[1] === 'insert')![2] as Record<string, unknown>
    expect(insert.records_due_at).toBeNull()
  })

  it('refuses a home the resident does not own, and an impersonator, before writing', async () => {
    expect((await createRecordsRequest({ ...VALID, unitId: TICKET })).ok).toBe(false)
    actor.impersonating = true
    expect(await createRecordsRequest(VALID)).toEqual({ ok: false, error: 'read only' })
    expect(db.calls.some((c) => c[1] === 'insert')).toBe(false)
  })

  it('validates the form fields', async () => {
    const res = await createRecordsRequest({ ...VALID, details: 'short' })
    expect(res.ok).toBe(false)
    expect(res.ok ? null : res.fieldErrors?.details).toBeTruthy()
  })

  it('mark fulfilled closes only a records request in the board’s org, with an internal note', async () => {
    expect(await markRecordsRequestFulfilled({ ticketId: TICKET, note: 'Emailed PDFs' })).toEqual({ ok: true })
    expect(db.calls).toContainEqual(['tickets', 'eq', 'organization_id', 'org-1'])
    expect(db.calls).toContainEqual(['tickets', 'eq', 'category', 'records_request'])
    const update = db.calls.find((c) => c[0] === 'tickets' && c[1] === 'update')![2] as Record<string, unknown>
    expect(update).toMatchObject({ status: 'closed', closed_by: ME })
    const note = db.calls.find((c) => c[0] === 'ticket_messages' && c[1] === 'insert')![2] as Record<string, unknown>
    expect(note).toMatchObject({ internal: true, author_role: 'board', body: 'Marked fulfilled: Emailed PDFs' })
  })

  it('mark fulfilled on a ticket that is not a records request says not found', async () => {
    db.updated = []
    expect(await markRecordsRequestFulfilled({ ticketId: TICKET })).toEqual({ ok: false, error: 'That records request wasn’t found.' })
    expect(db.calls.some((c) => c[0] === 'ticket_messages')).toBe(false)
  })

  it('a resident is refused by the gate before any client', async () => {
    gate.value = { ok: false, error: 'denied' }
    expect(await markRecordsRequestFulfilled({ ticketId: TICKET })).toEqual({ ok: false, error: 'denied' })
    expect(db.clients).toBe(0)
  })
})
