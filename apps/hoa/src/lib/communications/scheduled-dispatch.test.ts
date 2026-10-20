import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-102 A1: delivering one claimed scheduled communication. The database
 * is a recording fake, and the guarded senders are mocked — nothing here
 * reaches a real provider.
 */

const h = vi.hoisted(() => ({
  trace: [] as unknown[],
  comm: null as Record<string, unknown> | null,
  queued: [] as Array<Record<string, unknown>>,
  prefsRows: [] as Array<{ user_id: string; email_opt_in: boolean; sms_opt_in: boolean }>,
  emailFails: false,
}))

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  fetchOrgSandbox: async () => false,
}))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: Array<{ to: string }>, outbound: unknown) => {
    h.trace.push(['sendEmailBatch', payloads, outbound])
    return payloads.map((_, i) => (h.emailFails ? { ok: false, error: 'rejected' } : { ok: true, messageId: `msg-${i}` }))
  },
}))
vi.mock('@/lib/sms', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms')>()),
  sendSms: async (input: unknown, outbound: unknown) => {
    h.trace.push(['sendSms', input, outbound])
    return { ok: true, messageSid: 'sid-1' }
  },
}))

function fakeClient() {
  return {
    from(table: string) {
      const calls: Array<[string, unknown[]]> = []
      h.trace.push(['db', table, calls])
      const resolve = () => {
        const ops = calls.map((c) => c[0])
        if (table === 'communications' && ops.includes('select') && !ops.includes('update')) return { data: h.comm, error: null }
        if (table === 'associations') return { data: { name: 'Lakeside HOA', type: 'hoa' }, error: null }
        if (table === 'communication_recipients' && ops.includes('select')) return { data: h.queued, error: null }
        if (table === 'resident_communication_preferences') {
          const range = calls.find((c) => c[0] === 'range') as [string, [number]]
          return { data: range[1][0] === 0 ? h.prefsRows : [], error: null }
        }
        return { data: null, error: null }
      }
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'update', 'eq', 'in', 'is', 'not', 'order', 'range', 'limit']) {
        b[op] = (...args: unknown[]) => {
          calls.push([op, args])
          return b
        }
      }
      b.maybeSingle = async () => resolve()
      b.single = async () => resolve()
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad)
      return b
    },
  }
}

const { dispatchScheduledCommunication } = await import('./scheduled-dispatch')

const COMM = {
  id: 'comm-9',
  organization_id: 'org-1',
  association_id: 'assoc-1',
  subject: 'Water shutoff on Thursday, October 22',
  body_html: '<p>Hi {{recipient_name}}, water is off on Elm St.</p>',
  body_text: 'Hi {{recipient_name}}, water is off on Elm St.',
  channels: ['email', 'sms', 'portal'],
  audience_definition: { kind: 'everyone' },
  status: 'sending',
}
const QUEUED = [
  { id: 'r1', channel: 'email', email: 'ana@example.test', phone: null, recipient_name: 'Ana', unit_id: 'u1', user_id: 'user-a' },
  { id: 'r2', channel: 'sms', email: null, phone: '+15550100001', recipient_name: 'Ana', unit_id: 'u1', user_id: 'user-a' },
  { id: 'r3', channel: 'email', email: 'ben@example.test', phone: null, recipient_name: 'Ben', unit_id: 'u2', user_id: 'user-b' },
  { id: 'r4', channel: 'portal', email: null, phone: null, recipient_name: 'Ben', unit_id: 'u2', user_id: 'user-b' },
]

const sends = () => h.trace.filter((t) => ['sendEmailBatch', 'sendSms'].includes((t as [string])[0]))
const updatesTo = (table: string) =>
  h.trace
    .filter((t) => (t as [string, string])[0] === 'db' && (t as [string, string])[1] === table)
    .map((t) => (t as [string, string, Array<[string, unknown[]]>])[2])
    .filter((calls) => calls.some((c) => c[0] === 'update'))

beforeEach(() => {
  h.trace = []
  h.comm = { ...COMM }
  h.queued = QUEUED.map((r) => ({ ...r }))
  h.prefsRows = [{ user_id: 'user-a', email_opt_in: true, sms_opt_in: true }]
  h.emailFails = false
})

describe('dispatchScheduledCommunication', () => {
  it('delivers the stored message to the queued rows through the guarded senders, then marks it sent', async () => {
    const result = await dispatchScheduledCommunication('comm-9', fakeClient() as never)
    expect(result).toEqual({ ok: true, sentCount: 4, failedCount: 0, skippedCount: 0, optedOutCount: 0 })
    const batch = h.trace.find((t) => (t as [string])[0] === 'sendEmailBatch') as [string, Array<{ to: string; subject: string; html: string }>, unknown]
    expect(batch[1].map((p) => p.to)).toEqual(['ana@example.test', 'ben@example.test'])
    expect(batch[1][0].html).toContain('Hi Ana, water is off on Elm St.')
    expect(batch[2]).toEqual({ orgSandbox: false, ref: 'comm-9' })
    const final = updatesTo('communications').at(-1)!
    expect(final).toContainEqual(['eq', ['status', 'sending']])
    expect((final.find((c) => c[0] === 'update')![1][0] as { status: string }).status).toBe('sent')
  })

  it('does nothing for a row it did not claim (cancelled, still scheduled, finished)', async () => {
    for (const status of ['cancelled', 'scheduled', 'sent', 'failed']) {
      h.trace = []
      h.comm = { ...COMM, status }
      const result = await dispatchScheduledCommunication('comm-9', fakeClient() as never)
      expect(result.ok).toBe(false)
      expect(sends()).toEqual([])
      expect(updatesTo('communications')).toEqual([])
    }
  })

  it('re-checks preferences: a resident who opted out after scheduling gets nothing on that channel', async () => {
    h.prefsRows = [
      { user_id: 'user-a', email_opt_in: true, sms_opt_in: false },
      { user_id: 'user-b', email_opt_in: false, sms_opt_in: false },
    ]
    const result = await dispatchScheduledCommunication('comm-9', fakeClient() as never)
    expect(result).toMatchObject({ ok: true, sentCount: 2, optedOutCount: 2 })
    const batch = h.trace.find((t) => (t as [string])[0] === 'sendEmailBatch') as [string, Array<{ to: string }>]
    expect(batch[1].map((p) => p.to)).toEqual(['ana@example.test'])
    expect(h.trace.some((t) => (t as [string])[0] === 'sendSms')).toBe(false)
    const suppress = updatesTo('communication_recipients').find((calls) =>
      calls.some((c) => c[0] === 'update' && (c[1][0] as { delivery_status: string }).delivery_status === 'suppressed'),
    )!
    expect(suppress).toContainEqual(['in', ['id', ['r2', 'r3']]])
  })

  it('a scheduled official notice keeps its consent-filtered email rows', async () => {
    h.comm = { ...COMM, audience_definition: { kind: 'everyone', official_notice: true } }
    h.prefsRows = [{ user_id: 'user-b', email_opt_in: false, sms_opt_in: false }]
    await dispatchScheduledCommunication('comm-9', fakeClient() as never)
    const batch = h.trace.find((t) => (t as [string])[0] === 'sendEmailBatch') as [string, Array<{ to: string }>]
    expect(batch[1].map((p) => p.to)).toEqual(['ana@example.test', 'ben@example.test'])
  })

  it('every email failing marks the message failed', async () => {
    h.queued = [QUEUED[0]]
    h.emailFails = true
    const result = await dispatchScheduledCommunication('comm-9', fakeClient() as never)
    expect(result).toMatchObject({ ok: true, sentCount: 0, failedCount: 1 })
    const final = updatesTo('communications').at(-1)!
    expect((final.find((c) => c[0] === 'update')![1][0] as { status: string }).status).toBe('failed')
  })

  it('never throws: a database error marks it failed and returns an error', async () => {
    const broken = {
      from(table: string) {
        if (table === 'communications') {
          const b: Record<string, unknown> = {}
          for (const op of ['select', 'eq', 'is']) b[op] = () => b
          b.update = () => ({ eq: () => ({ eq: async () => ({ error: null }) }) })
          b.maybeSingle = async () => ({ data: null, error: { message: 'boom' } })
          return b
        }
        throw new Error('unexpected table')
      },
    }
    const result = await dispatchScheduledCommunication('comm-9', broken as never)
    expect(result).toEqual({ ok: false, error: 'communication lookup: boom' })
  })

  it('logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k))
    await dispatchScheduledCommunication('comm-9', fakeClient() as never)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    for (const s of spies) s.mockRestore()
  })
})
