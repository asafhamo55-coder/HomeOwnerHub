import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-149 updateGaRegistration: board/admin only and refused before any
// client exists; Georgia associations of the caller's org only; every save
// writes a SIGNED record (the gate trusts nothing else), keeps every other
// settings key, and writes one audit row with ids and codes only — never
// the confirmation number, a date, an address or an agent's name.

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const MEETING = 'b0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  state: 'GA' as string | null,
  settings: {} as Record<string, unknown>,
  clients: 0,
  updates: [] as Array<Record<string, unknown>>,
  audit: [] as Array<Record<string, unknown>>,
  secret: 'test-secret' as string | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => h.secret }))

function fakeClient() {
  h.clients += 1
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        update: (v: Record<string, unknown>) => ((update = v), q),
        insert: (row: Record<string, unknown>) => {
          if (table === 'audit_log') h.audit.push(row)
          return Promise.resolve({ error: null })
        },
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            h.updates.push(update)
            h.settings = update.compliance_settings as Record<string, unknown>
            return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(res)
          }
          const rows =
            table === 'associations' && filters.organization_id === ORG && filters.id === ASSOC
              ? [{ id: ASSOC, state: h.state, governing_law_state: null, compliance_settings: h.settings }]
              : []
          return Promise.resolve({ data: rows, error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { updateGaRegistration } = await import('./actions')
const { readGaRegistration, gaStandingOf } = await import('./store')
const { GA_REGISTRATION_AUDIT_ACTION, amendmentFor } = await import('./model')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.state = 'GA'
  h.settings = { late_fee_policy: { kept: true } }
  h.clients = 0
  h.updates = []
  h.audit = []
  h.secret = 'test-secret'
})

const registration = {
  op: 'add_filing' as const,
  associationId: ASSOC,
  kind: 'registration' as const,
  filedOn: '2026-10-20',
  confirmation: 'GA-2027-00123',
}

describe('updateGaRegistration', () => {
  it('refuses a resident before any client is made', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await updateGaRegistration(registration)).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.clients).toBe(0)
  })

  it('records a signed registration the gate can verify, keeping other settings keys', async () => {
    expect(await updateGaRegistration(registration)).toEqual({ ok: true })
    expect(h.settings.late_fee_policy).toEqual({ kept: true })
    const read = readGaRegistration(ASSOC, h.settings, 'test-secret')
    expect(read.state).toBe('saved')
    expect(read.record.decision).toBe('register')
    expect(read.record.filings[0]).toMatchObject({ kind: 'registration', filedOn: '2026-10-20', confirmation: 'GA-2027-00123', coversYear: 2027 })
    expect(gaStandingOf(ASSOC, h.settings, 'test-secret', '2027-03-01').status).toBe('registered')
  })

  it('audits ids and codes only', async () => {
    await updateGaRegistration(registration)
    await updateGaRegistration({ op: 'details', associationId: ASSOC, mailingAddress: '1 Peachtree St', registeredAgent: 'Jane Agent' })
    expect(h.audit).toHaveLength(2)
    for (const row of h.audit) {
      expect(row).toMatchObject({ action: GA_REGISTRATION_AUDIT_ACTION, entity_type: 'association', entity_id: ASSOC, org_id: ORG })
      const text = JSON.stringify(row.metadata)
      expect(text).not.toContain('GA-2027-00123')
      expect(text).not.toContain('2026-10-20')
      expect(text).not.toContain('Peachtree')
      expect(text).not.toContain('Jane')
    }
    expect(h.audit[0]!.metadata).toMatchObject({ op: 'add_filing', kind: 'registration' })
  })

  it('marks a BL-151 election amendment done', async () => {
    await updateGaRegistration({ op: 'no_change', associationId: ASSOC, meetingId: MEETING })
    expect(amendmentFor(readGaRegistration(ASSOC, h.settings, 'test-secret').record, MEETING)).toEqual({ kind: 'no_change' })
    await updateGaRegistration({ op: 'add_filing', associationId: ASSOC, kind: 'amendment', filedOn: '2026-10-20', meetingId: MEETING })
    const answered = amendmentFor(readGaRegistration(ASSOC, h.settings, 'test-secret').record, MEETING)
    expect(answered).toMatchObject({ kind: 'filed', filing: { reason: 'officers', meetingId: MEETING } })
    expect(h.audit.at(-1)!.metadata).toMatchObject({ op: 'add_filing', kind: 'amendment', meeting_id: MEETING })
  })

  it('refuses an association outside Georgia, and one not in the org, writing nothing', async () => {
    h.state = 'FL'
    expect(await updateGaRegistration(registration)).toEqual({ ok: false, error: 'The registration kit is for Georgia associations.' })
    h.state = 'GA'
    const other = await updateGaRegistration({ ...registration, associationId: 'a0000000-0000-4000-8000-000000000009' })
    expect(other.ok).toBe(false)
    expect(h.updates).toEqual([])
    expect(h.audit).toEqual([])
  })

  it('refuses a future filing day and a confirmation number with markup', async () => {
    expect(await updateGaRegistration({ ...registration, filedOn: '2099-01-01' })).toMatchObject({ ok: false, field: 'filedOn' })
    expect(await updateGaRegistration({ ...registration, confirmation: '<b>1</b>' })).toMatchObject({ ok: false, field: 'confirmation' })
    expect(h.updates).toEqual([])
  })

  it('refuses without the signing secret', async () => {
    h.secret = null
    const r = await updateGaRegistration(registration)
    expect(r.ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('a forged record is not built on: the save starts from empty', async () => {
    h.settings = { ga_registration: { v: 1, record: { decision: 'register' }, updated_at: 'x', updated_by: null, sig: 'bad' } }
    await updateGaRegistration({ op: 'decide', associationId: ASSOC, decision: 'opt_out' })
    const read = readGaRegistration(ASSOC, h.settings, 'test-secret')
    expect(read.state).toBe('saved')
    expect(read.record.filings).toEqual([])
    expect(read.record.decision).toBe('opt_out')
  })
})
