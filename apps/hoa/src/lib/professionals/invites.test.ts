import { beforeEach, describe, expect, it, vi } from 'vitest'

// acceptProfessionalInvite: the one place a professional's membership is
// created. A table-keyed fake database with real claim semantics (the
// conditional UPDATE) so the double-accept and release paths are exercised.

const SECRET = 'a'.repeat(40)
const ORG = '00000000-0000-4000-8000-0000000000aa'
const INVITE = '11111111-1111-4111-8111-111111111111'
const USER = '33333333-3333-4333-8333-333333333333'

interface InviteRow {
  id: string
  organization_id: string
  email: string
  role: 'cpa' | 'attorney'
  access_expires_on: string
  general_counsel: boolean
  matters: unknown
  created_by: string
  link_expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

const h = vi.hoisted(() => ({
  m6: true,
  user: null as null | { id: string; email: string | null; email_confirmed_at: string | null },
  invite: null as unknown,
  memberError: null as null | { code: string },
  memberInserts: [] as Array<Record<string, unknown>>,
  assignmentInserts: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  adminCalls: 0,
}))

vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => h.user) }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'UTC') }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    h.adminCalls += 1
    return {
      from(table: string) {
        let op: 'select' | 'update' | 'insert' = 'select'
        let values: Record<string, unknown> = {}
        const filters: Array<[string, unknown]> = []
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = () => b
        b.is = (col: string, v: unknown) => (filters.push([col, v]), b)
        b.update = (v: Record<string, unknown>) => ((op = 'update'), (values = v), b)
        b.insert = (v: Record<string, unknown>) => {
          op = 'insert'
          values = v
          return b
        }
        b.maybeSingle = async () => ({ data: h.invite, error: null })
        b.then = (res: (v: unknown) => unknown) => {
          const inv = h.invite as InviteRow | null
          if (table === 'professional_invites' && op === 'update') {
            const isClaim = filters.some(([c]) => c === 'accepted_at')
            if (isClaim) {
              // The conditional UPDATE: only one caller finds it unclaimed.
              if (inv && !inv.accepted_at && !inv.revoked_at) {
                inv.accepted_at = String(values.accepted_at)
                return Promise.resolve({ data: [{ id: inv.id }], error: null }).then(res)
              }
              return Promise.resolve({ data: [], error: null }).then(res)
            }
            if (inv) inv.accepted_at = (values.accepted_at as string | null) ?? null // release
            return Promise.resolve({ data: null, error: null }).then(res)
          }
          if (table === 'org_members' && op === 'insert') {
            h.memberInserts.push(values)
            return Promise.resolve({ error: h.memberError }).then(res)
          }
          if (table === 'matter_assignments' && op === 'insert') {
            h.assignmentInserts.push(values)
            return Promise.resolve({ error: null }).then(res)
          }
          if (table === 'audit_log' && op === 'insert') {
            h.audits.push(values)
            return Promise.resolve({ error: null }).then(res)
          }
          return Promise.resolve({ data: null, error: null }).then(res)
        }
        return b
      },
    }
  },
}))

process.env.PRO_INVITE_SECRET = SECRET
const { signInvite } = await import('./invite-token')
const { acceptProfessionalInvite } = await import('./invites')

const day = (offset: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const goodSig = signInvite(INVITE, SECRET)

function freshInvite(over: Partial<InviteRow> = {}): InviteRow {
  return {
    id: INVITE,
    organization_id: ORG,
    email: 'cpa@example.test',
    role: 'cpa',
    access_expires_on: day(30),
    general_counsel: false,
    matters: [],
    created_by: '44444444-4444-4444-8444-444444444444',
    link_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    accepted_at: null,
    revoked_at: null,
    ...over,
  }
}

beforeEach(() => {
  h.m6 = true
  h.user = { id: USER, email: 'CPA@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
  h.invite = freshInvite()
  h.memberError = null
  h.memberInserts = []
  h.assignmentInserts = []
  h.audits = []
  h.adminCalls = 0
})

describe('acceptProfessionalInvite', () => {
  it('creates exactly the membership the board recorded, assigns its matters, and audits it', async () => {
    h.invite = freshInvite({
      role: 'attorney',
      general_counsel: true,
      matters: [{ type: 'violation', id: '55555555-5555-4555-8555-555555555555' }, { type: 'nonsense', id: 'x' }],
    })
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toEqual({ ok: true, data: undefined })
    expect(h.memberInserts).toHaveLength(1)
    expect(h.memberInserts[0]).toMatchObject({
      org_id: ORG,
      user_id: USER,
      role: 'attorney',
      general_counsel: true,
      access_expires_at: `${day(30)}T23:59:59Z`,
    })
    expect(h.assignmentInserts).toHaveLength(1)
    expect(h.assignmentInserts[0]).toMatchObject({ organization_id: ORG, user_id: USER, matter_type: 'violation' })
    expect(h.audits[0]).toMatchObject({ action: 'pro.invite_accepted', entity_id: INVITE, org_id: ORG })
    expect(JSON.stringify(h.audits[0])).not.toContain('example.test')
  })

  it('refuses a forged, missing, malformed or other invitation’s signature before touching the database', async () => {
    for (const sig of ['', 'f'.repeat(64), signInvite('22222222-2222-4222-8222-222222222222', SECRET), 'zz']) {
      const r = await acceptProfessionalInvite(INVITE, sig)
      expect(r.ok, sig).toBe(false)
    }
    expect((await acceptProfessionalInvite('not-a-uuid', goodSig)).ok).toBe(false)
    expect(h.adminCalls).toBe(0)
    expect(h.memberInserts).toHaveLength(0)
  })

  it('needs a signed-in account, and the switch on', async () => {
    h.user = null
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false })
    h.user = { id: USER, email: 'cpa@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
    h.m6 = false
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false })
    expect(h.memberInserts).toHaveLength(0)
  })

  it('refuses the wrong signed-in account, and an unconfirmed email, without claiming the invitation', async () => {
    h.user = { id: USER, email: 'someone.else@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false, error: expect.stringMatching(/Sign in with the email address/) })
    h.user = { id: USER, email: 'cpa@example.test', email_confirmed_at: null }
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false, error: expect.stringMatching(/Sign in with the email address/) })
    expect((h.invite as InviteRow).accepted_at).toBeNull()
    expect(h.memberInserts).toHaveLength(0)
  })

  it.each([
    ['revoked', { revoked_at: '2026-01-01T00:00:00Z' }],
    ['already used', { accepted_at: '2026-01-01T00:00:00Z' }],
    ['past its seven days', { link_expires_at: '2020-01-01T00:00:00Z' }],
    ['asking for access that has already ended', { access_expires_on: '2020-01-01' }],
    ['asking for more than a year', { access_expires_on: day(500) }],
  ])('refuses an invitation that is %s', async (_name, over) => {
    h.invite = freshInvite(over as Partial<InviteRow>)
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false })
    expect(h.memberInserts).toHaveLength(0)
  })

  it('refuses an invitation that does not exist', async () => {
    h.invite = null
    expect(await acceptProfessionalInvite(INVITE, goodSig)).toMatchObject({ ok: false })
  })

  it('a concurrent double accept creates one membership: the conditional UPDATE lets one caller win', async () => {
    const [a, b] = await Promise.all([acceptProfessionalInvite(INVITE, goodSig), acceptProfessionalInvite(INVITE, goodSig)])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
    expect(h.memberInserts).toHaveLength(1)
    expect(h.audits).toHaveLength(1)
  })

  it('a unique violation (already a member) releases the invitation and says so', async () => {
    h.memberError = { code: '23505' }
    const r = await acceptProfessionalInvite(INVITE, goodSig)
    expect(r).toEqual({ ok: false, error: 'You already have access to this HOA.' })
    expect((h.invite as InviteRow).accepted_at).toBeNull()
    expect(h.assignmentInserts).toHaveLength(0)
    expect(h.audits).toHaveLength(0)
  })

  it('any other failure creating the membership also releases it', async () => {
    h.memberError = { code: '23514' }
    expect((await acceptProfessionalInvite(INVITE, goodSig)).ok).toBe(false)
    expect((h.invite as InviteRow).accepted_at).toBeNull()
  })
})
