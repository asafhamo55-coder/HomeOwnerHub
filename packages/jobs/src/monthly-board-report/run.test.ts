import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  MONTHLY_REPORT_RESOURCE_TYPE,
  monthlyReportCommunicationId,
  runMonthlyBoardReport,
  runMonthlyReportForOrg,
  runRequestedMonthlyReport,
  type ClaimInput,
  type MonthlyReportDeps,
  type MonthlyReportStore,
} from './run'

/**
 * BL-073 runner: who gets the month-end report, for which month, and that
 * it can never go out twice for the same org + month. The store is in
 * memory and the sender is a mock — nothing here can send real email.
 */

const ORG = { id: 'org-1', name: 'Maple Creek HOA' }
const ASSOC = { id: 'assoc-1', name: 'Maple Creek', timeZone: 'America/New_York' }
// 08:00 EDT on Oct 1 2026 — the cron instant.
const CRON_NOW = new Date('2026-10-01T12:00:00Z')

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

interface FakeOpts {
  orgs?: (typeof ORG)[]
  association?: typeof ASSOC | null
  recipients?: { userId: string; email: string }[]
  metadata?: Record<string, unknown>
  metadataFails?: boolean
  existing?: string[]
  sandbox?: boolean
}

function fakeStore(opts: FakeOpts = {}) {
  const communications = new Map<string, ClaimInput & { status: string }>()
  for (const id of opts.existing ?? []) communications.set(id, { status: 'sent' } as ClaimInput & { status: string })
  const recipientRows: { id: string; communicationId: string; email: string; userId: string; status: string; error?: string }[] = []
  const store: MonthlyReportStore = {
    loadOrgs: vi.fn(async () => opts.orgs ?? [ORG]),
    loadOrg: vi.fn(async (id: string) => (opts.orgs ?? [ORG]).find((o) => o.id === id) ?? null),
    primaryAssociation: vi.fn(async () => (opts.association === undefined ? ASSOC : opts.association)),
    boardRecipients: vi.fn(async () =>
      opts.recipients ?? [
        { userId: 'u-board', email: 'chair@example.test' },
        { userId: 'u-admin', email: 'manager@example.test' },
      ],
    ),
    userMetadata: vi.fn(async (ids: string[]) => {
      if (opts.metadataFails) throw new Error('auth admin read failed')
      return new Map(ids.map((id) => [id, opts.metadata?.[id]]))
    }),
    communicationExists: vi.fn(async (id: string) => communications.has(id)),
    orgSandbox: vi.fn(async () => opts.sandbox ?? false),
    claim: vi.fn(async (c: ClaimInput) => {
      if (communications.has(c.id)) return { ok: false as const, reason: 'exists' as const }
      communications.set(c.id, { ...c, status: 'sending' })
      return { ok: true as const }
    }),
    insertRecipients: vi.fn(async (communicationId: string, _orgId: string, rs: { userId: string; email: string }[]) =>
      rs.map((r, i) => {
        const row = { id: `cr-${communicationId.slice(0, 4)}-${i}`, communicationId, email: r.email, userId: r.userId, status: 'queued' }
        recipientRows.push(row)
        return { id: row.id, email: row.email }
      }),
    ),
    markRecipient: vi.fn(async (id: string, outcome) => {
      const row = recipientRows.find((r) => r.id === id)!
      row.status = outcome.status
      if (outcome.status !== 'sent') row.error = outcome.error
    }),
    finish: vi.fn(async (id: string, status: 'sent' | 'failed') => {
      communications.get(id)!.status = status
    }),
  }
  return { store, communications, recipientRows }
}

function fakeDeps(over: Partial<MonthlyReportDeps> = {}) {
  const deps: MonthlyReportDeps = {
    sendEmail: vi.fn(async () => ({ ok: true as const, messageId: 'm-1' })),
    emailConfigured: () => true,
    buildReport: vi.fn(async (input) => ({
      subject: `${input.associationName} — ${input.month.label} board report`,
      html: '<p>report</p>',
      text: 'report',
    })),
    ...over,
  }
  return deps
}

describe('monthlyReportCommunicationId — the idempotency key', () => {
  it('is a deterministic uuid per (org, month)', () => {
    const id = monthlyReportCommunicationId('org-1', '2026-09')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(monthlyReportCommunicationId('org-1', '2026-09')).toBe(id)
    expect(new Set([id, monthlyReportCommunicationId('org-1', '2026-10'), monthlyReportCommunicationId('org-2', '2026-09')]).size).toBe(3)
  })
})

describe('runMonthlyReportForOrg', () => {
  it("sends last month's report to every board/admin recipient through the guarded sender", async () => {
    const { store, communications, recipientRows } = fakeStore({ sandbox: true })
    const deps = fakeDeps()
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())

    expect(res).toEqual({ status: 'sent', month: '2026-09', sent: 2, suppressed: 0, failed: 0, optedOut: 0 })
    expect(deps.buildReport).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', associationId: 'assoc-1', timeZone: 'America/New_York', month: expect.objectContaining({ month: '2026-09', after: '2026-10-01' }) }),
    )
    const id = monthlyReportCommunicationId('org-1', '2026-09')
    expect(deps.sendEmail).toHaveBeenCalledTimes(2)
    // The org's sandbox flag and a non-PII ref reach the outbound guard.
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'chair@example.test', subject: expect.stringContaining('September 2026') }), {
      orgSandbox: true,
      ref: id,
    })
    expect(communications.get(id)).toMatchObject({
      status: 'sent',
      associationId: 'assoc-1',
      source: 'cron',
      relatedResource: { type: MONTHLY_REPORT_RESOURCE_TYPE, month: '2026-09' },
    })
    expect(recipientRows.map((r) => r.status)).toEqual(['sent', 'sent'])
  })

  it('never sends twice for the same org and month (a retry, a re-run, Send now after the cron)', async () => {
    const { store } = fakeStore()
    const deps = fakeDeps()
    const ctx = { org: ORG, month: null, now: CRON_NOW, source: 'cron' as const }
    await runMonthlyReportForOrg(store, deps, ctx, logger())
    const again = await runMonthlyReportForOrg(store, deps, ctx, logger())
    const manual = await runMonthlyReportForOrg(store, deps, { ...ctx, month: '2026-09', source: 'manual' }, logger())

    expect(again).toEqual({ status: 'skipped', month: '2026-09', reason: 'already_sent' })
    expect(manual).toEqual({ status: 'skipped', month: '2026-09', reason: 'already_sent' })
    expect(deps.sendEmail).toHaveBeenCalledTimes(2)
    expect(deps.buildReport).toHaveBeenCalledTimes(1)
  })

  it('loses a claim race without sending (two overlapping attempts)', async () => {
    const { store } = fakeStore()
    // The pre-check says "not sent yet", but another attempt claims first.
    store.claim = vi.fn(async () => ({ ok: false as const, reason: 'exists' as const }))
    const deps = fakeDeps()
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())
    expect(res).toEqual({ status: 'skipped', month: '2026-09', reason: 'already_sent' })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('skips a member who turned the report off, and sends to the rest', async () => {
    const { store, recipientRows } = fakeStore({ metadata: { 'u-admin': { notification_prefs: { monthly_board_report: false } } } })
    const deps = fakeDeps()
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())
    expect(res).toMatchObject({ status: 'sent', sent: 1, optedOut: 1 })
    expect(recipientRows.map((r) => r.email)).toEqual(['chair@example.test'])
    expect(deps.sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'manager@example.test' }), expect.anything())
  })

  it('claims nothing when every member opted out', async () => {
    const off = { notification_prefs: { monthly_board_report: false } }
    const { store, communications } = fakeStore({ metadata: { 'u-board': off, 'u-admin': off } })
    const deps = fakeDeps()
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())
    expect(res).toEqual({ status: 'skipped', month: '2026-09', reason: 'all_opted_out' })
    expect(communications.size).toBe(0)
    expect(deps.buildReport).not.toHaveBeenCalled()
  })

  it('fails (to be retried) rather than guessing when the opt-out read fails — before claiming anything', async () => {
    const { store, communications } = fakeStore({ metadataFails: true })
    const deps = fakeDeps()
    await expect(
      runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger()),
    ).rejects.toThrow()
    expect(communications.size).toBe(0)
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('fails before claiming when the report cannot be built, so a retry can still send it', async () => {
    const { store, communications } = fakeStore()
    const deps = fakeDeps({ buildReport: vi.fn(async () => Promise.reject(new Error('boom'))) })
    await expect(
      runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger()),
    ).rejects.toThrow()
    expect(communications.size).toBe(0)
  })

  it('records blocked and failed deliveries per recipient; the row is failed only when nobody got it', async () => {
    const { store, communications, recipientRows } = fakeStore()
    const deps = fakeDeps({
      sendEmail: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
        .mockRejectedValueOnce(new TypeError('network')),
    })
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())
    expect(res).toMatchObject({ status: 'sent', sent: 0, suppressed: 1, failed: 1 })
    expect(recipientRows.map((r) => r.status)).toEqual(['suppressed', 'failed'])
    expect(communications.get(monthlyReportCommunicationId('org-1', '2026-09'))?.status).toBe('failed')
  })

  it("uses the association's zone to decide which month just ended", async () => {
    const { store } = fakeStore({ association: { ...ASSOC, timeZone: 'America/Los_Angeles' } })
    const deps = fakeDeps()
    // 23:00 Sep 30 in Los Angeles: September is not over there yet.
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: new Date('2026-10-01T06:00:00Z'), source: 'cron' }, logger())
    expect(res).toMatchObject({ status: 'sent', month: '2026-08' })
  })

  it('refuses a requested month that has not finished, or is not a month', async () => {
    const { store } = fakeStore()
    const deps = fakeDeps()
    const now = new Date('2026-10-17T15:00:00Z')
    const ctx = { org: ORG, now, source: 'manual' as const }
    expect(await runMonthlyReportForOrg(store, deps, { ...ctx, month: '2026-10' }, logger())).toEqual({
      status: 'skipped',
      month: '2026-10',
      reason: 'month_not_complete',
    })
    expect(await runMonthlyReportForOrg(store, deps, { ...ctx, month: '2026-13' }, logger())).toEqual({
      status: 'skipped',
      month: null,
      reason: 'invalid_month',
    })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('skips an org with no association or no board member to send to', async () => {
    const deps = fakeDeps()
    const a = fakeStore({ association: null })
    expect(await runMonthlyReportForOrg(a.store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())).toEqual({
      status: 'skipped',
      month: null,
      reason: 'no_association',
    })
    const b = fakeStore({ recipients: [] })
    expect(await runMonthlyReportForOrg(b.store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())).toEqual({
      status: 'skipped',
      month: '2026-09',
      reason: 'no_recipients',
    })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('claims nothing when email is not configured (the transport would no-op and report success)', async () => {
    const { store, communications } = fakeStore()
    const deps = fakeDeps({ emailConfigured: () => false })
    const res = await runMonthlyReportForOrg(store, deps, { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, logger())
    expect(res).toEqual({ status: 'skipped', month: null, reason: 'email_not_configured' })
    expect(communications.size).toBe(0)
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('logs ids and counts only — never an address or the subject', async () => {
    const { store } = fakeStore()
    const log = logger()
    await runMonthlyReportForOrg(store, fakeDeps(), { org: ORG, month: null, now: CRON_NOW, source: 'cron' }, log)
    const lines = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    expect(lines).not.toMatch(/@example\.test|Maple Creek|board report/)
  })
})

describe('runMonthlyBoardReport (cron)', () => {
  it('runs every org in its own step and keeps going past a failed one', async () => {
    const orgs = [ORG, { id: 'org-2', name: 'Oak Hollow' }]
    const { store } = fakeStore({ orgs })
    store.primaryAssociation = vi.fn(async (orgId: string) => {
      if (orgId === 'org-1') throw new Error('db down')
      return { ...ASSOC, id: 'assoc-2' }
    })
    const deps = fakeDeps()
    const steps: string[] = []
    const log = logger()
    const res = await runMonthlyBoardReport(store, deps, CRON_NOW, log, async (name, fn) => {
      steps.push(name)
      return fn()
    })
    expect(steps).toEqual(['monthly-board-report-org-1', 'monthly-board-report-org-2'])
    expect(res).toEqual({ orgs: 2, sent: 1, skipped: 0, errored: 1 })
    expect(deps.sendEmail).toHaveBeenCalledTimes(2)
  })
})

describe('runRequestedMonthlyReport (Send now)', () => {
  it('sends for the one requested org and month', async () => {
    const { store } = fakeStore()
    const deps = fakeDeps()
    const res = await runRequestedMonthlyReport(store, deps, { orgId: 'org-1', month: '2026-09' }, new Date('2026-10-17T15:00:00Z'), logger(), async (_n, fn) => fn())
    expect(res).toMatchObject({ status: 'sent', month: '2026-09' })
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
  })

  it('does nothing for an org it cannot find', async () => {
    const { store } = fakeStore()
    const deps = fakeDeps()
    const res = await runRequestedMonthlyReport(store, deps, { orgId: 'nope', month: null }, CRON_NOW, logger(), async (_n, fn) => fn())
    expect(res).toEqual({ status: 'skipped', month: null, reason: 'org_not_found' })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })
})
