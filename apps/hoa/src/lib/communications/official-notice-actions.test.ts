import { beforeEach, describe, expect, it, vi } from 'vitest'

// previewOfficialNotice: inert with M1 off; board-only; same plan as the send.

const h = vi.hoisted(() => ({
  m1: false,
  state: 'CA' as string | null,
  gate: { ok: true } as { ok: boolean; error?: string },
  consent: null as unknown,
  gateCalls: 0,
}))
vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return h.m1
  },
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => {
    h.gateCalls += 1
    return h.gate
  },
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    const b: Record<string, unknown> = {}
    for (const op of ['from', 'select', 'eq']) b[op] = () => b
    b.single = async () => ({ data: { organization_id: 'org-1', state: h.state }, error: null })
    return b
  },
}))
vi.mock('@/lib/email-consent', async (orig) => ({
  ...(await orig<typeof import('@/lib/email-consent')>()),
  loadEmailConsent: async () => h.consent,
}))
vi.mock('./audience', () => ({
  resolveAudience: async () => ({
    summary: 'x',
    recipients: [
      { userId: 'a', email: 'a@example.test', phone: null, recipientName: 'Ana', unitAddress: '1 Elm St', unitNumber: null },
      { userId: 'b', email: 'b@example.test', phone: null, recipientName: 'Ben', unitAddress: '2 Elm St', unitNumber: '2B' },
      { userId: null, email: 'c@example.test', phone: null, recipientName: 'Cy', unitAddress: null, unitNumber: null },
    ],
  }),
}))

const { previewOfficialNotice } = await import('./official-notice-actions')

beforeEach(() => {
  h.m1 = false
  h.state = 'CA'
  h.gate = { ok: true }
  h.gateCalls = 0
  h.consent = {
    ok: true,
    available: true,
    consent: new Map([['a', { granted: true, method: 'portal', at: '2026-10-01T00:00:00Z' }]]),
  }
})

describe('previewOfficialNotice', () => {
  it('flag off: does not apply and reads nothing', async () => {
    expect(await previewOfficialNotice({ kind: 'everyone' }, ['email'])).toEqual({ ok: true, applies: false })
    expect(h.gateCalls).toBe(0)
  })

  it('board only', async () => {
    h.m1 = true
    h.gate = { ok: false, error: 'denied' }
    expect(await previewOfficialNotice({ kind: 'everyone' }, ['email'])).toEqual({ ok: false, error: 'denied' })
  })

  it('CA: count plus the list of who needs a paper notice', async () => {
    h.m1 = true
    expect(await previewOfficialNotice({ kind: 'everyone' }, ['email', 'portal'])).toEqual({
      ok: true,
      applies: true,
      recipients: 3,
      paper: {
        count: 2,
        recipients: [
          { name: 'Ben', home: '2 Elm St #2B' },
          { name: 'Cy', home: 'No home on file' },
        ],
      },
    })
  })

  it('outside California it does not apply', async () => {
    h.m1 = true
    h.state = 'FL'
    expect(await previewOfficialNotice({ kind: 'everyone' }, ['email'])).toEqual({ ok: true, applies: false })
  })

  it('a consent read failure is an error, not zero paper notices', async () => {
    h.m1 = true
    h.consent = { ok: false, error: 'member_email_consent_events: 500' }
    expect((await previewOfficialNotice({ kind: 'everyone' }, ['email'])).ok).toBe(false)
  })
})
