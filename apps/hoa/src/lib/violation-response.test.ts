import { describe, expect, it, vi } from 'vitest'
import {
  CLOSED_VIOLATION_STATUSES,
  RESIDENT_VIOLATION_COLUMNS,
  RESPOND_CLOSED,
  RESPOND_NOT_FOUND,
  VIOLATION_RESPONSE_AUDIT,
  VIOLATION_RESPONSE_ENTITY,
  cureByDate,
  loadBoardResponseThreads,
  loadOwnViolation,
  postViolationResponse,
  residentViolationView,
  type OwnViolationRow,
} from './violation-response'

// BL-129. A tiny in-memory PostgREST: eq / in / is filters really filter,
// so "a neighbour's violation" is refused by the same query the app runs,
// not by a stub that was told to say no.

type Row = Record<string, unknown>
interface Call {
  table: string
  op: string
  args: unknown[]
}

function memDb(tables: Record<string, Row[]>, opts: { failRead?: string; failInsert?: string } = {}) {
  const calls: Call[] = []
  let seq = 0
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'delete' = 'select'
    let inserted: Row | null = null
    const b: Record<string, unknown> = {}
    const run = () => {
      if (mode === 'select' && opts.failRead === table) return { data: null, error: { code: 'XX000' } }
      if (mode === 'insert') {
        if (opts.failInsert === table) return { data: null, error: { code: '42501' } }
        return { data: inserted, error: null }
      }
      if (mode === 'delete') {
        tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)))
        return { data: null, error: null }
      }
      return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }
    }
    const rec = (op: string, args: unknown[]) => calls.push({ table, op, args })
    b.select = (...a: unknown[]) => (rec('select', a), b)
    b.eq = (c: string, v: unknown) => (rec('eq', [c, v]), filters.push((r) => r[c] === v), b)
    b.in = (c: string, v: unknown[]) => (rec('in', [c, v]), filters.push((r) => v.includes(r[c])), b)
    b.is = (c: string, v: unknown) => (rec('is', [c, v]), filters.push((r) => (r[c] ?? null) === v), b)
    b.order = () => b
    b.limit = () => b
    b.insert = (row: Row) => {
      rec('insert', [row])
      mode = 'insert'
      inserted = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: '2026-10-20T12:00:00Z', ...row }
      if (opts.failInsert !== table) (tables[table] ??= []).push(inserted)
      return b
    }
    b.delete = () => (rec('delete', []), (mode = 'delete'), b)
    b.maybeSingle = async () => {
      const r = run()
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
    }
    b.single = async () => run()
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return b
  }
  return { from, calls, tables }
}

const ORG = 'org-1'
const ME = '11111111-1111-4111-8111-111111111111'
const MY_UNIT = 'unit-mine'
const MY_PROP = 'prop-mine'
const V_MINE = '22222222-2222-4222-8222-222222222222'
const V_NEIGHBOUR = '33333333-3333-4333-8333-333333333333'
const V_OTHER_ORG = '44444444-4444-4444-8444-444444444444'

function violation(over: Partial<OwnViolationRow & { deleted_at: string | null }> = {}): Row {
  return {
    id: V_MINE,
    org_id: ORG,
    property_id: MY_PROP,
    violation_type: 'trash_cans',
    description: 'Bins left at the curb',
    ccr_section: '§ 7.2',
    status: 'notice_sent',
    notice_sent_at: '2026-10-01T15:00:00Z',
    approved_letter: 'Dear owner…',
    ai_draft_letter: 'DRAFT — not for the owner',
    cure_period_days: 14,
    fine_amount: 25,
    fine_start_date: null,
    photo_urls: ['https://x.supabase.co/storage/v1/object/sign/p.jpg?token=t'],
    created_at: '2026-09-30T15:00:00Z',
    resolved_at: null,
    deleted_at: null,
    ...over,
  }
}

function world(over: { violations?: Row[] } = {}) {
  const resident = memDb({
    units: [
      { id: MY_UNIT, organization_id: ORG, legacy_hoa_property_id: MY_PROP },
      { id: 'unit-neighbour', organization_id: ORG, legacy_hoa_property_id: 'prop-neighbour' },
    ],
    hoa_violations: over.violations ?? [
      violation(),
      violation({ id: V_NEIGHBOUR, property_id: 'prop-neighbour' }),
      violation({ id: V_OTHER_ORG, org_id: 'org-2', property_id: MY_PROP }),
    ],
    tickets: [],
    ticket_messages: [],
  })
  const admin = memDb({ audit_log: [], tickets: resident.tables.tickets! })
  return { resident, admin }
}

const input = (violationId: string, body = 'Moved the bins on Saturday.') => ({
  violationId,
  body,
  userId: ME,
  orgId: ORG,
  unitIds: [MY_UNIT],
  associationIdOf: () => 'assoc-1',
})

describe('loadOwnViolation (BL-129 gate)', () => {
  it('finds a violation on a home the resident owns or occupies', async () => {
    const { resident } = world()
    const r = await loadOwnViolation(resident, { violationId: V_MINE, unitIds: [MY_UNIT], orgId: ORG })
    expect(r).toMatchObject({ ok: true, unitId: MY_UNIT, violation: { id: V_MINE } })
  })

  it('refuses a neighbour’s violation in the same org, as not_found', async () => {
    const { resident } = world()
    expect(await loadOwnViolation(resident, { violationId: V_NEIGHBOUR, unitIds: [MY_UNIT], orgId: ORG })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('refuses a violation in another org even on a matching property id', async () => {
    const { resident } = world()
    expect(await loadOwnViolation(resident, { violationId: V_OTHER_ORG, unitIds: [MY_UNIT], orgId: ORG })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('refuses everything for a resident with no home, and a deleted violation', async () => {
    const { resident } = world({ violations: [violation({ deleted_at: '2026-10-02T00:00:00Z' })] })
    expect((await loadOwnViolation(resident, { violationId: V_MINE, unitIds: [], orgId: ORG })).ok).toBe(false)
    expect((await loadOwnViolation(resident, { violationId: V_MINE, unitIds: [MY_UNIT], orgId: ORG })).ok).toBe(false)
  })

  it('says error (not "none") when a read fails', async () => {
    const db = memDb({ units: [] }, { failRead: 'units' })
    expect(await loadOwnViolation(db, { violationId: V_MINE, unitIds: [MY_UNIT], orgId: ORG })).toEqual({ ok: false, reason: 'error' })
  })

  it('never selects the AI draft letter', () => {
    expect(RESIDENT_VIOLATION_COLUMNS).not.toMatch(/ai_draft_letter/)
  })
})

describe('residentViolationView', () => {
  it('shows the letter, photos and cure-by date once the notice went out', () => {
    const v = residentViolationView(violation() as unknown as OwnViolationRow)
    expect(v.letter).toBe('Dear owner…')
    expect(v.photos).toHaveLength(1)
    expect(v.cureBy).toBe('2026-10-15T15:00:00.000Z')
    expect(JSON.stringify(v)).not.toMatch(/DRAFT/)
  })

  it('hides the letter and photos before any notice was sent', () => {
    const v = residentViolationView(violation({ notice_sent_at: null, status: 'open' }) as unknown as OwnViolationRow)
    expect(v.letter).toBeNull()
    expect(v.photos).toEqual([])
    expect(v.cureBy).toBeNull()
  })

  it('cureByDate needs both a sent date and a period', () => {
    expect(cureByDate(null, 14)).toBeNull()
    expect(cureByDate('2026-10-01T00:00:00Z', null)).toBeNull()
  })
})

describe('postViolationResponse', () => {
  it('first response: a ticket as the resident, the link with the service role, the board told', async () => {
    const { resident, admin } = world()
    const notifyBoard = vi.fn(async () => {})
    const r = await postViolationResponse({ db: resident, admin, notifyBoard }, input(V_MINE))
    expect(r).toMatchObject({ ok: true, created: true })
    const ticket = resident.tables.tickets![0]!
    expect(ticket).toMatchObject({
      organization_id: ORG,
      unit_id: MY_UNIT,
      submitted_by: ME,
      category: 'general',
      status: 'open',
      description: 'Moved the bins on Saturday.',
    })
    expect(admin.tables.audit_log).toEqual([
      expect.objectContaining({
        org_id: ORG,
        user_id: ME,
        action: VIOLATION_RESPONSE_AUDIT,
        entity_type: VIOLATION_RESPONSE_ENTITY,
        entity_id: V_MINE,
        metadata: { ticketId: ticket.id, unitId: MY_UNIT },
      }),
    ])
    // The service role writes only the link: never the ticket or message.
    expect(admin.calls.filter((c) => c.op === 'insert').map((c) => c.table)).toEqual(['audit_log'])
    expect(notifyBoard).toHaveBeenCalledWith(ticket.id)
  })

  it('a later response is a message on the same ticket', async () => {
    const { resident, admin } = world()
    const notifyBoard = vi.fn(async () => {})
    const first = await postViolationResponse({ db: resident, admin, notifyBoard }, input(V_MINE))
    const second = await postViolationResponse({ db: resident, admin, notifyBoard }, input(V_MINE, 'Photo attached.'))
    expect(second).toMatchObject({ ok: true, created: false })
    expect(first.ok && second.ok && first.ticketId === second.ticketId).toBe(true)
    expect(resident.tables.tickets).toHaveLength(1)
    expect(resident.tables.ticket_messages).toEqual([
      expect.objectContaining({ author_id: ME, author_role: 'resident', body: 'Photo attached.', internal: false }),
    ])
    expect(notifyBoard).toHaveBeenCalledTimes(1)
  })

  it.each([V_NEIGHBOUR, V_OTHER_ORG, '55555555-5555-4555-8555-555555555555'])(
    'refuses cross-home %s before any write or any service-role call',
    async (id) => {
      const { resident, admin } = world()
      const notifyBoard = vi.fn(async () => {})
      expect(await postViolationResponse({ db: resident, admin, notifyBoard }, input(id))).toEqual({
        ok: false,
        error: RESPOND_NOT_FOUND,
      })
      expect(resident.calls.some((c) => c.op === 'insert')).toBe(false)
      expect(admin.calls).toEqual([])
      expect(notifyBoard).not.toHaveBeenCalled()
    },
  )

  it.each([...CLOSED_VIOLATION_STATUSES])('refuses a %s violation', async (status) => {
    const { resident, admin } = world({ violations: [violation({ status })] })
    expect(await postViolationResponse({ db: resident, admin, notifyBoard: async () => {} }, input(V_MINE))).toEqual({
      ok: false,
      error: RESPOND_CLOSED,
    })
    expect(resident.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('removes the ticket when the link cannot be written (no orphan in the board queue)', async () => {
    const resident = world().resident
    const admin = memDb({ audit_log: [], tickets: resident.tables.tickets! }, { failInsert: 'audit_log' })
    const notifyBoard = vi.fn(async () => {})
    const r = await postViolationResponse({ db: resident, admin, notifyBoard }, input(V_MINE))
    expect(r.ok).toBe(false)
    const del = admin.calls.filter((c) => c.table === 'tickets')
    expect(del.map((c) => c.op)).toEqual(['delete', 'eq', 'eq', 'eq'])
    expect(del.slice(1).map((c) => c.args[0])).toEqual(['id', 'organization_id', 'submitted_by'])
    expect(notifyBoard).not.toHaveBeenCalled()
  })

  it('a notification failure does not fail the saved response', async () => {
    const { resident, admin } = world()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await postViolationResponse(
      { db: resident, admin, notifyBoard: async () => Promise.reject(new Error('inngest down')) },
      input(V_MINE),
    )
    expect(r.ok).toBe(true)
    // Ids and error names only — never the response text.
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/bins/)
    spy.mockRestore()
  })
})

describe('loadBoardResponseThreads', () => {
  const T1 = '66666666-6666-4666-8666-666666666666'
  const T2 = '77777777-7777-4777-8777-777777777777'
  const BOARD = '88888888-8888-4888-8888-888888888888'
  const link = (ticketId: string, user_id: string | null, entity_id = V_MINE) => ({
    org_id: ORG,
    user_id,
    entity_type: VIOLATION_RESPONSE_ENTITY,
    entity_id,
    action: VIOLATION_RESPONSE_AUDIT,
    metadata: { ticketId },
  })
  const ticket = (id: string, submitted_by: string, unit_id: string, description = 'Fixed it') => ({
    id,
    organization_id: ORG,
    status: 'open',
    description,
    created_at: '2026-10-05T00:00:00Z',
    deleted_at: null,
    submitted_by,
    unit_id,
  })
  const home = (extra: Record<string, Row[]> = {}) =>
    memDb({
      units: [
        { id: MY_UNIT, organization_id: ORG, legacy_hoa_property_id: MY_PROP },
        { id: 'unit-neighbour', organization_id: ORG, legacy_hoa_property_id: 'prop-neighbour' },
      ],
      org_members: [
        { org_id: ORG, user_id: ME },
        { org_id: ORG, user_id: BOARD },
      ],
      ownerships: [{ organization_id: ORG, unit_id: MY_UNIT, owner_user_id: ME, valid_to: null }],
      tenancies: [],
      property_residents: [],
      profiles: [],
      ticket_messages: [
        { id: 'm1', ticket_id: T1, author_role: 'board', body: 'Thanks', internal: false, created_at: '2026-10-06T00:00:00Z' },
      ],
      ...extra,
    })
  const input = { orgId: ORG, violationId: V_MINE, propertyId: MY_PROP }

  it('assembles each linked ticket with its first response and messages, oldest first', async () => {
    const db = home({
      audit_log: [
        link(T1, ME),
        link('not-a-uuid', ME),
        link('x', ME, V_NEIGHBOUR),
      ],
      tickets: [ticket(T1, ME, MY_UNIT)],
    })
    const threads = await loadBoardResponseThreads(db, input)
    expect(threads).toHaveLength(1)
    expect(threads![0]!.messages.map((m) => [m.author_role, m.body])).toEqual([
      ['resident', 'Fixed it'],
      ['board', 'Thanks'],
    ])
  })

  it('SEC-N2: forged links do not render (wrong submitter, another home, a non-resident, a link naming someone else)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const T3 = '99999999-9999-4999-8999-999999999999'
    const T4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const db = home({
      audit_log: [
        link(T1, BOARD), // board member's own ticket, forged link
        link(T2, ME), // the resident's ticket on the neighbour's home
        link(T3, BOARD), // link names the board member, ticket filed by the resident
        link(T4, null), // service-role-looking link
      ],
      tickets: [
        ticket(T1, BOARD, MY_UNIT, 'board-private ticket'),
        ticket(T2, ME, 'unit-neighbour', 'neighbour ticket'),
        ticket(T3, ME, MY_UNIT, 'some other request'),
        ticket(T4, ME, MY_UNIT, 'yet another'),
      ],
    })
    expect(await loadBoardResponseThreads(db, input)).toEqual([])
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/ticket/)
    warn.mockRestore()
  })

  it('SEC-N2: a former owner, or an owner who left the org, no longer counts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = home({
      audit_log: [link(T1, ME)],
      tickets: [ticket(T1, ME, MY_UNIT)],
      ownerships: [{ organization_id: ORG, unit_id: MY_UNIT, owner_user_id: ME, valid_to: '2026-09-01' }],
    })
    expect(await loadBoardResponseThreads(db, input)).toEqual([])
    const db2 = home({ audit_log: [link(T1, ME)], tickets: [ticket(T1, ME, MY_UNIT)], org_members: [] })
    expect(await loadBoardResponseThreads(db2, input)).toEqual([])
    warn.mockRestore()
  })

  it('a tenant, or a roster resident matched by email, counts', async () => {
    const tenant = home({
      audit_log: [link(T1, ME)],
      tickets: [ticket(T1, ME, MY_UNIT)],
      ownerships: [],
      tenancies: [{ organization_id: ORG, unit_id: MY_UNIT, tenant_user_id: ME, status: 'active' }],
    })
    expect(await loadBoardResponseThreads(tenant, input)).toHaveLength(1)
    const roster = home({
      audit_log: [link(T1, ME)],
      tickets: [ticket(T1, ME, MY_UNIT)],
      ownerships: [],
      property_residents: [{ organization_id: ORG, property_id: MY_PROP, email: 'Me@Example.com', moved_out_at: null }],
      profiles: [{ id: ME, email: 'me@example.com' }],
    })
    expect(await loadBoardResponseThreads(roster, input)).toHaveLength(1)
  })

  it('a violation with no home has no responses to show', async () => {
    const db = home({ audit_log: [link(T1, ME)], tickets: [ticket(T1, ME, MY_UNIT)] })
    expect(await loadBoardResponseThreads(db, { ...input, propertyId: null })).toEqual([])
  })

  it('returns null on a failed read, [] when there are none', async () => {
    expect(await loadBoardResponseThreads(memDb({}, { failRead: 'audit_log' }), input)).toBeNull()
    expect(await loadBoardResponseThreads(memDb({ audit_log: [] }), input)).toEqual([])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await loadBoardResponseThreads(
        memDb({ audit_log: [link(T1, ME)], tickets: [ticket(T1, ME, MY_UNIT)], units: [{ id: MY_UNIT, organization_id: ORG, legacy_hoa_property_id: MY_PROP }] }, { failRead: 'ownerships' }),
        input,
      ),
    ).toBeNull()
    err.mockRestore()
  })
})
