import { describe, expect, it } from 'vitest'
import {
  buildAccess,
  buildChecklist,
  buildConnections,
  buildOpenWork,
  buildPrintableSummary,
  memberLabel,
  type ConnectionsInput,
  type HandoverModel,
  type MemberRowInput,
} from './model'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'
const R = 'rrrrrrrr-0000-4000-8000-000000000004'
const GONE = 'dddddddd-0000-4000-8000-000000000005'

const rows: MemberRowInput[] = [
  { user_id: B, role: 'board', joined_at: '2025-01-01', profile: { email: 'zed@example.test', full_name: 'Zed Board' } },
  { user_id: R, role: 'resident', joined_at: null, profile: { email: 'res@example.test', full_name: 'Resident Person' } },
  { user_id: A, role: 'admin', joined_at: '2024-01-01', profile: { email: 'pat@example.test', full_name: 'Pat Admin' } },
  { user_id: C, role: 'board', joined_at: null, profile: { email: 'anna@example.test', full_name: '  ' } },
]

describe('buildAccess', () => {
  const access = buildAccess(rows, new Map([[A, '2026-10-01T10:00:00Z']]))

  it('lists board and admins only, admins first, then by name with unnamed last', () => {
    expect(access.board.map((m) => m.userId)).toEqual([A, B, C])
    expect(access.board[0]).toMatchObject({ role: 'admin', name: 'Pat Admin', lastSignInAt: '2026-10-01T10:00:00Z' })
  })

  it('counts residents and never lists them', () => {
    expect(access.residentCount).toBe(1)
    expect(JSON.stringify(access)).not.toContain('Resident Person')
    expect(JSON.stringify(access)).not.toContain('res@example.test')
  })

  it('blank names become null; a missing sign-in is null, not a guess', () => {
    const c = access.board.find((m) => m.userId === C)!
    expect(c.name).toBeNull()
    expect(c.lastSignInAt).toBeNull()
    expect(memberLabel(c)).toBe('anna@example.test')
    expect(memberLabel({ userId: C, name: null, email: null })).toBe('Member cccccccc')
  })
})

const fullConnections: ConnectionsInput = {
  mailbox: { connected_by: A, connected_at: '2026-01-02T00:00:00Z', sync_status: 'ok', provider: 'gmail' },
  plaidItems: [
    { id: 'p2', institution_name: 'Second Bank', created_by: GONE, created_at: '2026-03-01T00:00:00Z', last_synced_at: null },
    { id: 'p1', institution_name: 'First Bank', created_by: B, created_at: '2026-02-01T00:00:00Z', last_synced_at: null },
  ],
  zelle: { state: 'configured', updatedAt: '2026-04-01T00:00:00Z' },
  hasStripeCustomer: true,
}

describe('buildConnections', () => {
  const board = new Set([A, B, C])

  it('one row per connection, with owner, transfer/reconnect link and admin-only flag', () => {
    const cs = buildConnections(fullConnections, board)
    expect(cs.map((c) => c.key)).toEqual(['mailbox', 'plaid:p1', 'plaid:p2', 'zelle', 'stripe'])
    expect(cs[0]).toMatchObject({ ownerUserId: A, ownerGone: false, status: 'connected', href: '/settings/mailbox', action: 'Reconnect', adminOnly: true })
    expect(cs[1]).toMatchObject({ ownerUserId: B, href: '/accounting/bank', label: 'Bank connection (Plaid) · First Bank' })
    expect(cs[3]).toMatchObject({ status: 'connected', href: '/settings/payments', action: 'Transfer', since: '2026-04-01T00:00:00Z' })
    expect(cs[4]).toMatchObject({ status: 'connected', href: '/settings/billing', action: 'Transfer' })
  })

  it('flags an owner who is no longer on the board', () => {
    const p2 = buildConnections(fullConnections, board).find((c) => c.key === 'plaid:p2')!
    expect(p2).toMatchObject({ ownerUserId: GONE, ownerGone: true })
  })

  it('a stalled mailbox and unverified Zelle need attention; nothing set up reads as not connected', () => {
    const cs = buildConnections(
      { mailbox: { connected_by: null, connected_at: 'x', sync_status: 'auth_failed', provider: 'gmail' }, plaidItems: [], zelle: { state: 'unverified', updatedAt: null }, hasStripeCustomer: false },
      board,
    )
    expect(cs.map((c) => [c.key, c.status])).toEqual([
      ['mailbox', 'needs_attention'],
      ['plaid', 'not_connected'],
      ['zelle', 'needs_attention'],
      ['stripe', 'not_connected'],
    ])
    const none = buildConnections({ mailbox: null, plaidItems: [], zelle: { state: 'no_association', updatedAt: null }, hasStripeCustomer: false }, board)
    expect(none.every((c) => c.status === 'not_connected')).toBe(true)
  })

  it('never carries a secret or account identifier in its text', () => {
    const text = JSON.stringify(buildConnections(fullConnections, board))
    for (const banned of ['access_token', 'stripe_customer_id', 'cus_', '"sig"', 'recipient":']) expect(text).not.toContain(banned)
  })
})

describe('buildOpenWork', () => {
  const board = new Set([A, B])
  const work = buildOpenWork(
    {
      threads: [{ assigned_to: A }, { assigned_to: A }, { assigned_to: GONE }, { assigned_to: null }],
      actionItems: [
        { assignee_user_id: B, ticket_id: null },
        { assignee_user_id: B, ticket_id: 't1' },
        { assignee_user_id: GONE, ticket_id: 't2' },
      ],
      tickets: [{ submitted_by: A }, { submitted_by: R }, { submitted_by: GONE }],
      drafts: [{ created_by: B }, { created_by: null }],
    },
    board,
  )

  it('buckets each open item by its owner', () => {
    expect(work.byMember[A]).toEqual({ threads: 2, actionItems: 0, ticketTasks: 0, ticketsFiled: 1, draftsAwaiting: 0 })
    expect(work.byMember[B]).toEqual({ threads: 0, actionItems: 1, ticketTasks: 1, ticketsFiled: 0, draftsAwaiting: 1 })
  })

  it('work assigned to someone off the board goes to former members; residents’ own tickets are not counted', () => {
    expect(work.formerMembers).toEqual({ threads: 1, actionItems: 0, ticketTasks: 1, ticketsFiled: 0, draftsAwaiting: 0 })
  })

  it('every board member has a row, even with no work', () => {
    const empty = buildOpenWork({ threads: [], actionItems: [], tickets: [], drafts: [] }, new Set([C]))
    expect(empty.byMember[C]).toEqual({ threads: 0, actionItems: 0, ticketTasks: 0, ticketsFiled: 0, draftsAwaiting: 0 })
  })
})

function model(over: Partial<HandoverModel> = {}): HandoverModel {
  const access = buildAccess(rows, new Map())
  const ids = new Set(access.board.map((m) => m.userId))
  return {
    generatedAt: '2026-10-20T12:00:00.000Z',
    orgName: 'Maple Grove HOA',
    access,
    connections: buildConnections(fullConnections, ids),
    openWork: buildOpenWork({ threads: [{ assigned_to: B }], actionItems: [], tickets: [], drafts: [] }, ids),
    exportTableCount: 15,
    ...over,
  }
}

describe('buildChecklist', () => {
  it('with nobody leaving: admin stays, owned connections are fine, unowned ones are fine, export is to do', () => {
    const items = buildChecklist(model(), new Set())
    const byId = Object.fromEntries(items.map((i) => [i.id, i.state]))
    expect(byId['admin-stays']).toBe('done')
    expect(byId['conn:mailbox']).toBe('done')
    expect(byId['conn:plaid:p2']).toBe('todo') // owner already gone
    expect(byId['conn:zelle']).toBe('done')
    expect(byId['export']).toBe('todo')
  })

  it('marking the only admin and a board member as leaving raises the right items', () => {
    const items = buildChecklist(model(), new Set([A, B]))
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId['admin-stays']!.state).toBe('todo')
    expect(byId[`remove:${A}`]!.text).toContain('Pat Admin')
    expect(byId['conn:mailbox']).toMatchObject({ state: 'todo', href: '/settings/mailbox' })
    expect(byId['conn:mailbox']!.text).toContain('leaving member')
    expect(byId['conn:plaid:p1']!.state).toBe('todo')
    // Unowned connections become "check this" whenever anyone leaves.
    expect(byId['conn:zelle']!.state).toBe('todo')
    expect(byId[`work:${B}`]).toMatchObject({ state: 'todo', text: 'Reassign Zed Board’s open work (1 item).' })
    expect(byId[`work:${A}`]!.state).toBe('done')
  })

  it('a section that failed to load is an unknown item, never a pass', () => {
    const items = buildChecklist(model({ access: null, connections: null, openWork: null }), new Set())
    expect(items.filter((i) => i.state === 'unknown').map((i) => i.id)).toEqual(['access', 'connections', 'work'])
  })
})

describe('buildPrintableSummary', () => {
  it('names board members and roles, marks who is leaving, and holds no emails or ids', () => {
    const text = buildPrintableSummary(model(), new Set([B])).join('\n')
    expect(text).toContain('Board handover summary — Maple Grove HOA')
    expect(text).toContain('Prepared 2026-10-20')
    expect(text).toContain('Pat Admin — Admin')
    expect(text).toContain('Zed Board — Board member (leaving)')
    expect(text).toContain('Residents with access: 1')
    expect(text).toContain('Bank connection (Plaid) · Second Bank: connected, set up by a former member')
    expect(text).toContain('15 spreadsheets')
    expect(text).not.toMatch(/@/)
    for (const id of [A, B, C, R, GONE]) expect(text).not.toContain(id)
    expect(text).not.toContain('Resident Person')
  })

  it('an unnamed member prints as "Unnamed member", never their email', () => {
    const text = buildPrintableSummary(model(), new Set([C])).join('\n')
    expect(text).toContain('Unnamed member — Board member (leaving)')
    expect(text).toContain('Invite Unnamed member’s successor')
    expect(text).not.toContain('anna@example.test')
  })
})
