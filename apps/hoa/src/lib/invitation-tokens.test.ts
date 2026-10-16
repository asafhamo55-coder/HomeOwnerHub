import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Token validators behind the public rfp-bid and vendor-onboard routes
// (api-route-conventions RC-2, RC-5). A DB failure must never read as an
// unknown token (404 "invalid link"), and nothing logged may carry a raw
// Postgres message — it embeds the offending value.

// ─── Supabase admin client mock ──────────────────────────────────────
// Each (table, op) pair resolves to a configurable { data, error }.

type Result = { data?: unknown; error: { code?: string; message: string } | null }
let results: Record<string, Result> = {}

function chain(table: string) {
  let op = 'select'
  const resolve = () => results[`${table}.${op}`] ?? { data: null, error: null }
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order']) c[m] = () => c
  c.update = () => {
    op = 'update'
    return c
  }
  c.maybeSingle = async () => resolve()
  c.single = async () => resolve()
  c.then = (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onOk, onErr)
  return c
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({ from: (table: string) => chain(table) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { validateRfpInvitationToken } from './rfp-invitations'
import { validateInvitationToken } from './vendor-invitations'

const LEAK = 'duplicate key value violates unique constraint for jane@example.com'
const DB_ERR = { code: '57014', message: LEAK }

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls])

beforeEach(() => {
  results = {}
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

const rfpInvitation = {
  id: 'inv-1',
  organization_id: 'org-1',
  rfp_id: 'rfp-1',
  vendor_id: 'ven-1',
  unique_submission_token: 'tok',
  rfp: { id: 'rfp-1', rfp_number: 'R-1', title: 'Roof', scope: 's', status: 'open', submission_deadline: future },
  vendor: { id: 'ven-1', legal_name: 'Acme', primary_email: 'vendor@example.com' },
}

describe('validateRfpInvitationToken', () => {
  it('returns ok for a valid token', async () => {
    results['rfp_invitations.select'] = { data: rfpInvitation, error: null }
    const v = await validateRfpInvitationToken('tok')
    expect(v.ok).toBe(true)
  })

  it('an unknown token is not_found', async () => {
    const v = await validateRfpInvitationToken('tok')
    expect(v).toEqual({ ok: false, reason: 'not_found' })
  })

  it('a failed acknowledged_at update logs the code only, never the Postgres message', async () => {
    results['rfp_invitations.select'] = { data: rfpInvitation, error: null }
    results['rfp_invitations.update'] = { error: DB_ERR }
    const v = await validateRfpInvitationToken('tok')
    expect(v.ok).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
    expect(logged()).not.toContain('duplicate key')
  })

  it('a failed token lookup throws (500), not a not_found that reads as an invalid link', async () => {
    results['rfp_invitations.select'] = { data: null, error: DB_ERR }
    await expect(validateRfpInvitationToken('tok')).rejects.toThrow()
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
  })

  it('a failed existing-bid lookup throws rather than letting a double submit through', async () => {
    results['rfp_invitations.select'] = { data: rfpInvitation, error: null }
    results['bids.select'] = { data: null, error: DB_ERR }
    await expect(validateRfpInvitationToken('tok')).rejects.toThrow()
    expect(logged()).not.toContain('jane@example.com')
  })
})

const vendorInvitation = {
  id: 'vinv-1',
  organization_id: 'org-1',
  invitee_email: 'vendor@example.com',
  invitee_name: 'Jane',
  status: 'pending',
  expires_at: future,
}

describe('validateInvitationToken (vendor onboarding)', () => {
  it('returns ok for a valid token', async () => {
    results['vendor_onboarding_invitations.select'] = { data: vendorInvitation, error: null }
    const v = await validateInvitationToken('tok')
    expect(v.ok).toBe(true)
  })

  it('an unknown token is not_found', async () => {
    expect(await validateInvitationToken('tok')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('a failed token lookup throws (500) instead of returning not_found', async () => {
    results['vendor_onboarding_invitations.select'] = { data: null, error: DB_ERR }
    await expect(validateInvitationToken('tok')).rejects.toThrow()
    expect(errorSpy).toHaveBeenCalled()
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
    expect(logged()).not.toContain('duplicate key')
  })

  it('a failed lazy-expire update is logged by code and still reports expired', async () => {
    results['vendor_onboarding_invitations.select'] = { data: { ...vendorInvitation, expires_at: past }, error: null }
    results['vendor_onboarding_invitations.update'] = { error: DB_ERR }
    expect(await validateInvitationToken('tok')).toEqual({ ok: false, reason: 'expired' })
    expect(logged()).toContain('57014')
    expect(logged()).not.toContain('jane@example.com')
  })
})
