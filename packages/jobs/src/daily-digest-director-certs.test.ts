import { describe, expect, it, vi } from 'vitest'
import { signDirectorCert, withDirectorCert } from '../../../apps/hoa/src/lib/compliance/director-certs'
import { buildDigestEmail, buildDirectorCertBlock, loadDirectorCertAlerts, runDailyDigest, type DailyDigestDeps } from './daily-digest'

/**
 * BL-139: the morning email carries a "Florida director certification"
 * block for directors due within 30 days, overdue or expired — Florida
 * associations only, verified signed records only, current board members
 * only. Logs carry counts, never names or user ids.
 */

type Row = { data: unknown; error: unknown }
const SECRET = 'digest-secret'
const ORG = 'org-1'
const A = '11111111-1111-4111-8111-111111111111'
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TODAY = '2026-10-21'

function settingsWith(entries: Array<[string, string, string | null]>) {
  let s: unknown = {}
  for (const [userId, electedOn, certifiedOn] of entries) {
    s = withDirectorCert(
      s,
      userId,
      signDirectorCert(A, userId, { electedOn, certifiedOn, documentUrl: null, updatedAt: 'x', updatedBy: null }, SECRET),
    )
  }
  return s
}

function fakeDb(results: Record<string, Row>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'lte', 'order', 'limit', 'neq']) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return chain
      }
    }
    chain.then = (resolve: (r: Row) => unknown) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve)
    return chain
  })
  return { db: { from } as never, calls, from }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const flAssoc = (settings: unknown, state = 'FL') => ({
  data: [{ id: A, name: 'Bay HOA', state, governing_law_state: null, compliance_settings: settings }],
  error: null,
})

describe('loadDirectorCertAlerts', () => {
  it('flags overdue and due-soon Florida directors who are still on the board, with names', async () => {
    const { db } = fakeDb({
      associations: flAssoc(
        settingsWith([
          [U1, '2026-07-01', null], // overdue
          [U2, '2026-08-22', null], // due in 30 days
        ]),
      ),
      org_members: { data: [{ user_id: U1, role: 'board' }, { user_id: U2, role: 'admin' }], error: null },
      profiles: { data: [{ id: U2, full_name: 'Pat Board' }], error: null },
    })
    const rows = await loadDirectorCertAlerts(db, ORG, TODAY, logger(), SECRET)
    expect(rows?.map((r) => [r.userId, r.status.tone, r.name])).toEqual([
      [U1, 'overdue', null],
      [U2, 'due_soon', 'Pat Board'],
    ])
  })

  it('a non-Florida association: [] and nothing else is queried', async () => {
    const { db, calls } = fakeDb({ associations: flAssoc(settingsWith([[U1, '2026-07-01', null]]), 'GA') })
    expect(await loadDirectorCertAlerts(db, ORG, TODAY, logger(), SECRET)).toEqual([])
    expect(calls.some((c) => c.table === 'org_members' || c.table === 'profiles')).toBe(false)
  })

  it('nothing due within 30 days: [] without reading members', async () => {
    const { db, calls } = fakeDb({ associations: flAssoc(settingsWith([[U1, '2026-10-15', null]])) })
    expect(await loadDirectorCertAlerts(db, ORG, TODAY, logger(), SECRET)).toEqual([])
    expect(calls.some((c) => c.table === 'org_members')).toBe(false)
  })

  it('an unsigned record and a former board member are not flagged', async () => {
    const settings = settingsWith([[U1, '2026-07-01', null]]) as { director_certifications: Record<string, unknown> }
    settings.director_certifications[U2] = {
      elected_on: '2026-07-01',
      certified_on: null,
      document_url: null,
      updated_at: 'x',
      updated_by: null,
      sig: 'ab'.repeat(32),
    }
    const { db, calls } = fakeDb({
      associations: flAssoc(settings),
      org_members: { data: [{ user_id: U1, role: 'resident' }], error: null },
    })
    expect(await loadDirectorCertAlerts(db, ORG, TODAY, logger(), SECRET)).toEqual([])
    // Only the verified record (U1) was looked up; the forged one never was.
    const inCall = calls.find((c) => c.table === 'org_members' && c.method === 'in')
    expect(inCall?.args[1]).toEqual([U1])
  })

  it('a failed read is null (logged by code), never "nobody due"', async () => {
    const log = logger()
    const { db } = fakeDb({ associations: { data: null, error: { code: '42501' } } })
    expect(await loadDirectorCertAlerts(db, ORG, TODAY, log, SECRET)).toBeNull()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('director certifications'), { code: '42501' })
  })
})

describe('the email', () => {
  const rowsFor = async () => {
    const { db } = fakeDb({
      associations: flAssoc(settingsWith([[U1, '2026-07-01', null]])),
      org_members: { data: [{ user_id: U1, role: 'board' }], error: null },
      profiles: { data: [{ id: U1, full_name: 'Jo <Director>' }], error: null },
    })
    return (await loadDirectorCertAlerts(db, ORG, TODAY, logger(), SECRET))!
  }

  it('block: the line, the suspension consequence with its subsection, the official text and the Members link; HTML escaped', async () => {
    const block = buildDirectorCertBlock({ rows: await rowsFor(), membersUrl: 'https://app.test/settings/members#director-certification' })
    expect(block.lines).toEqual(['Jo <Director>: certificate overdue since Sep 29, 2026 — suspended until filed. Fla. Stat. § 720.3033(1).'])
    expect(block.text).toContain('§ 720.3033(1)(b)')
    expect(block.text).toContain('https://www.flsenate.gov/Laws/Statutes/2026/720.3033')
    expect(block.html).toContain('Jo &lt;Director&gt;')
    expect(block.html).not.toContain('<Director>')
  })

  it('alone in the email it sets its own subject; other blocks are unchanged', async () => {
    const email = buildDigestEmail({
      orgName: 'Bay HOA',
      mailboxes: [],
      reconnectUrl: 'x',
      waiting: null,
      directorCerts: { rows: await rowsFor(), membersUrl: 'https://app.test/settings/members' },
    })
    expect(email.subject).toBe('Florida director certification: 1 director to act on — Bay HOA')
    expect(email.text).toContain('Florida director certification:')
    const without = buildDigestEmail({ orgName: 'Bay HOA', mailboxes: [], reconnectUrl: 'x', waiting: null, arc: { overdue: 1, dueSoon: 0, arcUrl: 'u' } })
    expect(without.text).not.toContain('director certification')
  })

  it('runDailyDigest emails the board and logs a count only', async () => {
    const { db } = fakeDb({
      orgs: { data: [{ id: ORG, name: 'Bay HOA' }], error: null },
      associations: flAssoc(settingsWith([[U1, '2026-07-01', null]])),
      org_members: { data: [{ user_id: U1, role: 'board' }], error: null },
      profiles: { data: [{ id: U1, email: 'jo@example.test', full_name: 'Jo Director' }], error: null },
    })
    const sendEmail = vi.fn<DailyDigestDeps['sendEmail']>(async () => ({ ok: true }))
    const log = logger()
    const prev = process.env.PAY_SETTINGS_SECRET
    process.env.PAY_SETTINGS_SECRET = SECRET
    try {
      const res = await runDailyDigest(db, { sendEmail, appUrl: (p) => `https://app.test${p}` }, log)
      expect(res.directorCertAlerts).toBe(1)
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(sendEmail.mock.calls[0]![0].text).toContain('Jo Director: certificate overdue')
      const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
      expect(logged).toContain('1 director certification(s) due or overdue')
      expect(logged).not.toContain('Jo Director')
      expect(logged).not.toContain(U1)
    } finally {
      if (prev === undefined) delete process.env.PAY_SETTINGS_SECRET
      else process.env.PAY_SETTINGS_SECRET = prev
    }
  })
})
