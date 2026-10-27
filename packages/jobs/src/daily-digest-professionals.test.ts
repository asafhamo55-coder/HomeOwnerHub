import { describe, expect, it, vi } from 'vitest'
import {
  buildDigestEmail,
  buildProExpiryBlock,
  buildProTreasurerBlock,
  loadProfessionalNotices,
  runDailyDigest,
  type DailyDigestDeps,
} from './daily-digest'

/**
 * BL-168 follow-up, flag OFF and block behaviour. With M6_APPLIED false
 * (the shipped default) the digest asks nothing about professionals and
 * says nothing about them. The flag-on run is in
 * daily-digest-professionals-on.test.ts (it mocks the flag).
 */

const ORG = 'org-1'
const NOW = Date.parse('2026-10-27T11:00:00Z')
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

type Row = { data: unknown; error: unknown; count?: number }

function fakeDb(results: Record<string, Row>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not', 'lt', 'lte', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return chain
      }
    }
    chain.then = (resolve: (r: Row) => unknown) => {
      const base = results[table] ?? { data: [], error: null }
      if (table === 'profiles' && Array.isArray(base.data)) {
        const ids = (calls.filter((c) => c.table === 'profiles' && c.method === 'in').pop()?.args[1] as string[]) ?? []
        return Promise.resolve({ ...base, data: (base.data as Array<{ id: string }>).filter((p) => ids.includes(p.id)) }).then(resolve)
      }
      return Promise.resolve(base).then(resolve)
    }
    return chain
  })
  return { db: { from } as never, calls }
}

describe('loadProfessionalNotices with the flag off', () => {
  it('asks the database nothing and returns null', async () => {
    const { db, calls } = fakeDb({})
    expect(await loadProfessionalNotices(db, ORG, NOW, logger(), false)).toBeNull()
    expect(calls).toEqual([])
  })

  it('is off by default (M6_APPLIED ships false)', async () => {
    const { db, calls } = fakeDb({})
    expect(await loadProfessionalNotices(db, ORG, NOW, logger())).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('loadProfessionalNotices with the flag on', () => {
  const members: Row = {
    data: [
      { user_id: 'a', role: 'admin', officer_title: null, access_expires_at: null },
      { user_id: 'c1', role: 'cpa', officer_title: null, access_expires_at: '2026-11-10T00:00:00Z' },
      { user_id: 'c2', role: 'cpa', officer_title: null, access_expires_at: '2026-10-01T00:00:00Z' },
      { user_id: 'l1', role: 'attorney', officer_title: null, access_expires_at: '2027-06-01T00:00:00Z' },
    ],
    error: null,
  }

  it('is org-scoped, head-only counts, and splits expiry from the CPA queue', async () => {
    const { db, calls } = fakeDb({ org_members: members, approval_requests: { data: null, error: null, count: 2 } })
    const res = await loadProfessionalNotices(db, ORG, NOW, logger(), true)
    expect(res).toMatchObject({ entries: 2, reviews: 2, expiry: { expiring: 1, expired: 1 } })
    expect([...res!.treasurerIds]).toEqual(['a'])
    for (const t of ['org_members', 'approval_requests']) {
      const eqs = calls.filter((c) => c.table === t && c.method === 'eq').map((c) => c.args)
      expect(eqs).toContainEqual([t === 'org_members' ? 'org_id' : 'organization_id', ORG])
    }
    const actions = calls.filter((c) => c.table === 'approval_requests' && c.method === 'eq' && c.args[0] === 'action_type').map((c) => c.args[1])
    expect(actions.sort()).toEqual(['pro.cpa_review', 'pro.journal_entry'])
    for (const c of calls.filter((c) => c.table === 'approval_requests' && c.method === 'select')) {
      expect(c.args[1]).toMatchObject({ count: 'exact', head: true })
    }
  })

  it('a failed members read is null, logged by code only', async () => {
    const log = logger()
    const { db } = fakeDb({ org_members: { data: null, error: { code: '42501' } } })
    expect(await loadProfessionalNotices(db, ORG, NOW, log, true)).toBeNull()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining(ORG), { code: '42501' })
  })
})

describe('the professionals blocks', () => {
  it('Treasurer block: counts and a link, nothing else', () => {
    const b = buildProTreasurerBlock({ entries: 2, reviews: 1, approvalsUrl: 'https://app.test/approvals?type=pro' })
    expect(b.lines).toEqual(['2 adjusting entries proposed by your CPA waiting for approval', '1 period review note from your CPA waiting for approval'])
    expect(b.text).toContain('https://app.test/approvals?type=pro')
  })

  it('expiry block: ended first, then ending soon', () => {
    const b = buildProExpiryBlock({ expiring: 2, expired: 1, professionalsUrl: 'https://app.test/settings/professionals' })
    expect(b.lines).toEqual(['1 professional access grant has ended', '2 professional access grants end within 30 days'])
    expect(b.html).toContain('Manage professionals')
  })

  it('buildDigestEmail: omitted or all-zero adds nothing; alone each has its own subject', () => {
    const base = { orgName: 'Maple HOA', mailboxes: [], reconnectUrl: 'x', waiting: null, arc: { overdue: 1, dueSoon: 0, arcUrl: 'u' } }
    const plain = buildDigestEmail(base)
    expect(buildDigestEmail({ ...base, proTreasurer: { entries: 0, reviews: 0, approvalsUrl: 'u' }, proExpiry: { expiring: 0, expired: 0, professionalsUrl: 'u' } })).toEqual(plain)
    const treasurer = buildDigestEmail({ orgName: 'Maple HOA', mailboxes: [], reconnectUrl: 'x', waiting: null, proTreasurer: { entries: 1, reviews: 0, approvalsUrl: 'https://app.test/a' } })
    expect(treasurer.subject).toBe('1 adjusting entry proposed by your CPA waiting for approval — Maple HOA')
    const expiry = buildDigestEmail({ orgName: 'Maple HOA', mailboxes: [], reconnectUrl: 'x', waiting: null, proExpiry: { expiring: 1, expired: 0, professionalsUrl: 'https://app.test/p' } })
    expect(expiry.subject).toBe('1 professional access grant ends within 30 days — Maple HOA')
  })
})

describe('runDailyDigest with the flag off', () => {
  it('professionals are invisible: no approval_requests read, no lines, zero totals, no email', async () => {
    const { db, calls } = fakeDb({
      orgs: { data: [{ id: ORG, name: 'Maple HOA' }], error: null },
      org_members: {
        data: [
          { user_id: 'u-adm', role: 'admin', officer_title: null, access_expires_at: null },
          { user_id: 'c1', role: 'cpa', officer_title: null, access_expires_at: '2020-01-01T00:00:00Z' },
        ],
        error: null,
      },
      profiles: { data: [{ id: 'u-adm', email: 'admin@example.test' }], error: null },
      approval_requests: { data: null, error: null, count: 9 },
    })
    const sendEmail = vi.fn<DailyDigestDeps['sendEmail']>(async () => ({ ok: true }))
    const res = await runDailyDigest(db, { sendEmail, appUrl: (p) => `https://app.test${p}` }, logger())
    expect(res).toMatchObject({ proTreasurerItems: 0, proExpiring: 0, proExpired: 0, emailed: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(calls.some((c) => c.table === 'approval_requests')).toBe(false)
  })
})
