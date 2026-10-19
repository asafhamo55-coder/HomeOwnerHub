import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sendCommunication end to end against a recording fake client.
 *
 * Every database statement and every outbound call (sendEmailBatch /
 * sendSms, which apply the outbound guard internally) is captured as a
 * trace. With M1_APPLIED false the trace is pinned by a snapshot that was
 * recorded against send.ts BEFORE the BL-020 consent wiring existed, so
 * "flag off changes nothing" is proven byte for byte rather than argued.
 *
 * No real email, SMS or database: everything external is mocked.
 */

const h = vi.hoisted(() => ({
  m1: false,
  state: 'CA' as string | null,
  trace: [] as unknown[],
  consentRows: [] as Array<{ user_id: string; granted: boolean; method: string; created_at: string }>,
  consentError: null as { code: string } | null,
  recipients: [] as unknown[],
}))

vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return h.m1
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => h.trace.push(['revalidatePath', p]) }))
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => ({ ok: true }),
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Madison Park' }) }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  fetchOrgSandbox: async (_client: unknown, orgId: string) => {
    h.trace.push(['fetchOrgSandbox', orgId])
    return false
  },
}))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: unknown[], outbound: unknown) => {
    h.trace.push(['sendEmailBatch', payloads, outbound])
    return payloads.map((_, i) => ({ ok: true, messageId: `msg-${i}` }))
  },
}))
vi.mock('@/lib/sms', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms')>()),
  sendSms: async (input: unknown, outbound: unknown) => {
    h.trace.push(['sendSms', input, outbound])
    return { ok: true, messageSid: 'sid-1' }
  },
}))
vi.mock('./audience', async (orig) => ({
  ...(await orig<typeof import('./audience')>()),
  resolveAudience: async () => ({ summary: 'All residents (4)', recipients: h.recipients }),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => fakeClient() }))

/** Chainable PostgREST stand-in: each statement is recorded with its full call chain. */
function fakeClient() {
  return {
    from(table: string) {
      const calls: unknown[] = []
      h.trace.push(['db', table, calls])
      const resolve = (): { data: unknown; error: unknown } => {
        const ops = calls.map((c) => (c as [string])[0])
        if (table === 'associations') {
          return { data: { organization_id: 'org-1', name: 'Madison Park', type: 'hoa', state: h.state }, error: null }
        }
        if (table === 'communications' && ops.includes('insert')) return { data: { id: 'comm-1' }, error: null }
        if (table === 'communication_recipients' && ops.includes('insert')) {
          const rows = (calls.find((c) => (c as [string])[0] === 'insert') as [string, [Array<Record<string, unknown>>]])[1][0]
          return {
            data: rows.map((r, i) => ({
              id: `rec-${i}`,
              channel: r.channel,
              email: r.email,
              phone: r.phone,
              recipient_name: r.recipient_name,
              unit_id: r.unit_id,
            })),
            error: null,
          }
        }
        if (table === 'member_email_consent_events') {
          if (h.consentError) return { data: null, error: h.consentError }
          const range = calls.find((c) => (c as [string])[0] === 'range') as [string, [number]]
          return { data: range[1][0] === 0 ? h.consentRows : [], error: null }
        }
        return { data: null, error: null }
      }
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'insert', 'update', 'eq', 'in', 'is', 'not', 'order', 'range', 'limit']) {
        b[op] = (...args: unknown[]) => {
          calls.push([op, args])
          return b
        }
      }
      b.single = async () => (calls.push(['single', []]), resolve())
      b.maybeSingle = async () => (calls.push(['maybeSingle', []]), resolve())
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad)
      return b
    },
  }
}

const RECIPIENTS = [
  // Consented member with email + phone.
  { unitId: 'u1', unitAddress: '1 Elm St', unitNumber: null, recipientName: 'Ana', email: 'ana@example.test', phone: '+15550100001', userId: 'user-a' },
  // Member who revoked.
  { unitId: 'u2', unitAddress: '2 Elm St', unitNumber: '2B', recipientName: 'Ben', email: 'ben@example.test', phone: null, userId: 'user-b' },
  // No portal account: consent cannot be on record.
  { unitId: 'u3', unitAddress: '3 Elm St', unitNumber: null, recipientName: 'Cy', email: 'cy@example.test', phone: '+15550100003', userId: null },
  // Member with no consent event at all, no email on file.
  { unitId: 'u4', unitAddress: '4 Elm St', unitNumber: null, recipientName: 'Di', email: null, phone: null, userId: 'user-d' },
]

const INPUT = {
  category: 'meeting' as const,
  subject: 'Annual meeting, {{association_name}}',
  bodyHtml: '<p>Hi {{recipient_name}}, the annual meeting is on the 30th.</p>',
  bodyText: 'Hi {{recipient_name}}, the annual meeting is on the 30th.',
  channels: ['email', 'sms', 'portal'] as Array<'email' | 'sms' | 'portal'>,
  audience: { kind: 'everyone' as const },
}

const { sendCommunication } = await import('./send')

async function run(input: Record<string, unknown>) {
  h.trace = []
  const result = await sendCommunication(input as never)
  return { result, trace: h.trace }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
  h.m1 = false
  h.state = 'CA'
  h.recipients = RECIPIENTS.map((r) => ({ ...r }))
  h.consentError = null
  h.consentRows = [
    { user_id: 'user-a', granted: true, method: 'portal', created_at: '2026-10-01T00:00:00Z' },
    { user_id: 'user-b', granted: true, method: 'portal', created_at: '2026-10-01T00:00:00Z' },
    { user_id: 'user-b', granted: false, method: 'portal', created_at: '2026-10-05T00:00:00Z' },
  ]
})
afterEach(() => {
  vi.useRealTimers()
})

function recipientInsert(trace: unknown[]): Array<Record<string, unknown>> {
  for (const t of trace) {
    const [kind, table, calls] = t as [string, string, Array<[string, unknown[]]>]
    if (kind !== 'db' || table !== 'communication_recipients') continue
    const ins = calls.find((c) => c[0] === 'insert')
    if (ins) return ins[1][0] as Array<Record<string, unknown>>
  }
  return []
}
const tablesTouched = (trace: unknown[]) =>
  trace.filter((t) => (t as [string])[0] === 'db').map((t) => (t as [string, string])[1])
const emailedTo = (trace: unknown[]) =>
  trace
    .filter((t) => (t as [string])[0] === 'sendEmailBatch')
    .flatMap((t) => ((t as [string, Array<{ to: string }>])[1]).map((p) => p.to))

describe('sendCommunication, M1_APPLIED false (today)', () => {
  it('send now: the full trace is unchanged from before the consent wiring', async () => {
    const { result, trace } = await run(INPUT)
    expect(result).toMatchSnapshot('send-now result')
    expect(trace).toMatchSnapshot('send-now trace')
  })

  it('scheduled: the full trace is unchanged from before the consent wiring', async () => {
    const { result, trace } = await run({ ...INPUT, scheduledFor: '2026-12-01T09:00' })
    expect(result).toMatchSnapshot('scheduled result')
    expect(trace).toMatchSnapshot('scheduled trace')
  })

  it('marking it an official notice changes nothing while the flag is off', async () => {
    const plain = await run(INPUT)
    const official = await run({ ...INPUT, officialNotice: true })
    expect(official.result).toEqual(plain.result)
    expect(official.trace).toEqual(plain.trace)
    expect(tablesTouched(official.trace)).not.toContain('member_email_consent_events')
  })
})

describe('sendCommunication, M1_APPLIED true', () => {
  beforeEach(() => {
    h.m1 = true
  })

  it('an ordinary announcement is untouched: same trace as with the flag off', async () => {
    const on = await run({ ...INPUT, category: 'announcement' })
    h.m1 = false
    const off = await run({ ...INPUT, category: 'announcement' })
    expect(on.trace).toEqual(off.trace)
    expect(on.result).toEqual(off.result)
    expect(on.result).not.toHaveProperty('paperNotice')
  })

  it('CA official notice: email only to members whose latest consent is on; the rest need paper', async () => {
    const { result, trace } = await run({ ...INPUT, officialNotice: true })
    expect(emailedTo(trace)).toEqual(['ana@example.test'])
    const rows = recipientInsert(trace).map((r) => `${r.channel}:${r.user_id ?? r.recipient_name}`)
    // Ben (revoked) and Cy (no account) lose only the email row; SMS and portal stay.
    expect(rows).toEqual(['email:user-a', 'sms:user-a', 'portal:user-a', 'portal:user-b', 'sms:Cy', 'portal:user-d'])
    expect(result).toEqual({
      ok: true,
      communicationId: 'comm-1',
      recipientCount: 6,
      sentCount: 6,
      failedCount: 0,
      skippedCount: 0,
      paperNotice: {
        count: 3,
        recipients: [
          { name: 'Ben', home: '2 Elm St #2B' },
          { name: 'Cy', home: '3 Elm St' },
          { name: 'Di', home: '4 Elm St' },
        ],
      },
    })
    // Still through the outbound guard's entry point, with the send's ref.
    const batch = trace.find((t) => (t as [string])[0] === 'sendEmailBatch') as [string, unknown, unknown]
    expect(batch[2]).toEqual({ orgSandbox: false, ref: 'comm-1' })
    expect(tablesTouched(trace)).toContain('member_email_consent_events')
  })

  it('a scheduled official notice queues no email rows for non-consenting members', async () => {
    const { result, trace } = await run({ ...INPUT, officialNotice: true, scheduledFor: '2026-12-01T09:00' })
    expect(recipientInsert(trace).filter((r) => r.channel === 'email').map((r) => r.user_id)).toEqual(['user-a'])
    expect(result).toMatchObject({ ok: true, sentCount: 0, paperNotice: { count: 3 } })
    expect(emailedTo(trace)).toEqual([])
  })

  it('email not among the channels: every recipient needs paper', async () => {
    const { result } = await run({ ...INPUT, officialNotice: true, channels: ['portal'] })
    expect(result).toMatchObject({ ok: true, paperNotice: { count: 4 } })
  })

  it('nobody deliverable: refuses and says how many need paper', async () => {
    h.consentRows = []
    const { result, trace } = await run({ ...INPUT, officialNotice: true, channels: ['email'] })
    expect(result).toEqual({
      ok: false,
      error: 'No one in this audience can receive this official notice on the selected channels. All 4 need a paper notice.',
    })
    expect(emailedTo(trace)).toEqual([])
  })

  it('consent that fails to load refuses before anything is written or sent', async () => {
    h.consentError = { code: '500' }
    const { result, trace } = await run({ ...INPUT, officialNotice: true })
    expect(result).toEqual({ ok: false, error: 'Couldn’t check e-consent for this official notice. Nothing was sent.' })
    expect(tablesTouched(trace)).not.toContain('communications')
    expect(trace.some((t) => ['sendEmailBatch', 'sendSms'].includes((t as [string])[0]))).toBe(false)
  })

  it('outside California an official notice emails everyone, as today', async () => {
    h.state = 'FL'
    const { result, trace } = await run({ ...INPUT, officialNotice: true })
    expect(emailedTo(trace)).toEqual(['ana@example.test', 'ben@example.test', 'cy@example.test'])
    expect(result).not.toHaveProperty('paperNotice')
    expect(tablesTouched(trace)).not.toContain('member_email_consent_events')
  })

  it('logs nothing about recipients', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k))
    await run({ ...INPUT, officialNotice: true })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    for (const s of spies) s.mockRestore()
  })
})
