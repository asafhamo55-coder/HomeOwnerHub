import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-056: the manager-side invitation server actions (RFP bid invitations
// and vendor onboarding invitations) return generic user-facing messages
// and log ids and codes only — never a Postgres or provider message, which
// embeds values (api-route-conventions RC-2).

type DbErr = { code: string; message: string }
type Result = { data?: unknown; error: DbErr | null }
let results: Record<string, Result> = {}

function chain(table: string) {
  let op = 'select'
  const resolve = () => results[`${table}.${op}`] ?? { data: null, error: null }
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit']) c[m] = () => c
  for (const m of ['insert', 'update']) {
    c[m] = () => {
      op = m
      return c
    }
  }
  c.maybeSingle = async () => resolve()
  c.single = async () => resolve()
  c.then = (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onOk, onErr)
  return c
}

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({ from: chain }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Maple HOA' })) }))
// The actions are board-only (security review 2026-10-20); the board/org
// refusals themselves are pinned in board-write-gates / action-org-ownership.
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: 'board', org: { id: 'org-1', name: 'Maple HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: chain,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}))
// Never a real send: the sender is a mock for every test.
const sendEmail = vi.fn()
vi.mock('@/lib/email', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  appUrl: (p: string) => `https://hoa.test${p}`,
}))

import { inviteVendorsToRfp, revokeRfpInvitation } from './rfp-invitations'
import {
  createInvitation,
  listInvitationsResult,
  revokeInvitation,
} from './vendor-invitations'

const LEAK = 'duplicate key value violates unique constraint "x" Key (email)=(jane@example.com)'
const PROVIDER_LEAK = 'Resend: domain not verified for jane@example.com'
const RFP = '11111111-1111-4111-8111-111111111111'
const VENDOR = '22222222-2222-4222-8222-222222222222'
const INV = '99999999-9999-4999-8999-999999999999'

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls])

beforeEach(() => {
  results = {
    'rfps.select': {
      data: { id: RFP, title: 'Roof', rfp_number: 'R-1', status: 'open', submission_deadline: '2099-01-01' },
      error: null,
    },
    'vendors.select': { data: [{ id: VENDOR, legal_name: 'Acme', primary_email: 'vendor@example.com' }], error: null },
    'rfp_invitations.select': { data: [], error: null },
    'vendor_onboarding_invitations.select': { data: { id: INV }, error: null },
  }
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ ok: true, messageId: 'm-1' })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('inviteVendorsToRfp', () => {
  const invite = () => inviteVendorsToRfp({ rfpId: RFP, vendorIds: [VENDOR] })

  it('sends an invitation on the happy path (mock sender)', async () => {
    const r = await invite()
    expect(r).toEqual({ ok: true, data: { sent: 1, skipped: 0, failed: [] } })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('states the association’s insurance minimums in the invitation (BL-084)', async () => {
    vi.stubEnv('PAY_SETTINGS_SECRET', 'test-secret')
    const { signVendorInsuranceSettings, withVendorInsuranceSettings } = await import(
      '@homeowner-portal/workflows/vendor-insurance'
    )
    const ASSOC = '33333333-3333-4333-8333-333333333333'
    results['rfps.select'] = {
      data: { id: RFP, title: 'Roof', rfp_number: 'R-1', status: 'open', submission_deadline: '2099-01-01', association_id: ASSOC },
      error: null,
    }
    results['associations.select'] = {
      data: {
        id: ASSOC,
        compliance_settings: withVendorInsuranceSettings(
          {},
          signVendorInsuranceSettings(
            ASSOC,
            {
              coiRemindersEnabled: true,
              minimums: {
                glPerOccurrenceMin: 1_000_000,
                glAggregateMin: null,
                workersCompRequired: true,
                autoLiabilityMin: null,
                umbrellaMin: 2_000_000,
              },
            },
            { updatedAt: '2026-10-18T00:00:00Z', updatedBy: null },
            'test-secret',
          ),
        ),
      },
      error: null,
    }
    try {
      await invite()
      const email = sendEmail.mock.calls[0][0] as { html: string; text: string }
      expect(email.html).toContain('General liability: $1,000,000 per occurrence')
      expect(email.html).toContain('Workers’ compensation: required')
      expect(email.text).toContain('- General liability: $1,000,000 per occurrence')
      expect(email.text).toContain('- Umbrella / excess liability: $2,000,000')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('a failed minimums read still sends the invitation, without the insurance block', async () => {
    results['rfps.select'] = {
      data: { id: RFP, title: 'Roof', rfp_number: 'R-1', status: 'open', submission_deadline: '2099-01-01', association_id: 'a' },
      error: null,
    }
    results['associations.select'] = { data: null, error: { code: '57014', message: LEAK } }
    const r = await invite()
    expect(r).toEqual({ ok: true, data: { sent: 1, skipped: 0, failed: [] } })
    expect((sendEmail.mock.calls[0][0] as { html: string }).html).not.toContain('Insurance required')
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
  })

  it('an insert failure reports a stable code, not the Postgres message, and logs code + ids only', async () => {
    results['rfp_invitations.insert'] = { error: { code: '23505', message: LEAK } }
    const r = await invite()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.failed).toEqual([{ vendorId: VENDOR, reason: 'invitation_create_failed' }])
    expect(JSON.stringify(r)).not.toContain('jane@example.com')
    expect(logged()).toContain('23505')
    expect(logged()).not.toContain('jane@example.com')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('an email failure reports email_send_failed without provider text, in the result or the log', async () => {
    sendEmail.mockResolvedValue({ ok: false, error: PROVIDER_LEAK })
    const r = await invite()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.failed).toEqual([{ vendorId: VENDOR, reason: 'email_send_failed' }])
    expect(JSON.stringify(r)).not.toContain('Resend')
    expect(logged()).toContain(VENDOR)
    expect(logged()).not.toContain('jane@example.com')
    expect(logged()).not.toContain('vendor@example.com')
    expect(logged()).not.toContain('domain not verified')
  })

  it('a failed RFP read is a generic error, not "RFP not found"', async () => {
    results['rfps.select'] = { data: null, error: { code: '57014', message: LEAK } }
    const r = await invite()
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toMatch(/not found/i)
    expect(r.error).not.toContain('jane@example.com')
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('a failed vendor or existing-invitation read stops before sending anything', async () => {
    for (const key of ['vendors.select', 'rfp_invitations.select']) {
      const saved = results[key]
      results[key] = { data: null, error: { code: '08006', message: LEAK } }
      const r = await invite()
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).not.toContain('jane@example.com')
      results[key] = saved!
    }
    expect(sendEmail).not.toHaveBeenCalled()
    expect(logged()).not.toContain('jane@example.com')
  })
})

describe('revokeRfpInvitation', () => {
  it('a DB failure returns a generic message and logs code + id only', async () => {
    results['rfp_invitations.update'] = { data: null, error: { code: '42501', message: LEAK } }
    const r = await revokeRfpInvitation(INV)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toContain('jane@example.com')
    expect(r.error).not.toContain('duplicate key')
    expect(logged()).toContain('42501')
    expect(logged()).toContain(INV)
    expect(logged()).not.toContain('jane@example.com')
  })

  it('an unknown invitation (no row) says so', async () => {
    results['rfp_invitations.update'] = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    const r = await revokeRfpInvitation(INV)
    expect(r).toEqual({ ok: false, error: 'That invitation no longer exists.' })
  })

  it('revokes on the happy path', async () => {
    results['rfp_invitations.update'] = { data: { rfp_id: RFP }, error: null }
    expect(await revokeRfpInvitation(INV)).toEqual({ ok: true })
  })
})

describe('listInvitations', () => {
  it('a read failure is reported, and the log carries the code but never the message', async () => {
    results['vendor_onboarding_invitations.select'] = { data: null, error: { code: '57014', message: LEAK } }
    const r = await listInvitationsResult()
    expect(r).toEqual({ ok: false })
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
    expect(logged()).not.toContain('duplicate key')
  })
})

describe('createInvitation / revokeInvitation (vendor onboarding)', () => {
  it('an email failure is reported as emailSent=false with no provider text, logged by id only', async () => {
    results['vendor_onboarding_invitations.insert'] = { data: { id: 'inv-2' }, error: null }
    sendEmail.mockResolvedValue({ ok: false, error: PROVIDER_LEAK })
    const r = await createInvitation({ inviteeEmail: 'jane@example.com' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.emailSent).toBe(false)
    expect(JSON.stringify(r.data)).not.toContain('domain not verified')
    expect(logged()).toContain('inv-2')
    expect(logged()).not.toContain('jane@example.com')
    expect(logged()).not.toContain('domain not verified')
  })

  it('an insert failure returns a generic message', async () => {
    results['vendor_onboarding_invitations.insert'] = { data: null, error: { code: '23505', message: LEAK } }
    const r = await createInvitation({ inviteeEmail: 'jane@example.com' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toContain('duplicate key')
    expect(logged()).toContain('23505')
    expect(logged()).not.toContain('jane@example.com')
  })

  it('a revoke failure returns a generic message', async () => {
    results['vendor_onboarding_invitations.update'] = { data: null, error: { code: '42501', message: LEAK } }
    const r = await revokeInvitation(INV)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toContain('duplicate key')
    expect(logged()).toContain(INV)
    expect(logged()).not.toContain('jane@example.com')
  })
})
