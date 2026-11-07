import { beforeEach, describe, expect, it, vi } from 'vitest'

const ID = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  rowOrg: 'org-A',
  rowType: 'w18.cash_receipt',
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  m6: false,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => ({})) }))
vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))
vi.mock('@homeowner-portal/workflows', () => ({
  W18_CASH_RECEIPT: 'w18.cash_receipt',
  approveRequest: h.approveRequest,
  rejectRequest: h.rejectRequest,
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => ({ id: 'u-1' })) }))
vi.mock('@/lib/professionals/signoff', () => ({ moneyGate: vi.fn(async () => null) }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'no',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'admin', orgId: 'org-A' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      const f: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => {
        f[c] = v
        return q
      }
      q.maybeSingle = async () => ({
        data: f.id === ID && f.organization_id === h.rowOrg && f.action_type === h.rowType ? { id: ID } : null,
        error: null,
      })
      return q
    },
  })),
}))

import { approvePosting, rejectPosting } from './approvals'

beforeEach(() => {
  h.rowOrg = 'org-A'
  h.rowType = 'w18.cash_receipt'
  h.approveRequest.mockReset().mockResolvedValue({ ok: true, status: 'posted', resultRef: 'je', alreadyDecided: false })
  h.rejectRequest.mockReset().mockResolvedValue({ ok: true, status: 'rejected', resultRef: null, alreadyDecided: false })
})

describe.each([false, true])('queue approvals with M6 %s', (m6) => {
  beforeEach(() => {
    h.m6 = m6
  })

  it('decides a W18 request of the active org', async () => {
    expect((await approvePosting({ approvalRequestId: ID })).ok).toBe(true)
    expect((await rejectPosting({ approvalRequestId: ID, reason: 'no' })).ok).toBe(true)
    expect(h.approveRequest).toHaveBeenCalledTimes(1)
    expect(h.rejectRequest).toHaveBeenCalledTimes(1)
  })

  it('refuses a request from another org, approve and reject, and claims nothing', async () => {
    h.rowOrg = 'org-B'
    expect((await approvePosting({ approvalRequestId: ID })).ok).toBe(false)
    expect((await rejectPosting({ approvalRequestId: ID, reason: 'no' })).ok).toBe(false)
    expect(h.approveRequest).not.toHaveBeenCalled()
    expect(h.rejectRequest).not.toHaveBeenCalled()
  })

  it('refuses a request that is not a W18 match, approve and reject', async () => {
    h.rowType = 'w36.ap_bill'
    expect((await approvePosting({ approvalRequestId: ID })).ok).toBe(false)
    expect((await rejectPosting({ approvalRequestId: ID, reason: 'no' })).ok).toBe(false)
    expect(h.approveRequest).not.toHaveBeenCalled()
    expect(h.rejectRequest).not.toHaveBeenCalled()
  })
})
