import { afterEach, describe, expect, it, vi } from 'vitest'
import { signArcClockSettings, withArcClockSettings } from '../../../apps/hoa/src/lib/arc-review/clock'
import { signComplianceAck, withComplianceAck } from '../../../apps/hoa/src/lib/compliance/deadlines'
const recordsFlag = vi.hoisted(() => ({ live: false }))
const m4Flag = vi.hoisted(() => ({ live: false }))
vi.mock('@homeowner-portal/db/m4', () => ({
  get M4_APPLIED() {
    return m4Flag.live
  },
}))
vi.mock('@homeowner-portal/db/records-requests', () => ({
  get RECORDS_REQUESTS_LIVE() {
    return recordsFlag.live
  },
}))

import {
  BOARD_ROLES,
  buildArcBlock,
  buildComplianceBlock,
  buildInsuranceBlock,
  buildMailboxAlert,
  loadArcDeadlines,
  loadComplianceDeadlines,
  loadInsuranceRenewals,
  runDailyDigest,
  type DailyDigestDeps,
} from './daily-digest'

/**
 * BL-003: a board that never logs in must still learn its mailbox stopped
 * syncing. The morning job emails board members (and only board members)
 * a "Mailbox disconnected since <date> — reconnect" block linking to
 * /settings/mailbox. Sending goes through the injected, guarded sendEmail
 * (BL-004), mocked here.
 */

type Row = { data: unknown; error: unknown }

const ORG = 'org-1'
const MAILBOX_ADDRESS = 'board@maplecreekhoa.org'
const BOARD_EMAIL = 'chair@example.test'
const ADMIN_EMAIL = 'manager@example.test'
const RESIDENT_EMAIL = 'resident@gmail.com'

interface FakeOpts {
  orgs?: Row
  mailboxes?: Row
  members?: Row
  profiles?: Row
  associations?: Row
  threads?: Row
  arcRequests?: Row
  tasks?: Row
  tickets?: Row
  done?: Row
  insurance?: Row
}

/** Records every filter so tests can assert what was queried. */
function fakeDb(opts: FakeOpts) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const results: Record<string, Row> = {
    orgs: opts.orgs ?? { data: [{ id: ORG, name: 'Maple Creek HOA' }], error: null },
    mailbox_accounts: opts.mailboxes ?? { data: [], error: null },
    org_members: opts.members ?? {
      data: [
        { user_id: 'u-board', role: 'board' },
        { user_id: 'u-admin', role: 'admin' },
      ],
      error: null,
    },
    profiles: opts.profiles ?? {
      data: [
        { id: 'u-board', email: BOARD_EMAIL },
        { id: 'u-admin', email: ADMIN_EMAIL },
        { id: 'u-res', email: RESIDENT_EMAIL },
      ],
      error: null,
    },
    associations: opts.associations ?? { data: [{ compliance_settings: {} }], error: null },
    inbox_threads: opts.threads ?? { data: [], error: null },
    arc_requests: opts.arcRequests ?? { data: [], error: null },
    meeting_action_items: opts.tasks ?? { data: [], error: null },
    tickets: opts.tickets ?? { data: [], error: null },
    compliance_deadlines_done: opts.done ?? { data: [], error: null },
    insurance_policies: opts.insurance ?? { data: [], error: null },
  }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'is', 'in', 'not', 'lt', 'lte', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return chain
      }
    }
    chain.then = (resolve: (r: Row) => unknown) => {
      const base = results[table] ?? { data: [], error: null }
      // profiles honours its `.in('id', ids)` filter like Postgres would.
      if (table === 'profiles' && Array.isArray(base.data)) {
        const inCall = calls.filter((c) => c.table === 'profiles' && c.method === 'in').pop()
        const ids = (inCall?.args[1] as string[]) ?? []
        return Promise.resolve({
          ...base,
          data: (base.data as Array<{ id: string }>).filter((p) => ids.includes(p.id)),
        }).then(resolve)
      }
      return Promise.resolve(base).then(resolve)
    }
    return chain
  })
  return { db: { from } as unknown as Parameters<typeof runDailyDigest>[0], calls }
}

function deps(result: { ok: boolean } = { ok: true }) {
  const sendEmail = vi.fn<DailyDigestDeps['sendEmail']>(async () => result)
  return {
    sendEmail,
    appUrl: (p: string) => `https://app.test${p}`,
  } satisfies DailyDigestDeps
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

const BROKEN: Row = {
  data: [
    {
      id: 'mb-1',
      email_address: MAILBOX_ADDRESS,
      sync_status: 'auth_failed',
      last_synced_at: '2026-10-12T14:00:00.000Z',
      connected_at: '2026-09-01T00:00:00.000Z',
    },
  ],
  error: null,
}

describe('runDailyDigest — mailbox broken (present case)', () => {
  it('emails each board member a "disconnected since <date> — reconnect" block linking to /settings/mailbox', async () => {
    const { db } = fakeDb({ mailboxes: BROKEN })
    const d = deps()

    const result = await runDailyDigest(db, d, logger())

    expect(result).toMatchObject({ processed: 1, brokenMailboxes: 1, emailed: 2, failed: 0 })
    const recipients = d.sendEmail.mock.calls.map((c) => c[0].to).sort()
    expect(recipients).toEqual([ADMIN_EMAIL, BOARD_EMAIL].sort())

    const email = d.sendEmail.mock.calls[0][0]
    expect(email.text).toContain('Mailbox disconnected since Oct 12, 2026 — reconnect')
    expect(email.text).toContain('https://app.test/settings/mailbox')
    expect(email.html).toContain('Mailbox disconnected since Oct 12, 2026')
    expect(email.html).toContain('href="https://app.test/settings/mailbox"')
    expect(email.subject).toMatch(/mailbox/i)
  })

  it('sends through the guarded sender with the org sandbox flag and an id-only ref', async () => {
    const { db } = fakeDb({
      mailboxes: BROKEN,
      associations: { data: [{ compliance_settings: { outbound_mode: 'sandbox' } }], error: null },
    })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail.mock.calls[0][1]).toEqual({ orgSandbox: true, ref: ORG })
  })

  it('counts a blocked/failed send without throwing', async () => {
    const { db } = fakeDb({ mailboxes: BROKEN })
    const d = deps({ ok: false })
    const result = await runDailyDigest(db, d, logger())
    expect(result).toMatchObject({ emailed: 0, failed: 2 })
  })
})

describe('runDailyDigest — nothing broken (absent case)', () => {
  it('sends nothing and does not look up board members', async () => {
    const { db, calls } = fakeDb({ mailboxes: { data: [], error: null } })
    const d = deps()

    const result = await runDailyDigest(db, d, logger())

    expect(result).toMatchObject({ processed: 1, brokenMailboxes: 0, emailed: 0 })
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(calls.some((c) => c.table === 'org_members')).toBe(false)
  })

  it('sends nothing when the mailbox check itself fails (and does not read that as healthy-and-silent)', async () => {
    const { db } = fakeDb({ mailboxes: { data: null, error: { code: 'XX', message: 'boom' } } })
    const d = deps()
    const log = logger()
    await runDailyDigest(db, d, log)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalled()
  })
})

describe('runDailyDigest — recipients are board members only', () => {
  it('queries only board/admin roles', async () => {
    const { db, calls } = fakeDb({ mailboxes: BROKEN })
    await runDailyDigest(db, deps(), logger())
    const roleFilter = calls.find((c) => c.table === 'org_members' && c.method === 'in')
    expect(roleFilter?.args).toEqual(['role', [...BOARD_ROLES]])
    expect(BOARD_ROLES).not.toContain('resident')
  })

  it('never emails a resident, even if the role query returned one', async () => {
    const { db } = fakeDb({
      mailboxes: BROKEN,
      members: {
        data: [
          { user_id: 'u-board', role: 'board' },
          { user_id: 'u-res', role: 'resident' },
        ],
        error: null,
      },
    })
    const d = deps()
    await runDailyDigest(db, d, logger())
    const recipients = d.sendEmail.mock.calls.map((c) => c[0].to)
    expect(recipients).toEqual([BOARD_EMAIL])
    expect(recipients).not.toContain(RESIDENT_EMAIL)
  })

  it('never touches resident tables', async () => {
    const { db, calls } = fakeDb({ mailboxes: BROKEN })
    await runDailyDigest(db, deps(), logger())
    const tables = new Set(calls.map((c) => c.table))
    for (const t of ['residents', 'ownerships', 'units', 'owners', 'tenants']) {
      expect(tables.has(t)).toBe(false)
    }
  })
})

describe('runDailyDigest — logs', () => {
  it('logs ids and counts only — no mailbox address, board email or sync error text', async () => {
    const { db } = fakeDb({
      mailboxes: {
        data: [{ ...(BROKEN.data as object[])[0], sync_error: `token for ${MAILBOX_ADDRESS} revoked` }],
        error: null,
      },
    })
    const log = logger()
    await runDailyDigest(db, deps(), log)
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(everything).toContain('mb-1')
    expect(everything).not.toContain('@')
  })
})

describe('buildMailboxAlert', () => {
  it('falls back to connected_at when the mailbox never synced', () => {
    const alert = buildMailboxAlert({
      orgName: 'Maple Creek HOA',
      reconnectUrl: 'https://app.test/settings/mailbox',
      mailboxes: [
        {
          id: 'mb-1',
          email_address: MAILBOX_ADDRESS,
          sync_status: 'stalled',
          last_synced_at: null,
          connected_at: '2026-09-01T12:00:00.000Z',
        },
      ],
    })
    expect(alert.text).toContain('Mailbox disconnected since Sep 1, 2026 — reconnect')
  })

  it('escapes HTML in the org name and mailbox address', () => {
    const alert = buildMailboxAlert({
      orgName: '<script>x</script> HOA',
      reconnectUrl: 'https://app.test/settings/mailbox',
      mailboxes: [
        {
          id: 'mb-1',
          email_address: 'a&b@example.test',
          sync_status: 'stalled',
          last_synced_at: '2026-10-12T14:00:00.000Z',
          connected_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
    expect(alert.html).not.toContain('<script>')
    expect(alert.html).toContain('a&amp;b@example.test')
  })
})

/* BL-101 A6 — the same morning email says how many residents have waited
 * more than 48h for a reply, and how many of those are the recipient's.
 * Board members only; counts only. */
describe('runDailyDigest — residents waiting more than 48h', () => {
  const WAITING: Row = {
    data: [
      { id: 't-1', assigned_to: 'u-board' },
      { id: 't-2', assigned_to: null },
      { id: 't-3', assigned_to: 'u-admin' },
    ],
    error: null,
  }

  it('emails each board member the total and their own share, with a link to the inbox', async () => {
    const { db } = fakeDb({ threads: WAITING })
    const d = deps()

    const result = await runDailyDigest(db, d, logger())

    expect(result).toMatchObject({ brokenMailboxes: 0, waitingThreads: 3, emailed: 2 })
    const byRecipient = Object.fromEntries(d.sendEmail.mock.calls.map((c) => [c[0].to, c[0]]))
    expect(byRecipient[BOARD_EMAIL].text).toContain('3 residents waiting more than 48h (1 assigned to you)')
    expect(byRecipient[ADMIN_EMAIL].text).toContain('3 residents waiting more than 48h (1 assigned to you)')
    expect(byRecipient[BOARD_EMAIL].text).toContain('https://app.test/inbox?filter=all')
    expect(byRecipient[BOARD_EMAIL].html).toContain('href="https://app.test/inbox?filter=all"')
    expect(byRecipient[BOARD_EMAIL].subject).toContain('3 residents waiting for a reply')
  })

  it('counts only threads the badge would call waiting: inbound last, not closed, still in Gmail, past the cutoff', async () => {
    const { db, calls } = fakeDb({ threads: WAITING })
    await runDailyDigest(db, deps(), logger())
    const q = calls.filter((c) => c.table === 'inbox_threads')
    expect(q).toContainEqual({ table: 'inbox_threads', method: 'eq', args: ['organization_id', ORG] })
    expect(q).toContainEqual({ table: 'inbox_threads', method: 'eq', args: ['last_direction', 'inbound'] })
    expect(q).toContainEqual({ table: 'inbox_threads', method: 'neq', args: ['status', 'closed'] })
    expect(q).toContainEqual({
      table: 'inbox_threads',
      method: 'not',
      args: ['gmail_state', 'in', '("archived","trashed")'],
    })
    const cutoff = q.find((c) => c.method === 'lt')
    expect(cutoff?.args[0]).toBe('last_message_at')
    const ageMs = Date.now() - Date.parse(cutoff?.args[1] as string)
    expect(Math.round(ageMs / 3_600_000)).toBe(48)
  })

  it("uses the org's own warn threshold when compliance_settings sets one", async () => {
    const { db, calls } = fakeDb({
      threads: WAITING,
      associations: { data: [{ compliance_settings: { inbox_sla_hours: { warn: 24, overdue: 72 } } }], error: null },
    })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail.mock.calls[0][0].text).toContain('waiting more than 24h')
    const cutoff = calls.find((c) => c.table === 'inbox_threads' && c.method === 'lt')
    expect(Math.round((Date.now() - Date.parse(cutoff?.args[1] as string)) / 3_600_000)).toBe(24)
  })

  it('puts both blocks in one email when a mailbox is also broken', async () => {
    const { db } = fakeDb({ threads: WAITING, mailboxes: BROKEN })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
    const email = d.sendEmail.mock.calls[0][0]
    expect(email.subject).toMatch(/mailbox/i)
    expect(email.text).toContain('Mailbox disconnected since')
    expect(email.text).toContain('3 residents waiting more than 48h')
    expect(email.html).toContain('Open the Inbox')
  })

  it('still sends the reminder when the mailbox check fails', async () => {
    const { db } = fakeDb({ threads: WAITING, mailboxes: { data: null, error: { code: 'XX', message: 'boom' } } })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('sends nothing when the waiting check fails and no mailbox is broken', async () => {
    const { db } = fakeDb({ threads: { data: null, error: { code: 'XX', message: 'boom' } } })
    const d = deps()
    const log = logger()
    await runDailyDigest(db, d, log)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalled()
  })

  it('never emails a resident, and logs counts only', async () => {
    const { db } = fakeDb({
      threads: WAITING,
      members: {
        data: [
          { user_id: 'u-board', role: 'board' },
          { user_id: 'u-res', role: 'resident' },
        ],
        error: null,
      },
    })
    const d = deps()
    const log = logger()
    await runDailyDigest(db, d, log)
    expect(d.sendEmail.mock.calls.map((c) => c[0].to)).toEqual([BOARD_EMAIL])
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(everything).not.toContain('@')
    expect(everything).not.toContain('t-1')
  })
})

/* BL-113 — the morning email lists ARC applications past the board's
 * "decide within N days" deadline or due within 3 days. Board members
 * only; counts only; nothing to residents. */
describe('runDailyDigest — ARC decision deadlines', () => {
  const DAY = 24 * 60 * 60 * 1000
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
  const ARC: Row = {
    data: [
      { id: 'arc-1', association_id: 'as-1', status: 'submitted', submitted_at: daysAgo(40) }, // overdue
      { id: 'arc-2', association_id: 'as-1', status: 'in_review', submitted_at: daysAgo(28) }, // 2 days left
      { id: 'arc-3', association_id: 'as-1', status: 'submitted', submitted_at: daysAgo(5) }, // not yet
    ],
    error: null,
  }
  const ASSOC: Row = { data: [{ id: 'as-1', compliance_settings: {} }], error: null }

  it('emails board members the overdue and due-soon counts with a link to /arc', async () => {
    const { db } = fakeDb({ arcRequests: ARC, associations: ASSOC })
    const d = deps()
    const result = await runDailyDigest(db, d, logger())
    expect(result).toMatchObject({ arcOverdue: 1, arcDueSoon: 1, emailed: 2 })
    const sent = d.sendEmail.mock.calls.map((c) => c[0])
    expect(sent.map((m) => m.to).sort()).toEqual([ADMIN_EMAIL, BOARD_EMAIL].sort())
    const mail = sent[0]!
    expect(mail.text).toContain("1 ARC application past the board's decision deadline")
    expect(mail.text).toContain('1 ARC application due for a decision within 3 days')
    expect(mail.text).toContain('Check your declaration')
    expect(mail.text).toContain('https://app.test/arc')
    expect(mail.html).toContain('href="https://app.test/arc"')
    expect(mail.subject).toContain('1 ARC application past the decision deadline')
  })

  it('queries only open, non-deleted applications for the org', async () => {
    const { db, calls } = fakeDb({ arcRequests: ARC, associations: ASSOC })
    await runDailyDigest(db, deps(), logger())
    const q = calls.filter((c) => c.table === 'arc_requests')
    expect(q).toContainEqual({ table: 'arc_requests', method: 'eq', args: ['organization_id', ORG] })
    expect(q).toContainEqual({ table: 'arc_requests', method: 'in', args: ['status', ['submitted', 'in_review']] })
    expect(q).toContainEqual({ table: 'arc_requests', method: 'is', args: ['deleted_at', null] })
  })

  it("uses the association's signed deadline", async () => {
    const secret = 'digest-test-secret'
    const stored = signArcClockSettings(
      'as-1',
      { days: 60, dayKind: 'calendar' },
      { updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: null },
      secret,
    )
    const assoc: Row = { data: [{ id: 'as-1', compliance_settings: withArcClockSettings({}, stored) }], error: null }
    const { db } = fakeDb({ arcRequests: ARC, associations: assoc })
    // 60 days: 40 days in is no longer overdue, and nothing is within 3 days.
    expect(await loadArcDeadlines(db as never, ORG, Date.now(), logger(), secret)).toEqual({ overdue: 0, dueSoon: 0 })
    // A forged value (wrong secret) falls back to 30 days.
    expect(await loadArcDeadlines(db as never, ORG, Date.now(), logger(), 'other')).toEqual({ overdue: 1, dueSoon: 1 })
  })

  it('sends nothing when no application is overdue or due soon', async () => {
    const { db } = fakeDb({
      arcRequests: { data: [{ id: 'a', association_id: 'as-1', status: 'submitted', submitted_at: daysAgo(2) }], error: null },
      associations: ASSOC,
    })
    const d = deps()
    const result = await runDailyDigest(db, d, logger())
    expect(result).toMatchObject({ arcOverdue: 0, arcDueSoon: 0, emailed: 0 })
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a failed ARC read is logged by code and does not read as "nothing due" for other blocks', async () => {
    const log = logger()
    const { db } = fakeDb({ arcRequests: { data: null, error: { code: '42P01' } }, mailboxes: BROKEN })
    const d = deps()
    await runDailyDigest(db, d, log)
    expect(log.error).toHaveBeenCalledWith(`[daily-digest] ${ORG}: failed to load open ARC applications`, { code: '42P01' })
    expect(d.sendEmail).toHaveBeenCalled()
  })

  it('puts the ARC block in the mailbox alert when both apply', async () => {
    const { db } = fakeDb({ arcRequests: ARC, associations: ASSOC, mailboxes: BROKEN })
    const d = deps()
    await runDailyDigest(db, d, logger())
    const mail = d.sendEmail.mock.calls[0]![0]
    expect(mail.subject).toContain('mailbox is disconnected')
    expect(mail.text).toContain("past the board's decision deadline")
    expect(mail.html).toContain('Open ARC review')
  })

  it('logs counts only — no summaries, names or addresses', async () => {
    const log = logger()
    const { db } = fakeDb({ arcRequests: ARC, associations: ASSOC })
    await runDailyDigest(db, deps(), log)
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(logged).toContain('1 ARC overdue, 1 ARC due soon')
    expect(logged).not.toContain('arc-1')
    expect(logged).not.toContain(BOARD_EMAIL)
  })
})

describe('buildArcBlock', () => {
  it('due soon only: no deemed-approval note', () => {
    const b = buildArcBlock({ overdue: 0, dueSoon: 2, arcUrl: 'https://app.test/arc' })
    expect(b.lines).toEqual(['2 ARC applications due for a decision within 3 days'])
    expect(b.text).not.toContain('declaration')
  })
})

/* BL-119 — each board member's own overdue / due-this-week tasks. The
 * member sees only their own counts; a member with nothing due gets no
 * email unless something org-wide is wrong. Counts only in logs. */
describe('runDailyDigest — board tasks', () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
  }
  const TASKS: Row = {
    data: [
      { assignee_user_id: 'u-board', status: 'open', due_date: day(-3) }, // overdue
      { assignee_user_id: 'u-board', status: 'in_progress', due_date: day(2) }, // this week
      { assignee_user_id: 'u-board', status: 'open', due_date: day(2) }, // this week
    ],
    error: null,
  }

  it('emails only the assignee, with their own counts and a link to /tasks', async () => {
    const { db } = fakeDb({ tasks: TASKS })
    const d = deps()
    const log = logger()
    const result = await runDailyDigest(db, d, log)
    expect(result).toMatchObject({ tasksOverdue: 1, tasksDueSoon: 2, emailed: 1 })
    expect(d.sendEmail.mock.calls.map((c) => c[0].to)).toEqual([BOARD_EMAIL])
    const mail = d.sendEmail.mock.calls[0]![0]
    expect(mail.text).toContain('1 of your tasks is overdue')
    expect(mail.text).toContain('2 of your tasks are due within 7 days')
    expect(mail.text).toContain('https://app.test/tasks?assignee=me')
    expect(mail.html).toContain('Open your tasks')
    expect(mail.subject).toContain('1 of your tasks overdue')
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(everything).not.toContain('@')
    expect(everything).not.toContain('u-board')
  })

  it('queries open, assigned tasks for the org up to the end of the week', async () => {
    const { db, calls } = fakeDb({ tasks: TASKS })
    await runDailyDigest(db, deps(), logger())
    const q = calls.filter((c) => c.table === 'meeting_action_items')
    expect(q).toContainEqual({ table: 'meeting_action_items', method: 'eq', args: ['org_id', ORG] })
    expect(q).toContainEqual({ table: 'meeting_action_items', method: 'in', args: ['status', ['open', 'in_progress']] })
    expect(q).toContainEqual({ table: 'meeting_action_items', method: 'not', args: ['assignee_user_id', 'is', null] })
    expect(q).toContainEqual({ table: 'meeting_action_items', method: 'lte', args: ['due_date', day(6)] })
  })

  it('adds the tasks block to an org-wide email for the assignee only', async () => {
    const { db } = fakeDb({ tasks: TASKS, mailboxes: BROKEN })
    const d = deps()
    await runDailyDigest(db, d, logger())
    const byTo = new Map(d.sendEmail.mock.calls.map((c) => [c[0].to, c[0]]))
    expect(byTo.get(BOARD_EMAIL)!.text).toContain('of your tasks')
    expect(byTo.get(ADMIN_EMAIL)!.text).not.toContain('of your tasks')
    expect(byTo.get(BOARD_EMAIL)!.subject).toMatch(/mailbox/i)
  })

  it('never emails a resident their tasks', async () => {
    const { db } = fakeDb({
      tasks: { data: [{ assignee_user_id: 'u-res', status: 'open', due_date: day(-1) }], error: null },
      members: {
        data: [
          { user_id: 'u-board', role: 'board' },
          { user_id: 'u-res', role: 'resident' },
        ],
        error: null,
      },
    })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a failed task read is logged by code and sends nothing on its own', async () => {
    const { db } = fakeDb({ tasks: { data: null, error: { code: '42P01' } } })
    const d = deps()
    const log = logger()
    const result = await runDailyDigest(db, d, log)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ tasksOverdue: 0, tasksDueSoon: 0 })
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('failed to load task deadlines'), { code: '42P01' })
  })
})

describe('runDailyDigest — owner records requests (BL-123)', () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
  }
  const at = (offset: number) => `${day(offset)}T17:00:00+00:00`
  const TICKETS: Row = {
    data: [
      { status: 'open', records_due_at: at(-2) }, // overdue
      { status: 'in_progress', records_due_at: at(1) }, // due soon
      { status: 'open', records_due_at: at(20) }, // later
    ],
    error: null,
  }

  afterEach(() => {
    recordsFlag.live = false
  })

  it('flag off: never queries tickets and sends nothing for them', async () => {
    const { db, calls } = fakeDb({ tickets: TICKETS })
    const d = deps()
    const result = await runDailyDigest(db, d, logger())
    expect(calls.some((c) => c.table === 'tickets')).toBe(false)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ recordsOverdue: 0, recordsDueSoon: 0 })
  })

  it('flag on: emails board members the counts with a link to /tickets/records', async () => {
    recordsFlag.live = true
    const { db } = fakeDb({ tickets: TICKETS })
    const d = deps()
    const log = logger()
    const result = await runDailyDigest(db, d, log)
    expect(result).toMatchObject({ recordsOverdue: 1, recordsDueSoon: 1, emailed: 2 })
    const recipients = d.sendEmail.mock.calls.map((c) => c[0].to).sort()
    expect(recipients).toEqual([ADMIN_EMAIL, BOARD_EMAIL].sort())
    const mail = d.sendEmail.mock.calls[0]![0]
    expect(mail.text).toContain('1 owner records request past the statutory deadline')
    expect(mail.text).toContain('1 owner records request due within 3 days')
    expect(mail.text).toContain('https://app.test/tickets/records')
    expect(mail.html).toContain('Open records requests')
    expect(mail.subject).toContain('past the statutory deadline')
    const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(everything).not.toContain('@')
  })

  it('flag on: queries only open, dated, non-deleted records requests for the org', async () => {
    recordsFlag.live = true
    const { db, calls } = fakeDb({ tickets: TICKETS })
    await runDailyDigest(db, deps(), logger())
    const q = calls.filter((c) => c.table === 'tickets')
    expect(q).toContainEqual({ table: 'tickets', method: 'eq', args: ['organization_id', ORG] })
    expect(q).toContainEqual({ table: 'tickets', method: 'eq', args: ['category', 'records_request'] })
    expect(q).toContainEqual({ table: 'tickets', method: 'in', args: ['status', ['open', 'in_progress']] })
    expect(q).toContainEqual({ table: 'tickets', method: 'is', args: ['deleted_at', null] })
    expect(q).toContainEqual({ table: 'tickets', method: 'not', args: ['records_due_at', 'is', null] })
  })

  it('flag on: nothing due sends nothing', async () => {
    recordsFlag.live = true
    const { db } = fakeDb({ tickets: { data: [{ status: 'open', records_due_at: at(20) }], error: null } })
    const d = deps()
    await runDailyDigest(db, d, logger())
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('flag on: a failed read is logged by code and sends nothing on its own', async () => {
    recordsFlag.live = true
    const { db } = fakeDb({ tickets: { data: null, error: { code: '42703' } } })
    const d = deps()
    const log = logger()
    await runDailyDigest(db, d, log)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('failed to load records-request deadlines'), { code: '42703' })
  })
})

describe('runDailyDigest — statutory deadlines (BL-131)', () => {
  const GA = '11111111-1111-4111-8111-111111111111'
  const SECRET = 'digest-test-secret'
  const gaRow = (compliance_settings: unknown = {}) => ({
    id: GA,
    name: 'Peachtree Commons',
    state: 'GA',
    governing_law_state: null,
    compliance_settings,
  })

  it('loads a countdown line for a GA association inside the window', async () => {
    const { db, calls } = fakeDb({ associations: { data: [gaRow()], error: null } })
    const items = await loadComplianceDeadlines(db as never, ORG, '2026-10-20', logger(), SECRET)
    expect(items!.map((i) => [i.deadline.code, i.daysLeft])).toEqual([['ga-sos-registration-2027', 73]])
    expect(calls).toContainEqual({ table: 'associations', method: 'eq', args: ['organization_id', ORG] })
  })

  it('nothing for a non-GA association, outside the window, or once marked done with a valid signature', async () => {
    const run = async (row: unknown, today = '2026-10-20') =>
      loadComplianceDeadlines(fakeDb({ associations: { data: [row], error: null } }).db as never, ORG, today, logger(), SECRET)
    expect(await run({ ...gaRow(), state: 'FL' })).toEqual([])
    expect(await run({ ...gaRow(), state: 'TX' })).toEqual([]) // TX's standing obligation stays on the dashboard only
    expect(await run(gaRow(), '2026-09-01')).toEqual([])
    const done = withComplianceAck(
      {},
      'ga-sos-registration-2027',
      signComplianceAck(GA, 'ga-sos-registration-2027', { doneAt: '2026-10-20T12:00:00Z', doneBy: 'u-board' }, SECRET),
    )
    expect(await run(gaRow(done))).toEqual([])
    // Same value checked with another secret: not verified, so the line stays.
    const other = await loadComplianceDeadlines(
      fakeDb({ associations: { data: [gaRow(done)], error: null } }).db as never,
      ORG,
      '2026-10-20',
      logger(),
      'other-secret',
    )
    expect(other).toHaveLength(1)
  })

  it('M3 off: never reads compliance_deadlines_done (the table may not exist)', async () => {
    const { db, calls } = fakeDb({ associations: { data: [gaRow()], error: null } })
    await loadComplianceDeadlines(db as never, ORG, '2026-10-20', logger(), SECRET, false)
    expect(calls.some((c) => c.table === 'compliance_deadlines_done')).toBe(false)
  })

  it('M3 on: a compliance_deadlines_done row marks the deadline done, scoped to the org', async () => {
    const doneRow = { association_id: GA, code: 'ga-sos-registration-2027', done_at: '2026-10-20T12:00:00Z', done_by: 'u-board' }
    const { db, calls } = fakeDb({ associations: { data: [gaRow()], error: null }, done: { data: [doneRow], error: null } })
    expect(await loadComplianceDeadlines(db as never, ORG, '2026-10-20', logger(), SECRET, true)).toEqual([])
    expect(calls).toContainEqual({ table: 'compliance_deadlines_done', method: 'eq', args: ['organization_id', ORG] })
    // Another association's row does not count for this one.
    const other = fakeDb({
      associations: { data: [gaRow()], error: null },
      done: { data: [{ ...doneRow, association_id: '22222222-2222-4222-8222-222222222222' }], error: null },
    })
    expect(await loadComplianceDeadlines(other.db as never, ORG, '2026-10-20', logger(), SECRET, true)).toHaveLength(1)
  })

  it('M3 on: a failed done-rows read falls back to the signed acknowledgments, never to silence', async () => {
    const { db } = fakeDb({ associations: { data: [gaRow()], error: null }, done: { data: null, error: { code: '42P01' } } })
    expect(await loadComplianceDeadlines(db as never, ORG, '2026-10-20', logger(), SECRET, true)).toHaveLength(1)
  })

  it('a failed read is logged by code and returns null, not "nothing due"', async () => {
    const log = logger()
    const res = await loadComplianceDeadlines(
      fakeDb({ associations: { data: null, error: { code: '42501' } } }).db as never,
      ORG,
      '2026-10-20',
      log,
      SECRET,
    )
    expect(res).toBeNull()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('failed to load compliance deadlines'), { code: '42501' })
  })

  it('the block carries the countdown, the consequence, the official link and the dashboard link', async () => {
    const items = await loadComplianceDeadlines(
      fakeDb({ associations: { data: [gaRow()], error: null } }).db as never,
      ORG,
      '2026-10-20',
      logger(),
      SECRET,
    )
    const block = buildComplianceBlock({ items: items!, dashboardUrl: 'https://app.test/#compliance-deadlines' })
    expect(block.lines).toEqual([
      'Peachtree Commons: Register with the Georgia Secretary of State — takes effect in 73 days (Jan 1, 2027). O.C.G.A. § 43-17A-2 (Ga. L. 2026, SB 406 (Act 715) § 2; effective Jan 1, 2027, § 9(a)).',
    ])
    expect(block.text).toContain('may not collect fines or fees, file or record liens, or start foreclosure')
    expect(block.text).toContain('https://sos.ga.gov/georgia-property-owners-associations-division')
    expect(block.text).toContain('https://app.test/#compliance-deadlines')
    expect(block.html).toContain('What to do, and mark it done')
    expect(block.html).toContain('href="https://sos.ga.gov/georgia-property-owners-associations-division"')
  })

  it('emails board members only, with the line, and logs codes and counts, never the association name', async () => {
    vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T11:00:00Z'))
    try {
      const { db } = fakeDb({ associations: { data: [gaRow()], error: null } })
      const d = deps()
      const log = logger()
      const result = await runDailyDigest(db, d, log)
      expect(result).toMatchObject({ complianceDeadlines: 1, emailed: 2 })
      const recipients = d.sendEmail.mock.calls.map((c) => c[0].to).sort()
      expect(recipients).toEqual([ADMIN_EMAIL, BOARD_EMAIL].sort())
      const mail = d.sendEmail.mock.calls[0]![0]
      expect(mail.subject).toBe(
        'Register with the Georgia Secretary of State: Takes effect in 73 days (Jan 1, 2027) — Maple Creek HOA',
      )
      expect(mail.text).toContain('takes effect in 73 days (Jan 1, 2027)')
      expect(mail.html).toContain('What to do, and mark it done')
      const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
      expect(everything).toContain('ga-sos-registration-2027')
      expect(everything).not.toContain('Peachtree')
      expect(everything).not.toContain('@')
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    }
  })

  it('a GA association marked done gets no email from this alone', async () => {
    vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
    try {
      const done = withComplianceAck(
        {},
        'ga-sos-registration-2027',
        signComplianceAck(GA, 'ga-sos-registration-2027', { doneAt: '2026-10-20T12:00:00Z', doneBy: null }, SECRET),
      )
      const { db } = fakeDb({ associations: { data: [gaRow(done)], error: null } })
      const d = deps()
      const result = await runDailyDigest(db, d, logger())
      expect(d.sendEmail).not.toHaveBeenCalled()
      expect(result).toMatchObject({ complianceDeadlines: 0 })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('BL-132 insurance renewals (M4_APPLIED, migration 0068)', () => {
  const policyRow = (expiresOn: string, extra: Record<string, unknown> = {}) => ({
    id: `p-${expiresOn}`,
    association_id: null,
    kind: 'fidelity',
    carrier: 'Acme Mutual',
    policy_number: 'SECRET-123',
    expires_on: expiresOn,
    ...extra,
  })

  afterEach(() => {
    m4Flag.live = false
  })

  it('M4 off: never reads insurance_policies (the table may not exist), in the loader and the job', async () => {
    const { db, calls } = fakeDb({ insurance: { data: [policyRow('2026-11-19')], error: null } })
    expect(await loadInsuranceRenewals(db as never, ORG, '2026-10-20', logger())).toBeNull()
    const d = deps()
    const result = await runDailyDigest(db, d, logger())
    expect(calls.some((c) => c.table === 'insurance_policies')).toBe(false)
    expect(result).toMatchObject({ insuranceRenewals: 0 })
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('M4 on: lists a policy expiring in 30 days, scoped to the org; a far-off one is not listed', async () => {
    const { db, calls } = fakeDb({
      insurance: { data: [policyRow('2026-11-19'), policyRow('2027-06-01', { kind: 'property' })], error: null },
    })
    const r = await loadInsuranceRenewals(db as never, ORG, '2026-10-20', logger(), true)
    expect(r?.map((x) => [x.kind, x.daysLeft, x.tone])).toEqual([['fidelity', 30, '30']])
    expect(calls).toContainEqual({ table: 'insurance_policies', method: 'eq', args: ['organization_id', ORG] })
  })

  it('M4 on: a failed read is logged by code and null, not "nothing expiring"', async () => {
    const log = logger()
    const { db } = fakeDb({ insurance: { data: null, error: { code: '42P01' } } })
    expect(await loadInsuranceRenewals(db as never, ORG, '2026-10-20', log, true)).toBeNull()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('failed to load insurance policies'), { code: '42P01' })
  })

  it('the block carries the kind and countdown and the /insurance link, never the carrier or policy number', async () => {
    const { db } = fakeDb({ insurance: { data: [policyRow('2026-11-19')], error: null } })
    const reminders = (await loadInsuranceRenewals(db as never, ORG, '2026-10-20', logger(), true))!
    const block = buildInsuranceBlock({ reminders, insuranceUrl: 'https://app.test/insurance' })
    expect(block.lines).toEqual(['Fidelity / crime bond policy: expires in 30 days'])
    expect(block.text).toContain('https://app.test/insurance')
    expect(block.text + block.html).not.toContain('Acme')
    expect(block.text + block.html).not.toContain('SECRET-123')
  })

  it('M4 on, the only block: board members get it, with the count as the subject; logs are counts only', async () => {
    m4Flag.live = true
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T11:00:00Z'))
    try {
      const { db } = fakeDb({ insurance: { data: [policyRow('2026-11-19')], error: null } })
      const d = deps()
      const log = logger()
      const result = await runDailyDigest(db, d, log)
      expect(result).toMatchObject({ insuranceRenewals: 1, emailed: 2 })
      expect(d.sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual([ADMIN_EMAIL, BOARD_EMAIL].sort())
      const mail = d.sendEmail.mock.calls[0]![0]
      expect(mail.subject).toBe('1 insurance policy expires within 90 days — Maple Creek HOA')
      expect(mail.text).toContain('Fidelity / crime bond policy: expires in 30 days')
      const everything = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
      expect(everything).toContain('1 insurance policy expiring or expired')
      expect(everything).not.toContain('Acme')
    } finally {
      vi.useRealTimers()
    }
  })
})
