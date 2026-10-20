/**
 * Migration 0066 (migrations/0066_records_requests.sql, BL-123 item 3)
 * against real Postgres. CI only (no local database).
 *
 *   1. tickets.category accepts 'records_request' from the resident's own
 *      client (the path lib/records-requests/actions.ts takes); every 0024
 *      category is still accepted and an unknown one is still refused with
 *      23514.
 *   3. tickets_records_due_at_guard: a resident cannot set records_due_at
 *      (insert or, were RLS ever to allow it, update); the app path (the
 *      resident inserts, the service role writes the due day) and the
 *      board's own client can.
 *   2. records_due_at round-trips as the stored instant, and the board can
 *      close the request (the "Mark fulfilled" write) through its own client.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let unitId: string
let board: TestUser
let resident: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  unitId = await makeUnit(org)
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
})

function ticketRow(category: string, extra: Record<string, unknown> = {}) {
  return {
    organization_id: org.orgId,
    association_id: org.associationId,
    unit_id: unitId,
    submitted_by: resident.id,
    category,
    subject: 'Records request: Financial records',
    description: 'Records requested: Financial records (budgets, statements, bank records)',
    status: 'open',
    ...extra,
  }
}

describe('1. tickets.category accepts records_request', () => {
  it('a resident files a records request through their own client', async () => {
    const { data, error } = await resident.client
      .from('tickets')
      // unit_id NULL: the 0063 insert policy allows it, and linking the
      // resident to a unit (ownerships) is rls-sweep.test.ts's job.
      .insert(ticketRow('records_request', { unit_id: null }) as never)
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('keeps every category 0024 allowed', async () => {
    for (const category of ['maintenance', 'noise', 'parking', 'common_area', 'billing', 'access', 'safety', 'general', 'other']) {
      const { error } = await adminDb().from('tickets').insert(ticketRow(category) as never)
      expect(error?.code ?? null, category).toBeNull()
    }
  })

  it('still refuses an unknown category with 23514', async () => {
    const { error } = await adminDb().from('tickets').insert(ticketRow('records') as never)
    expect(error?.code).toBe('23514')
  })
})

describe('2. records_due_at and mark fulfilled', () => {
  it('round-trips the due instant and the board can close the request', async () => {
    const { data: created, error } = await adminDb()
      .from('tickets')
      .insert(ticketRow('records_request', { records_due_at: '2026-11-03T17:00:00.000Z' }) as never)
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (created as { id: string }).id

    const { data: read } = await resident.client
      .from('tickets')
      .select('records_due_at' as never)
      .eq('id', id)
      .single()
    const due = (read as unknown as { records_due_at: string }).records_due_at
    expect(new Date(due).toISOString()).toBe('2026-11-03T17:00:00.000Z')
    expect(due.slice(0, 10)).toBe('2026-11-03')

    const { data: closed, error: closeError } = await board.client
      .from('tickets')
      .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: board.id } as never)
      .eq('id', id)
      .eq('category' as never, 'records_request')
      .select('id')
    expect(closeError).toBeNull()
    expect(closed).toHaveLength(1)
  })

  it('records_due_at is NULL by default for an ordinary ticket', async () => {
    const { data } = await adminDb()
      .from('tickets')
      .insert(ticketRow('maintenance') as never)
      .select('records_due_at' as never)
      .single()
    expect((data as unknown as { records_due_at: string | null }).records_due_at).toBeNull()
  })
})

describe('3. records_due_at guard (tickets_records_due_at_guard)', () => {
  const DUE = '2026-11-03T17:00:00.000Z'

  async function recordsCount(): Promise<number | null> {
    const { count } = await adminDb()
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('category' as never, 'records_request')
    return count
  }

  async function dueOf(id: string): Promise<string | null> {
    const { data } = await adminDb().from('tickets').select('records_due_at' as never).eq('id', id).single()
    const due = (data as unknown as { records_due_at: string | null }).records_due_at
    return due === null ? null : new Date(due).toISOString()
  }

  it('a resident cannot insert a records request with their own due day', async () => {
    // records_due_at is not in the generated types until gen:types runs
    // after prod has 0066 (CLAUDE.md footgun 3), hence the cast.
    const { error } = await resident.client
      .from('tickets')
      .insert(ticketRow('records_request', { unit_id: null, records_due_at: '2099-01-01T17:00:00.000Z' }) as never)
    expect(error?.code).toBe('42501')
    expect(await recordsCount()).toBe(0)
  })

  it('the app path: the resident inserts, then the service role writes the due day', async () => {
    const { data, error } = await resident.client
      .from('tickets')
      .insert(ticketRow('records_request', { unit_id: null }) as never)
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (data as { id: string }).id
    expect(await dueOf(id)).toBeNull()

    // Same filters as createRecordsRequest's service-role write.
    const { data: set, error: setError } = await adminDb()
      .from('tickets')
      .update({ records_due_at: DUE } as never)
      .eq('id', id)
      .eq('organization_id' as never, org.orgId)
      .eq('submitted_by' as never, resident.id)
      .eq('category' as never, 'records_request')
      .is('records_due_at' as never, null)
      .select('id')
    expect(setError).toBeNull()
    expect(set).toHaveLength(1)
    expect(await dueOf(id)).toBe(DUE)
  })

  it('the resident cannot change the due day afterwards', async () => {
    const { data } = await adminDb()
      .from('tickets')
      .insert(ticketRow('records_request', { records_due_at: DUE }) as never)
      .select('id')
      .single()
    const id = (data as { id: string }).id
    // Refused by 0063's board-only UPDATE policy (no row matched) or by
    // the guard (42501); either way the stored day is unchanged.
    await resident.client
      .from('tickets')
      .update({ records_due_at: '2099-01-01T17:00:00.000Z' } as never)
      .eq('id', id)
    expect(await dueOf(id)).toBe(DUE)
  })

  it('the board can set and change the due day through its own client', async () => {
    const { data: created, error } = await board.client
      .from('tickets')
      .insert(ticketRow('records_request', { records_due_at: DUE }) as never)
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (created as { id: string }).id
    expect(await dueOf(id)).toBe(DUE)

    const later = '2026-11-10T17:00:00.000Z'
    const { error: updError } = await board.client
      .from('tickets')
      .update({ records_due_at: later } as never)
      .eq('id', id)
    expect(updError).toBeNull()
    expect(await dueOf(id)).toBe(later)
  })

  it("a board member of another org cannot set this org's due day", async () => {
    const otherOrg = await makeOrg()
    const outsider = await mintUser(otherOrg, 'board')
    const { error } = await outsider.client
      .from('tickets')
      .insert(ticketRow('records_request', { records_due_at: DUE }) as never)
    expect(error).not.toBeNull()
    expect(await recordsCount()).toBe(0)
  })
})
