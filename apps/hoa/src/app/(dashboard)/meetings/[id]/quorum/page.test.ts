import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-122: the quorum kit and its printables are board/admin only. A
// resident (or anyone without a board role) is redirected before a single
// row is read, and a meeting outside the org is a 404.

const MEETING = 'b0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  loads: 0,
  clients: 0,
  result: null as unknown,
}))

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => {
    if (h.role === null) throw new Error('NEXT_REDIRECT:/onboarding')
    if (h.role === 'resident') throw new Error('NEXT_REDIRECT:/resident')
    return { role: h.role, org: { id: 'org-1', name: 'Maple HOA' } }
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ refresh: () => {} }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.clients += 1
    return { tag: 'user-client' }
  }),
}))
vi.mock('@/lib/meeting-quorum/load', () => ({
  loadKitContext: vi.fn(async () => {
    h.loads += 1
    return h.result
  }),
}))
vi.mock('@/lib/meeting-quorum/actions', () => ({ updateQuorumKit: vi.fn() }))

function ctx(meetingType: string) {
  return {
    ok: true,
    ctx: {
      meeting: { id: MEETING, org_id: 'org-1', meeting_date: '2027-01-15', meeting_type: meetingType, status: 'draft' },
      association: { id: 'a1', name: 'Maple HOA', state: 'FL', governing_law_state: null, compliance_settings: {} },
      state: 'FL',
      timeZone: 'America/New_York',
      today: '2026-10-20',
      asOf: '2026-10-20',
      rows: [
        {
          propertyId: 'p1',
          address: '104 Example Way',
          unitNumber: null,
          lotNumber: '1',
          state: 'FL',
          owners: [{ name: 'Ana Rivera', email: 'ana@example.test', phone: '(555) 010-0001', share: '100%', since: null, sharingOptOut: null }],
          ownerSource: 'home_record',
          sharesWarning: null,
          mailing: { text: '104 Example Way', source: 'property_address' },
        },
      ],
      kit: { state: 'none', memberMeeting: false, quorumPct: null, homes: {} },
      eligibility: meetingType === 'annual' ? 'annual' : meetingType === 'special' ? 'special_unconfirmed' : 'not_member_meeting',
    },
  }
}

const { default: KitPage } = await import('./page')
const { default: SignInPage } = await import('./sign-in/page')
const { default: ProxiesPage } = await import('./proxies/page')

const params = (id = MEETING) => ({ params: Promise.resolve({ id }) })
const pages: Array<[string, () => Promise<unknown>]> = [
  ['kit', () => KitPage(params())],
  ['sign-in', () => SignInPage(params())],
  ['proxies', () => ProxiesPage({ ...params(), searchParams: Promise.resolve({}) })],
]

beforeEach(() => {
  h.role = 'board'
  h.loads = 0
  h.clients = 0
  h.result = ctx('annual')
})

describe('quorum kit gate', () => {
  it.each(pages)('%s: a resident is redirected and nothing is read', async (_name, run) => {
    h.role = 'resident'
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/resident')
    expect(h.loads).toBe(0)
    expect(h.clients).toBe(0)
  })

  it.each(pages)('%s: signed out is redirected, nothing read', async (_name, run) => {
    h.role = null
    await expect(run()).rejects.toThrow('NEXT_REDIRECT')
    expect(h.loads).toBe(0)
  })

  it.each(pages)('%s: another org’s meeting is a 404', async (_name, run) => {
    h.result = { ok: false, reason: 'not_found' }
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('a malformed id is a 404 before any read', async () => {
    await expect(KitPage(params('not-a-uuid'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.clients).toBe(0)
  })

  it.each(['board', 'admin'] as const)('%s gets the kit for an annual meeting', async (role) => {
    h.role = role
    const el = (await KitPage(params())) as React.ReactElement<{ title: string }>
    expect(el.props.title).toBe('Quorum kit')
    expect(h.loads).toBe(1)
  })

  it('printables 404 for a board meeting', async () => {
    h.result = ctx('regular')
    await expect(SignInPage(params())).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(ProxiesPage({ ...params(), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
