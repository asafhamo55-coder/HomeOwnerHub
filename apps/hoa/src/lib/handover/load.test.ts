import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { loadAccess, loadConnections, loadHandover, loadLastSignIns, loadOpenWork, type HandoverDb } from './load'

type Resp = { data: unknown; error: { code: string; message: string } | null }

/**
 * A stand-in for the Supabase query builder: records every chained call,
 * resolves the next canned response for the table. Also fakes
 * auth.admin.getUserById for the last-sign-in read.
 */
function fakeDb(responses: Record<string, Resp[]>, signIns: Record<string, string | null | Error> = {}) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] }
      calls.push(entry)
      const queue = responses[table] ?? []
      const builder: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit', 'not']) {
        builder[op] = (...args: unknown[]) => {
          entry.ops.push([op, args])
          return builder
        }
      }
      builder.then = (resolve: (r: Resp) => unknown) => resolve(queue.shift() ?? { data: [], error: null })
      return builder
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => {
          const v = signIns[id]
          if (v instanceof Error) throw v
          return { data: { user: { id, last_sign_in_at: v ?? null } }, error: null }
        }),
      },
    },
  }
  return { db: db as unknown as HandoverDb, calls, raw: db }
}

const ok = (data: unknown): Resp => ({ data, error: null })
const fail: Resp = { data: null, error: { code: '42501', message: 'denied' } }

const A = 'user-admin'
const B = 'user-board'

const memberRows = [
  { user_id: A, role: 'admin', joined_at: null, profile: { email: 'a@example.test', full_name: 'Ann' } },
  { user_id: B, role: 'board', joined_at: null, profile: { email: 'b@example.test', full_name: 'Bo' } },
  { user_id: 'user-res', role: 'resident', joined_at: null, profile: { email: 'r@example.test', full_name: 'Res' } },
]

function selectOf(calls: { table: string; ops: [string, unknown[]][] }[], table: string): string {
  const c = calls.find((x) => x.table === table)!
  return c.ops.find(([op]) => op === 'select')![1][0] as string
}

describe('loadLastSignIns', () => {
  it('reads each user, and a failure costs only that user’s date', async () => {
    const { db } = fakeDb({}, { [A]: '2026-10-19T08:00:00Z', [B]: new Error('auth down') })
    const m = await loadLastSignIns(db, [A, B])
    expect(m.get(A)).toBe('2026-10-19T08:00:00Z')
    expect(m.get(B)).toBeNull()
  })
})

describe('loadAccess', () => {
  it('scopes to the org and asks auth only about board and admins', async () => {
    const f = fakeDb({ org_members: [ok(memberRows)] }, { [A]: '2026-10-19T08:00:00Z' })
    const access = await loadAccess(f.db, 'org-1')
    expect(f.calls[0]!.ops).toContainEqual(['eq', ['org_id', 'org-1']])
    expect(f.raw.auth.admin.getUserById.mock.calls.map((c) => c[0]).sort()).toEqual([A, B])
    expect(access).toMatchObject({ residentCount: 1, board: [{ userId: A, lastSignInAt: '2026-10-19T08:00:00Z' }, { userId: B }] })
  })

  it('a failed member read is null, not an empty board', async () => {
    expect(await loadAccess(fakeDb({ org_members: [fail] }).db, 'org-1')).toBeNull()
  })
})

describe('loadConnections', () => {
  it('names safe columns only — never the Plaid access token or the mailbox cursor', async () => {
    const admin = fakeDb({
      mailbox_accounts: [ok([{ connected_by: A, connected_at: '2026-01-01T00:00:00Z', sync_status: 'ok', provider: 'gmail' }])],
      plaid_items: [ok([{ id: 'p1', institution_name: 'Bank', created_by: B, created_at: '2026-02-01T00:00:00Z', last_synced_at: null }])],
      orgs: [ok([{ stripe_customer_id: 'cus_SECRET123' }])],
    })
    const db = fakeDb({ associations: [ok([])] })
    const cs = await loadConnections({ db: db.db, admin: admin.db, orgId: 'org-1', orgName: 'X', zelleSecret: 's' }, new Set([A, B]))
    expect(selectOf(admin.calls, 'plaid_items')).not.toContain('access_token')
    expect(selectOf(admin.calls, 'mailbox_accounts')).not.toMatch(/cursor|secret|token/)
    expect(admin.calls.find((c) => c.table === 'plaid_items')!.ops).toContainEqual(['eq', ['organization_id', 'org-1']])
    expect(admin.calls.find((c) => c.table === 'orgs')!.ops).toContainEqual(['eq', ['id', 'org-1']])
    expect(JSON.stringify(cs)).not.toContain('cus_SECRET123')
    expect(cs!.map((c) => [c.key, c.status, c.ownerUserId])).toEqual([
      ['mailbox', 'connected', A],
      ['plaid:p1', 'connected', B],
      ['zelle', 'not_connected', null],
      ['stripe', 'connected', null],
    ])
  })

  it('reads Zelle state from the association without exposing the recipient', async () => {
    const admin = fakeDb({ mailbox_accounts: [ok([])], plaid_items: [ok([])], orgs: [ok([{ stripe_customer_id: null }])] })
    const db = fakeDb({
      associations: [ok([{ id: 'assoc-1', compliance_settings: { pay_by_zelle: { recipient: 'treasurer@example.test', updated_at: '2026-05-01T00:00:00Z', sig: 'bad' } } }])],
    })
    const cs = await loadConnections({ db: db.db, admin: admin.db, orgId: 'org-1', orgName: 'X', zelleSecret: 's' }, new Set())
    const zelle = cs!.find((c) => c.kind === 'zelle')!
    // The signature does not verify → unverified, which needs attention.
    expect(zelle.status).toBe('needs_attention')
    expect(JSON.stringify(cs)).not.toContain('treasurer@example.test')
  })

  it('any failed read makes the section null', async () => {
    const admin = fakeDb({ mailbox_accounts: [ok([])], plaid_items: [fail], orgs: [ok([])] })
    const db = fakeDb({ associations: [ok([])] })
    expect(await loadConnections({ db: db.db, admin: admin.db, orgId: 'org-1', orgName: 'X', zelleSecret: null }, new Set())).toBeNull()
  })
})

describe('loadOpenWork', () => {
  it('asks only for open rows in this org and buckets them by owner', async () => {
    const f = fakeDb({
      inbox_threads: [ok([{ assigned_to: A }])],
      meeting_action_items: [ok([{ assignee_user_id: B, ticket_id: 't1' }])],
      tickets: [ok([{ submitted_by: B }])],
      inbox_drafts: [ok([{ created_by: A }])],
    })
    const work = await loadOpenWork(f.db, 'org-1', new Set([A, B]))
    const ops = (t: string) => f.calls.find((c) => c.table === t)!.ops
    expect(ops('inbox_threads')).toContainEqual(['in', ['status', ['needs_review', 'open', 'waiting']]])
    expect(ops('meeting_action_items')).toContainEqual(['in', ['status', ['open', 'in_progress']]])
    expect(ops('tickets')).toContainEqual(['is', ['deleted_at', null]])
    expect(ops('inbox_drafts')).toContainEqual(['eq', ['status', 'draft']])
    for (const t of ['inbox_threads', 'tickets', 'inbox_drafts']) expect(ops(t)).toContainEqual(['eq', ['organization_id', 'org-1']])
    expect(ops('meeting_action_items')).toContainEqual(['eq', ['org_id', 'org-1']])
    // Subjects and bodies are never selected.
    for (const t of ['inbox_threads', 'tickets', 'inbox_drafts']) expect(selectOf(f.calls, t)).not.toMatch(/subject|body|description/)
    expect(work!.byMember[A]).toMatchObject({ threads: 1, draftsAwaiting: 1 })
    expect(work!.byMember[B]).toMatchObject({ ticketTasks: 1, ticketsFiled: 1 })
  })

  it('a failed read is null', async () => {
    const f = fakeDb({ inbox_threads: [fail] })
    expect(await loadOpenWork(f.db, 'org-1', new Set())).toBeNull()
  })
})

describe('loadHandover', () => {
  it('assembles every section, stamped with the clock', async () => {
    const admin = fakeDb({
      org_members: [ok(memberRows)],
      mailbox_accounts: [ok([])],
      plaid_items: [ok([])],
      orgs: [ok([{ stripe_customer_id: null }])],
    })
    const db = fakeDb({ associations: [ok([])] })
    const m = await loadHandover({ db: db.db, admin: admin.db, orgId: 'org-1', orgName: 'Maple', now: () => new Date('2026-10-20T12:00:00Z'), zelleSecret: null })
    expect(m.generatedAt).toBe('2026-10-20T12:00:00.000Z')
    expect(m.orgName).toBe('Maple')
    expect(m.access!.board).toHaveLength(2)
    expect(m.connections).toHaveLength(4)
    expect(Object.keys(m.openWork!.byMember).sort()).toEqual([A, B])
    expect(m.exportTableCount).toBeGreaterThan(0)
  })

  it('without the member list, ownership can’t be attributed: the other sections are not loaded either', async () => {
    const admin = fakeDb({ org_members: [fail] })
    const db = fakeDb({})
    const m = await loadHandover({ db: db.db, admin: admin.db, orgId: 'org-1', orgName: 'Maple' })
    expect(m).toMatchObject({ access: null, connections: null, openWork: null })
    expect(db.calls).toHaveLength(0)
  })
})
