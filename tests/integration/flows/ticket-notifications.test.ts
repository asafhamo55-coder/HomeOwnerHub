/**
 * "Resident opens a ticket, the board gets notified."
 *
 * This flow has never run anywhere. It shipped in 9429f01, got a fix in
 * 89925c8 ("the dedupe upsert could never have worked"), and no ticket
 * has been created since. These are its first executions.
 *
 * Asserted against real Postgres because the bug that shipped was an
 * ON CONFLICT / partial-index interaction — something no mock reproduces.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { runTicketNotifications, type TicketNotificationsStep } from '../../../packages/jobs/src/ticket-notifications'
import { adminDb, makeOrg, makeUnit, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

/** Steps execute inline, exactly once. The real executor re-runs code
 *  OUTSIDE a step on every step boundary and replays memoized results;
 *  this fake does not model that. Replay semantics stay out of scope
 *  here — see the comment at mailbox-send.ts:294-315. */
function inlineStep(): TicketNotificationsStep {
  return { run: async (_id, fn) => fn() }
}

function collectingLogger(): { warn(m: string): void; warnings: string[] } {
  const warnings: string[] = []
  return { warn: (m: string) => { warnings.push(m) }, warnings }
}

async function seedTicket(orgId: string, unitId: string, submittedBy: string): Promise<string> {
  const { data, error } = await adminDb()
    .from('tickets')
    .insert({
      organization_id: orgId,
      unit_id: unitId,
      submitted_by: submittedBy,
      category: 'maintenance',
      subject: 'Leaking water heater',
      description: 'Water pooling in the garage.',
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTicket failed: ${error?.message}`)
  return data.id
}

describe('ticket/created → notifications', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('writes one notification row per board member', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    const board1 = await mintUser(org, 'board')
    const board2 = await mintUser(org, 'admin')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const logger = collectingLogger()
    const result = await runTicketNotifications(adminDb(), inlineStep(), logger, {
      ticketId,
      organizationId: org.orgId,
    })

    const { data: rows } = await adminDb()
      .from('notifications')
      .select('user_id, kind, entity_id, entity_type, title')
      .eq('entity_id', ticketId)

    // The row is the deliverable. A return value of { notified: 2 } with
    // zero rows written is the exact failure mode that shipped before.
    expect(rows ?? []).toHaveLength(2)
    expect(new Set((rows ?? []).map((r) => r.user_id))).toEqual(new Set([board1.id, board2.id]))
    expect(rows?.[0]?.kind).toBe('ticket.created')
    expect(rows?.[0]?.entity_type).toBe('ticket')
    expect(result.notified).toBe(2)
    expect(logger.warnings, `job logged warnings: ${logger.warnings.join(' | ')}`).toEqual([])
  })

  it('does not notify the resident who opened the ticket', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    await mintUser(org, 'board')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId,
      organizationId: org.orgId,
    })

    const { data: rows } = await adminDb()
      .from('notifications').select('user_id').eq('entity_id', ticketId)
    expect((rows ?? []).map((r) => r.user_id)).not.toContain(resident.id)
  })

  // The regression that shipped as 89925c8. A retry must not duplicate.
  it('is idempotent across retries', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    await mintUser(org, 'board')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const logger = collectingLogger()
    const payload = { ticketId, organizationId: org.orgId }
    await runTicketNotifications(adminDb(), inlineStep(), logger, payload)
    await runTicketNotifications(adminDb(), inlineStep(), logger, payload)

    const { data: rows } = await adminDb()
      .from('notifications').select('user_id').eq('entity_id', ticketId)
    expect(rows ?? [], 'a retry duplicated the notification rows').toHaveLength(1)
    expect(logger.warnings).toEqual([])
  })

  it('returns notified: 0 and writes nothing when the ticket is missing', async () => {
    const org = await makeOrg()
    await mintUser(org, 'board')

    const result = await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId: '00000000-0000-0000-0000-000000000000',
      organizationId: org.orgId,
    })

    expect(result.notified).toBe(0)
    const { data: rows } = await adminDb().from('notifications').select('user_id')
    expect(rows ?? []).toHaveLength(0)
  })

  it('writes nothing when the org has no board members', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const result = await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId,
      organizationId: org.orgId,
    })

    expect(result.notified).toBe(0)
    const { data: rows } = await adminDb().from('notifications').select('user_id')
    expect(rows ?? []).toHaveLength(0)
  })
})
