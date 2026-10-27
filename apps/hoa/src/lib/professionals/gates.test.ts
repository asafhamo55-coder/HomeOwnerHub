import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_ONLY_DENIED } from '../accounting/guard'
import * as actions from './actions'
import { PRO_DENIED } from './guard'

// BL-168 with M6_APPLIED on: who may call which action. Complements the
// resident rows in lib/board-write-gates.test.ts (flag off).

const h = vi.hoisted(() => ({ role: 'resident' as 'admin' | 'board' | 'resident' | 'cpa' | 'attorney' | null }))

vi.mock('@homeowner-portal/db/m6', () => ({ M6_APPLIED: true }))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/orgs', () => ({
  getSignedInUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    throw new Error('reached the database')
  }),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('reached the service role')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const MATTER = { type: 'violation' as const, id: ID }
const form = () => {
  const f = new FormData()
  f.append('matterType', 'violation')
  f.append('matterId', ID)
  return f
}

const BOARD_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['inviteProfessional', () => actions.inviteProfessional({ email: 'a@example.test', role: 'cpa', expiresOn: '2027-01-01' })],
  ['renewProfessional', () => actions.renewProfessional(ID, '2027-01-01')],
  ['revokeProfessional', () => actions.revokeProfessional(ID)],
  ['setGeneralCounsel', () => actions.setGeneralCounsel(ID, true)],
  ['assignMatter', () => actions.assignMatter(ID, MATTER)],
  ['unassignMatter', () => actions.unassignMatter(ID)],
  ['setOfficerTitle', () => actions.setOfficerTitle(ID, 'treasurer')],
  ['setDualControlAmount', () => actions.setDualControlAmount(5000)],
  ['cancelProfessionalInvite', () => actions.cancelProfessionalInvite(ID)],
]

const CPA_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['cpaMarkPeriodReviewed', () => actions.cpaMarkPeriodReviewed({ fiscalPeriodId: ID, note: 'Reviewed' })],
  ['cpaProposeEntry', () => actions.cpaProposeEntry({ associationId: ID, fiscalPeriodId: ID, entryDate: '2026-10-01', memo: 'x', lines: [] })],
]

const ATTORNEY_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['attorneyAddNote', () => actions.attorneyAddNote({ matter: MATTER, body: 'A note' })],
  ['attorneyDraftLetter', () => actions.attorneyDraftLetter({ matter: MATTER, subject: 's', body: 'b' })],
  ['attorneyUploadDocument', () => actions.attorneyUploadDocument(form())],
]

beforeEach(() => {
  h.role = 'resident'
})

describe('the board’s actions refuse every non-board role before any client', () => {
  for (const role of ['resident', 'cpa', 'attorney'] as const) {
    for (const [name, call] of BOARD_ACTIONS) {
      it(`${name} refuses a ${role}`, async () => {
        h.role = role
        expect(await call()).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
      })
    }
  }
  it('a board member gets past the gate (control)', async () => {
    h.role = 'board'
    await expect(actions.revokeProfessional(ID)).rejects.toThrow('reached the database')
  })
  it('only an admin changes the two-signature amount', async () => {
    h.role = 'board'
    expect(await actions.setDualControlAmount(5000)).toEqual({ ok: false, error: 'Only admins can change the two-signature amount.' })
    h.role = 'admin'
    await expect(actions.setDualControlAmount(5000)).rejects.toThrow('reached the database')
  })
  it('only an admin sets an officer title', async () => {
    h.role = 'board'
    expect(await actions.setOfficerTitle(ID, 'treasurer')).toEqual({ ok: false, error: 'Only admins can set officer titles.' })
    h.role = 'admin'
    await expect(actions.setOfficerTitle(ID, 'treasurer')).rejects.toThrow('reached the database')
  })
})

describe('a CPA’s actions are for a CPA', () => {
  for (const [name, call] of CPA_ACTIONS) {
    for (const role of ['resident', 'board', 'admin', 'attorney'] as const) {
      it(`${name} refuses a ${role}`, async () => {
        h.role = role
        expect(await call()).toEqual({ ok: false, error: PRO_DENIED })
      })
    }
  }
  it('an active CPA gets past the gate (control)', async () => {
    h.role = 'cpa'
    await expect(actions.cpaMarkPeriodReviewed({ fiscalPeriodId: ID, note: 'Reviewed' })).rejects.toThrow('reached the database')
  })
})

describe('an attorney’s actions are for an attorney', () => {
  for (const [name, call] of ATTORNEY_ACTIONS) {
    for (const role of ['resident', 'board', 'admin', 'cpa'] as const) {
      it(`${name} refuses a ${role}`, async () => {
        h.role = role
        expect(await call()).toEqual({ ok: false, error: PRO_DENIED })
      })
    }
  }
  it('an active attorney gets past the gate (control)', async () => {
    h.role = 'attorney'
    await expect(actions.attorneyAddNote({ matter: MATTER, body: 'A note' })).rejects.toThrow('reached the database')
  })
  it('signed out is refused too', async () => {
    h.role = null
    const r = await actions.attorneyAddNote({ matter: MATTER, body: 'A note' })
    expect(r.ok).toBe(false)
  })
})
