import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db/m6', () => ({ M6_APPLIED: true }))

import { runDailyDigest, type DailyDigestDeps } from './daily-digest'

/**
 * BL-168 follow-up, flag ON (mocked). The CPA's proposed entries and review
 * notes reach the Treasurer (the admins when there is none) and nobody else;
 * grants ending within 30 days, or already ended, reach every board member.
 * Counts and links only, in the email and in the logs.
 */

const ORG = 'org-1'
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

type Member = { user_id: string; role: string; officer_title: string | null; access_expires_at: string | null }
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

function run(members: Member[], counts: { entry: number; review: number }) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    let action: unknown
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not', 'lt', 'lte', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        if (m === 'eq' && args[0] === 'action_type') action = args[1]
        return chain
      }
    }
    chain.then = (resolve: (r: unknown) => unknown) => {
      if (table === 'orgs') return Promise.resolve({ data: [{ id: ORG, name: 'Maple HOA' }], error: null }).then(resolve)
      if (table === 'org_members') return Promise.resolve({ data: members, error: null }).then(resolve)
      if (table === 'profiles') {
        const ids = (calls.filter((c) => c.table === 'profiles' && c.method === 'in').pop()?.args[1] as string[]) ?? []
        return Promise.resolve({ data: ids.map((id) => ({ id, email: `${id}@example.test` })), error: null }).then(resolve)
      }
      if (table === 'approval_requests') {
        return Promise.resolve({ data: null, error: null, count: action === 'pro.journal_entry' ? counts.entry : counts.review }).then(resolve)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    return chain
  })
  const sendEmail = vi.fn<DailyDigestDeps['sendEmail']>(async () => ({ ok: true }))
  const log = logger()
  return runDailyDigest({ from } as never, { sendEmail, appUrl: (p) => `https://app.test${p}` }, log).then((res) => ({ res, sendEmail, log, calls }))
}

const BOARD = [
  { user_id: 'u-adm', role: 'admin', officer_title: null, access_expires_at: null },
  { user_id: 'u-tre', role: 'board', officer_title: 'treasurer', access_expires_at: null },
  { user_id: 'u-brd', role: 'board', officer_title: null, access_expires_at: null },
]

const sentTo = (sendEmail: ReturnType<typeof vi.fn<DailyDigestDeps['sendEmail']>>) =>
  Object.fromEntries(sendEmail.mock.calls.map(([e]) => [e.to.split('@')[0], e]))

describe('runDailyDigest with M6 on', () => {
  it('the Treasurer alone is told about the CPA’s submissions; nobody else gets an email', async () => {
    const { res, sendEmail, log } = await run(BOARD, { entry: 2, review: 1 })
    expect(res).toMatchObject({ proTreasurerItems: 3, proExpiring: 0, proExpired: 0, emailed: 1 })
    const sent = sentTo(sendEmail)
    expect(Object.keys(sent)).toEqual(['u-tre'])
    expect(sent['u-tre']!.text).toContain('2 adjusting entries proposed by your CPA waiting for approval')
    expect(sent['u-tre']!.text).toContain('1 period review note from your CPA waiting for approval')
    expect(sent['u-tre']!.text).toContain('https://app.test/approvals?type=pro')
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(logged).toContain('professionals — 2 entries and 1 review note(s) waiting')
    expect(logged).not.toContain('u-tre')
  })

  it('with no Treasurer the admin is told, and a board member is not', async () => {
    const { sendEmail } = await run([BOARD[0]!, BOARD[2]!], { entry: 1, review: 0 })
    expect(Object.keys(sentTo(sendEmail))).toEqual(['u-adm'])
  })

  it('grants ending soon or ended reach every board member, counts and a link only', async () => {
    const members = [
      ...BOARD,
      { user_id: 'cpa-1', role: 'cpa', officer_title: null, access_expires_at: inDays(10) },
      { user_id: 'cpa-2', role: 'cpa', officer_title: null, access_expires_at: inDays(-3) },
      { user_id: 'atty-1', role: 'attorney', officer_title: null, access_expires_at: inDays(200) },
    ]
    const { res, sendEmail, log } = await run(members, { entry: 0, review: 0 })
    expect(res).toMatchObject({ proExpiring: 1, proExpired: 1, proTreasurerItems: 0, emailed: 3 })
    const sent = sentTo(sendEmail)
    expect(Object.keys(sent).sort()).toEqual(['u-adm', 'u-brd', 'u-tre'])
    for (const e of Object.values(sent)) {
      expect(e.text).toContain('1 professional access grant has ended')
      expect(e.text).toContain('1 professional access grant ends within 30 days')
      expect(e.text).toContain('https://app.test/settings/professionals')
      expect(e.text).not.toContain('adjusting ent')
      expect(e.text).not.toContain('cpa-1')
    }
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(logged).not.toContain('cpa-1')
    expect(logged).not.toContain('example.test')
  })

  it('every professional read is scoped to the org', async () => {
    const { calls } = await run(BOARD, { entry: 1, review: 1 })
    const pro = calls.filter((c) => c.table === 'approval_requests' && c.method === 'eq')
    expect(pro.map((c) => c.args)).toContainEqual(['organization_id', ORG])
    const members = calls.filter((c) => c.table === 'org_members' && c.method === 'eq').map((c) => c.args)
    expect(members).toContainEqual(['org_id', ORG])
  })

  it('nothing waiting and nothing expiring: no email at all', async () => {
    const { res, sendEmail } = await run(BOARD, { entry: 0, review: 0 })
    expect(res).toMatchObject({ proTreasurerItems: 0, emailed: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
