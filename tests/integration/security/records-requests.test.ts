/**
 * Migration 0066 (migrations/0066_records_requests.sql, BL-123 item 3)
 * against real Postgres. CI only (no local database).
 *
 *   1. tickets.category accepts 'records_request' from the resident's own
 *      client (the path lib/records-requests/actions.ts takes), with
 *      records_due_at set; every 0024 category is still accepted and an
 *      unknown one is still refused with 23514.
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
  it('a resident files a records request with a due day through their own client', async () => {
    const { data, error } = await resident.client
      .from('tickets')
      // records_due_at is not in the generated types until gen:types runs
      // after prod has 0066 (CLAUDE.md footgun 3), hence the cast.
      // unit_id NULL: the 0063 insert policy allows it, and linking the
      // resident to a unit (ownerships) is rls-sweep.test.ts's job.
      .insert(ticketRow('records_request', { unit_id: null, records_due_at: '2026-11-03T17:00:00.000Z' }) as never)
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
