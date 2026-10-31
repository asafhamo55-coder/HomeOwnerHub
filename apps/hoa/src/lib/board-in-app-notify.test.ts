import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from './test-utils/memory-supabase'

// The resident actions write bell rows for the board, in-app only. The
// resident client and the admin client share one in-memory store here, so
// the end state of `notifications` is what is asserted.

const UNIT = '11111111-1111-4111-8111-111111111111'
const TICKET = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; rows: (t: string) => Array<Record<string, unknown>> },
  send: vi.fn(),
  deliver: vi.fn(),
  push: vi.fn(),
  report: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'HOA', hub_type: 'hoa' })) }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => [{ unit_id: UNIT, association_id: 'assoc-1' }]) }))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: vi.fn(async () => ({ impersonating: false })),
  IMPERSONATION_READONLY_MSG: 'read only',
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/arc-review/server', () => ({ startBoardArcReview: vi.fn(), closeArcReviewsOnWithdraw: vi.fn() }))
vi.mock('@/lib/arc-review/precheck-binding', () => ({ bindPrecheckRun: vi.fn(async () => ({ runId: null })) }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: h.send } }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: h.report }))
// Anything that could send must never be reached.
vi.mock('@/lib/communications/deliver', () => ({ deliverCommunication: h.deliver }))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: h.deliver }))
vi.mock('web-push', () => ({ default: { sendNotification: h.push }, sendNotification: h.push }))

const { addTicketMessage } = await import('./resident-tickets')
const { createArcRequest, createViolationReport } = await import('./resident-submissions')

const MEMBERS = [
  { org_id: 'org-1', user_id: 'board-1', role: 'board' },
  { org_id: 'org-1', user_id: 'admin-1', role: 'admin' },
  { org_id: 'org-1', user_id: 'res-1', role: 'resident' },
  { org_id: 'org-1', user_id: 'dual-1', role: 'board' },
  { org_id: 'org-2', user_id: 'other-board', role: 'board' },
]

function seed(failNotifications = false) {
  h.db = memorySupabase(
    {
      org_members: MEMBERS,
      tickets: [{ id: TICKET, organization_id: 'org-1', subject: 'Broken gate' }],
    },
    {
      failOn: (c) =>
        failNotifications && c.table === 'notifications' && c.op === 'insert'
          ? { code: 'XX000', message: 'boom' }
          : null,
    },
  )
}

const ARC = {
  unitId: UNIT,
  category: 'fence' as const,
  summary: 'Fence',
  scopeDescription: 'Six foot white vinyl privacy fence on the rear line.',
}
const REPORT = {
  category: 'noise' as never,
  description: 'Loud music every night after midnight.',
  aboutAddress: '12 Oak Lane',
}

const bell = () => h.db.rows('notifications')
const userIds = () => bell().map((r) => r.user_id).sort()

beforeEach(() => {
  h.send.mockReset()
  h.deliver.mockReset()
  h.push.mockReset()
  h.report.mockReset()
  seed()
})

function expectNoSends() {
  expect(h.send).not.toHaveBeenCalled()
  expect(h.deliver).not.toHaveBeenCalled()
  expect(h.push).not.toHaveBeenCalled()
}

describe('resident reply on a ticket', () => {
  it('writes one bell row per board and admin member, in the right org', async () => {
    const r = await addTicketMessage(TICKET, 'Still broken.')
    expect(r.ok).toBe(true)
    expect(userIds()).toEqual(['admin-1', 'board-1', 'dual-1'])
    const row = bell()[0]
    expect(row).toMatchObject({
      organization_id: 'org-1',
      kind: 'ticket.resident_reply',
      title: "New reply on 'Broken gate'",
      link: `/tickets/${TICKET}`,
      entity_type: 'ticket_message',
    })
    expect(bell().every((x) => x.organization_id === 'org-1')).toBe(true)
    expect(userIds()).not.toContain('other-board')
    expectNoSends()
  })

  it('dedupes per message id and gives each new message its own rows', async () => {
    await addTicketMessage(TICKET, 'First.')
    const first = bell()
    const { writeBoardBellRows, ticketReplyBell } = await import('./board-in-app-notify')
    const again = ticketReplyBell({
      organizationId: 'org-1',
      actorId: 'user-1',
      ticketId: TICKET,
      messageId: String(first[0].entity_id),
      subject: 'Broken gate',
    })
    expect(await writeBoardBellRows(h.db.client as never, again)).toBe(0)
    expect(bell()).toHaveLength(3)
    await addTicketMessage(TICKET, 'Second.')
    expect(bell()).toHaveLength(6)
  })

  it('does not notify the acting resident, even if they also hold a board seat', async () => {
    // memorySupabase signs in as user-1; make that person a board member too.
    h.db = memorySupabase({
      org_members: [...MEMBERS, { org_id: 'org-1', user_id: 'user-1', role: 'board' }],
      tickets: [{ id: TICKET, organization_id: 'org-1', subject: 'Broken gate' }],
    })
    await addTicketMessage(TICKET, 'Mine.')
    expect(userIds()).not.toContain('user-1')
    expect(bell()).toHaveLength(3)
  })

  it('still succeeds when the bell write fails, and reports it', async () => {
    seed(true)
    const r = await addTicketMessage(TICKET, 'Still broken.')
    expect(r.ok).toBe(true)
    expect(h.db.rows('ticket_messages')).toHaveLength(1)
    expect(bell()).toHaveLength(0)
    expect(h.report).toHaveBeenCalledTimes(1)
    expectNoSends()
  })
})

describe('resident files an ARC request', () => {
  it('writes one arc.created row per board member linking to /arc/[id]', async () => {
    const r = await createArcRequest(ARC)
    expect(r.ok).toBe(true)
    const id = r.ok ? r.data.requestId : ''
    expect(userIds()).toEqual(['admin-1', 'board-1', 'dual-1'])
    expect(bell()[0]).toMatchObject({
      kind: 'arc.created',
      title: 'New ARC request: Fence',
      link: `/arc/${id}`,
      entity_type: 'arc_request',
      entity_id: id,
      organization_id: 'org-1',
    })
    expectNoSends()
  })

  it('does not fail the submission when the bell write fails', async () => {
    seed(true)
    const r = await createArcRequest(ARC)
    expect(r.ok).toBe(true)
    expect(h.db.rows('arc_requests')).toHaveLength(1)
    expect(h.report).toHaveBeenCalledTimes(1)
    expectNoSends()
  })
})

describe('resident reports a concern', () => {
  it('writes one concern.created row per board member linking to the report', async () => {
    const r = await createViolationReport(REPORT)
    expect(r.ok).toBe(true)
    const id = r.ok ? r.data.reportId : ''
    expect(userIds()).toEqual(['admin-1', 'board-1', 'dual-1'])
    expect(bell()[0]).toMatchObject({
      kind: 'concern.created',
      title: 'New concern reported',
      link: `/violations/reports/${id}`,
      entity_id: id,
    })
    // No address or description in the bell row.
    expect(JSON.stringify(bell())).not.toContain('Oak Lane')
    expectNoSends()
  })

  it('does not fail the submission when the bell write fails', async () => {
    seed(true)
    const r = await createViolationReport(REPORT)
    expect(r.ok).toBe(true)
    expect(h.report).toHaveBeenCalledTimes(1)
    expectNoSends()
  })
})
