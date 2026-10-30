import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  maskEmail,
  runStatementEmail,
  statementCommunicationId,
  STATEMENT_AUDIT_ACTION,
  type StatementContext,
  type StatementEmailDeps,
  type StatementEmailEvent,
  type StatementEmailStore,
} from './statement-run'
import type { ReceiptOwner } from './receipt-run'
import { renderStatementEmail } from './statement-render'
import { ACTION_LABELS } from '@/lib/audit/labels'

const ASSOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG = 'bbbbbbbb-0000-4000-8000-000000000002'
const PROPERTY = 'cccccccc-0000-4000-8000-000000000003'
const UNIT = 'dddddddd-0000-4000-8000-000000000004'
const OWNER = 'eeeeeeee-0000-4000-8000-000000000005'
const NOW = new Date('2026-10-30T12:00:00Z')

const dana: ReceiptOwner = { userId: OWNER, name: 'Dana Smith', email: 'dana@example.test' }

function context(owners: ReceiptOwner[] = [dana], over: Partial<StatementContext> = {}): StatementContext {
  return {
    association: { id: ASSOC, name: 'Maple Court', type: 'hoa', organizationId: ORG },
    unitId: UNIT,
    home: '4 · 12 Oak St',
    statementDate: '2026-10-30',
    period: 'Oct 30, 2025 – Oct 30, 2026',
    openingBalance: 0,
    charges: 300,
    paymentsAndCredits: 100,
    closingBalance: 200,
    lines: [
      { date: '2026-09-01', description: 'Regular assessment', charge: 300, payment: null, balance: 300 },
      { date: '2026-09-05', description: 'Payment', charge: null, payment: 100, balance: 200 },
    ],
    owners,
    ...over,
  }
}

function fakeStore(ctx: StatementContext | null, opts: { optedOut?: string[]; recent?: boolean } = {}) {
  const claimed = new Map<string, unknown>()
  const recipients: Array<{ id: string; email: string; status?: string }> = []
  const finished: Array<[string, string]> = []
  const audits: Array<Record<string, unknown>> = []
  const store: StatementEmailStore = {
    loadContext: vi.fn(async () => ctx),
    emailOptIn: vi.fn(async (_o, userId) => !(opts.optedOut ?? []).includes(userId)),
    orgSandbox: vi.fn(async () => true),
    recentStatement: vi.fn(async () => opts.recent ?? false),
    claim: vi.fn(async (c) => {
      if (claimed.has(c.id)) return { ok: false as const, reason: 'exists' as const }
      claimed.set(c.id, c)
      return { ok: true as const }
    }),
    insertRecipient: vi.fn(async (_c, _o, r) => {
      const id = `r${recipients.length + 1}`
      recipients.push({ id, email: r.email })
      return { id }
    }),
    markRecipient: vi.fn(async (id, outcome) => {
      recipients.find((r) => r.id === id)!.status = outcome.status
    }),
    finish: vi.fn(async (id, status) => {
      finished.push([id, status])
    }),
    audit: vi.fn(async (a) => {
      audits.push(a)
    }),
  }
  return { store, claimed, recipients, finished, audits }
}

function deps(over: Partial<StatementEmailDeps> = {}): StatementEmailDeps {
  return {
    // A fake: no test here can reach a real transport.
    sendEmail: vi.fn(async () => ({ ok: true as const, messageId: 'm1' })),
    emailConfigured: () => true,
    portalUrl: (p: string) => `https://app.test${p}`,
    now: () => NOW,
    ...over,
  }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const event: StatementEmailEvent = {
  propertyId: PROPERTY,
  from: '2025-10-30',
  to: '2026-10-30',
  actorUserId: 'board-1',
  actorRole: 'board',
  organizationId: ORG,
}

describe('runStatementEmail', () => {
  it('sends once to the owner, finishes the row and writes the audit row', async () => {
    const { store, recipients, finished, audits } = fakeStore(context())
    const d = deps()
    const r = await runStatementEmail(store, d, event, logger())
    expect(r).toMatchObject({ status: 'sent', sent: 1, held: 0, failed: 0 })
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    const [input, opts] = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(input.to).toBe('dana@example.test')
    expect(input.subject).toBe('Your account statement from Maple Court')
    expect(input.html).toContain('https://app.test/resident/dues/statement')
    expect(opts).toMatchObject({ orgSandbox: true, ref: r.communicationId })
    expect(recipients[0]!.status).toBe('sent')
    expect(finished).toEqual([[r.communicationId, 'sent']])
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ organizationId: ORG, actorUserId: 'board-1', propertyId: PROPERTY, outcome: 'sent', recipients: 1 })
  })

  it('takes the address only from the store, never from the event', async () => {
    const { store } = fakeStore(context())
    const d = deps()
    const hostile = { ...event, to_email: 'attacker@evil.test', email: 'attacker@evil.test' } as StatementEmailEvent
    await runStatementEmail(store, d, hostile, logger())
    const sent = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].to)
    expect(sent).toEqual(['dana@example.test'])
  })

  it('a home outside the caller org is not found and nothing is sent', async () => {
    const other = context([dana], { association: { id: ASSOC, name: 'Other', type: null, organizationId: 'other-org' } })
    const { store } = fakeStore(other)
    const d = deps()
    expect((await runStatementEmail(store, d, event, logger())).status).toBe('not_found')
    expect(d.sendEmail).not.toHaveBeenCalled()
    const missing = fakeStore(null)
    expect((await runStatementEmail(missing.store, d, event, logger())).status).toBe('not_found')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('an opted-out owner is not sent to and no communication is recorded', async () => {
    const { store, claimed, audits } = fakeStore(context(), { optedOut: [OWNER] })
    const d = deps()
    const r = await runStatementEmail(store, d, event, logger())
    expect(r).toMatchObject({ status: 'opted_out', optedOut: 1, sent: 0 })
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(claimed.size).toBe(0)
    expect(audits).toHaveLength(0)
  })

  it('no email on file sends nothing', async () => {
    const { store } = fakeStore(context([{ userId: OWNER, name: 'Dana', email: '  ' }]))
    const d = deps()
    expect((await runStatementEmail(store, d, event, logger())).status).toBe('no_email')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a guard hold is recorded suppressed, not failed', async () => {
    const { store, recipients, finished, audits } = fakeStore(context())
    const d = deps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })) })
    const r = await runStatementEmail(store, d, event, logger())
    expect(r).toMatchObject({ status: 'held', held: 1, failed: 0, sent: 0 })
    expect(recipients[0]!.status).toBe('suppressed')
    expect(finished[0]![1]).toBe('cancelled')
    expect(audits[0]!.outcome).toBe('suppressed')
  })

  it('a provider error is failed, and a thrown sender never escapes', async () => {
    const a = fakeStore(context())
    const failed = await runStatementEmail(a.store, deps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: 'boom' })) }), event, logger())
    expect(failed).toMatchObject({ status: 'failed', failed: 1 })
    const b = fakeStore(context())
    const thrown = await runStatementEmail(b.store, deps({ sendEmail: vi.fn(async () => { throw new Error('x') }) }), event, logger())
    expect(thrown.status).toBe('failed')
  })

  it('refuses a second statement for the same unit inside 24 hours', async () => {
    const { store } = fakeStore(context(), { recent: true })
    const d = deps()
    const r = await runStatementEmail(store, d, event, logger())
    expect(r.status).toBe('duplicate')
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
    const since = (store.recentStatement as ReturnType<typeof vi.fn>).mock.calls[0]![1]
    expect(since).toBe('2026-10-29T12:00:00.000Z')
  })

  it('two simultaneous sends cannot both claim', async () => {
    const { store } = fakeStore(context())
    const d = deps()
    const first = await runStatementEmail(store, d, event, logger())
    const second = await runStatementEmail(store, d, event, logger())
    expect(first.status).toBe('sent')
    expect(second.status).toBe('duplicate')
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does not claim or send when email delivery is not configured', async () => {
    const { store } = fakeStore(context())
    const d = deps({ emailConfigured: () => false })
    expect((await runStatementEmail(store, d, event, logger())).status).toBe('email_not_configured')
    expect(store.claim).not.toHaveBeenCalled()
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('never throws: a store failure comes back as failed', async () => {
    const { store } = fakeStore(context())
    ;(store.loadContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db'))
    expect((await runStatementEmail(store, deps(), event, logger())).status).toBe('failed')
  })

  it('an audit failure does not undo a send', async () => {
    const { store } = fakeStore(context())
    ;(store.audit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('audit'))
    expect((await runStatementEmail(store, deps(), event, logger())).status).toBe('sent')
  })

  it('logs carry no address, name or amount', async () => {
    const { store } = fakeStore(context())
    const log = logger()
    await runStatementEmail(store, deps(), event, log)
    const all = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
    expect(all).not.toContain('dana@')
    expect(all).not.toContain('Dana')
  })
})

describe('statement email helpers', () => {
  it('the claim id is stable inside one 24-hour bucket and differs across units', () => {
    const a = statementCommunicationId(UNIT, new Date('2026-10-30T01:00:00Z'))
    expect(statementCommunicationId(UNIT, new Date('2026-10-30T20:00:00Z'))).toBe(a)
    expect(statementCommunicationId('other-unit', NOW)).not.toBe(statementCommunicationId(UNIT, NOW))
  })

  it('masks all but the first letter of the local part', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@example.com')
    expect(maskEmail('nonsense')).toBe('***')
  })

  it('the audit action has a communications label', () => {
    expect(ACTION_LABELS[STATEMENT_AUDIT_ACTION]).toMatchObject({ area: 'communications' })
  })

  it('renders the subject, the figures and the portal link, with no owner name or em dash', () => {
    const c = context()
    const m = renderStatementEmail({ ...c, associationName: 'Maple Court', portalUrl: 'https://app.test/resident/dues/statement' })
    expect(m.subject).toBe('Your account statement from Maple Court')
    expect(m.text).toContain('Balance due: $200.00')
    expect(m.text).toContain('Charges: $300.00')
    expect(m.html).toContain('https://app.test/resident/dues/statement')
    expect(m.html + m.text).not.toContain('Dana')
    expect(m.html + m.text).not.toContain('—')
  })
})
