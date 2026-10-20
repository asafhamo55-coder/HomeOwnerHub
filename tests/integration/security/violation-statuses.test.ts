/**
 * Migration 0066 part 5 (migrations/0066_records_requests.sql):
 * hoa_violations_status_check also allows 'fined' and 'dismissed', the two
 * statuses the board's status editor offers (apps/hoa/src/lib/
 * violation-statuses.ts) once VIOLATION_FINED_STATUS_LIVE is on.
 * CI only (no local database).
 *
 * The writes go through the board's own client, the path
 * updateViolationStatus (apps/hoa/src/lib/violations.ts) takes, with the
 * same columns it writes. Every 0000 status is still accepted and an
 * unknown one is still refused with 23514.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { VIOLATION_STATUSES } from '@/lib/violation-statuses'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let violationId: string

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  const { data, error } = await adminDb()
    .from('hoa_violations')
    .insert({ org_id: org.orgId, violation_type: 'lawn', description: 'tall grass', status: 'notice_sent' } as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed violation failed: ${error?.code ?? 'no row'}`)
  violationId = (data as { id: string }).id
})

async function boardSets(updates: Record<string, unknown>) {
  return board.client
    .from('hoa_violations')
    .update(updates as never)
    .eq('id', violationId)
    .select('id, status')
}

describe('hoa_violations_status_check after 0066', () => {
  it('a board member moves a violation to Fined (the fine flow’s columns)', async () => {
    const now = new Date().toISOString()
    const { data, error } = await boardSets({
      status: 'fined',
      resolved_at: null,
      resolution_note: null,
      fine_start_date: now.slice(0, 10),
    })
    expect(error).toBeNull()
    expect(data).toEqual([{ id: violationId, status: 'fined' }])
  })

  it('a board member dismisses a violation with a reason', async () => {
    const { data, error } = await boardSets({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolution_note: 'not a violation',
      fine_start_date: null,
    })
    expect(error).toBeNull()
    expect(data).toEqual([{ id: violationId, status: 'dismissed' }])
  })

  it('accepts every status the app offers', async () => {
    for (const status of VIOLATION_STATUSES) {
      const { error } = await boardSets({ status })
      expect(error?.code ?? null, status).toBeNull()
    }
  })

  it('keeps every status 0000 allowed', async () => {
    for (const status of ['open', 'notice_drafted', 'notice_sent', 'resolved', 'waived']) {
      const { error } = await adminDb().from('hoa_violations').update({ status } as never).eq('id', violationId)
      expect(error?.code ?? null, status).toBeNull()
    }
  })

  it('still refuses an unknown status with 23514', async () => {
    const { error } = await adminDb().from('hoa_violations').update({ status: 'escalated' } as never).eq('id', violationId)
    expect(error?.code).toBe('23514')
  })
})
