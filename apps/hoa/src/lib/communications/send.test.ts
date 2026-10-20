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
  prefsRows: [] as Array<{ user_id: string; email_opt_in: boolean; sms_opt_in: boolean }>,
  prefsError: null as { code: string } | null,
  // BL-111: sms_consent_granted / _revoked audit rows.
  smsConsentRows: [] as Array<Record<string, unknown>>,
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
        if (table === 'resident_communication_preferences') {
          if (h.prefsError) return { data: null, error: h.prefsError }
          const range = calls.find((c) => (c as [string])[0] === 'range') as [string, [number]]
          return { data: range[1][0] === 0 ? h.prefsRows : [], error: null }
        }
        if (table === 'audit_log') {
          const range = calls.find((c) => (c as [string])[0] === 'range') as [string, [number]]
          return { data: range[1][0] === 0 ? h.smsConsentRows : [], error: null }
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
const { sha256Hex } = await import('@/lib/sms-consent')

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
  // BL-102: Ana opted in to texts. Nobody else has a preference row, so
  // they get the defaults: email on, texts off.
  h.prefsRows = [{ user_id: 'user-a', email_opt_in: true, sms_opt_in: true }]
  h.prefsError = null
  // BL-111: Ana agreed to texts at the number on file.
  h.smsConsentRows = [
    {
      id: 'audit-1',
      user_id: 'user-a',
      action: 'sms_consent_granted',
      metadata: { phone_sha256: [sha256Hex('+15550100001')] },
      created_at: '2026-10-01T00:00:00Z',
    },
  ]
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

// BL-102 deliberately re-recorded these two snapshots: the trace gained the
// resident_communication_preferences read, and Cy's SMS row (a phone but no
// text opt-in) is gone. Everything else in the trace is byte-identical.
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
    // Ben (revoked) and Cy (no account) lose only the email row; portal
    // stays. Cy has a phone but no text opt-in (BL-102), so no SMS row.
    expect(rows).toEqual(['email:user-a', 'sms:user-a', 'portal:user-a', 'portal:user-b', 'portal:user-d'])
    expect(result).toEqual({
      ok: true,
      communicationId: 'comm-1',
      recipientCount: 5,
      sentCount: 5,
      failedCount: 0,
      skippedCount: 0,
      heldCount: 0,
      optedOutCount: 1,
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

const textedTo = (trace: unknown[]) =>
  trace.filter((t) => (t as [string])[0] === 'sendSms').map((t) => (t as [string, { to: string }])[1].to)
const commInsert = (trace: unknown[]): Record<string, unknown> | undefined => {
  for (const t of trace) {
    const [kind, table, calls] = t as [string, string, Array<[string, unknown[]]>]
    if (kind !== 'db' || table !== 'communications') continue
    const ins = calls.find((c) => c[0] === 'insert')
    if (ins) return ins[1][0] as Record<string, unknown>
  }
  return undefined
}

describe('resident preferences (BL-102)', () => {
  it('an email opt-out gets no email row and no email; their other channels stay', async () => {
    h.prefsRows = [
      { user_id: 'user-a', email_opt_in: true, sms_opt_in: true },
      { user_id: 'user-b', email_opt_in: false, sms_opt_in: false },
    ]
    const { result, trace } = await run(INPUT)
    expect(emailedTo(trace)).toEqual(['ana@example.test', 'cy@example.test'])
    const ben = recipientInsert(trace).filter((r) => r.user_id === 'user-b').map((r) => r.channel)
    expect(ben).toEqual(['portal'])
    expect(result).toMatchObject({ ok: true, optedOutCount: 2 })
  })

  it('texts go only to residents who opted in', async () => {
    const { trace } = await run(INPUT)
    // Ana opted in. Cy has a phone but no account, so no preference row:
    // the default is no texts.
    expect(textedTo(trace)).toEqual(['+15550100001'])
    expect(recipientInsert(trace).filter((r) => r.channel === 'sms').map((r) => r.user_id)).toEqual(['user-a'])
  })

  it('BL-111: a number changed since consent is not texted and counts as an opt-out, never a failure', async () => {
    h.smsConsentRows = [
      {
        id: 'audit-1',
        user_id: 'user-a',
        action: 'sms_consent_granted',
        metadata: { phone_sha256: [sha256Hex('+15550109999')] },
        created_at: '2026-10-01T00:00:00Z',
      },
    ]
    const { result, trace } = await run(INPUT)
    expect(textedTo(trace)).toEqual([])
    expect(recipientInsert(trace).some((r) => r.channel === 'sms')).toBe(false)
    expect(emailedTo(trace)).toContain('ana@example.test')
    expect(result).toMatchObject({ ok: true, failedCount: 0, optedOutCount: 2 })
  })

  it('BL-111: a legacy opt-in with no consent record is not texted', async () => {
    h.smsConsentRows = []
    const { trace } = await run(INPUT)
    expect(textedTo(trace)).toEqual([])
  })

  it('BL-111: a revoked consent is not texted even if sms_opt_in were still on', async () => {
    h.smsConsentRows = [
      ...h.smsConsentRows,
      { id: 'audit-2', user_id: 'user-a', action: 'sms_consent_revoked', metadata: {}, created_at: '2026-10-02T00:00:00Z' },
    ]
    const { trace } = await run(INPUT)
    expect(textedTo(trace)).toEqual([])
  })

  it('BL-111: the consent rows are read once per send, not per recipient', async () => {
    const { trace } = await run(INPUT)
    expect(tablesTouched(trace).filter((t) => t === 'audit_log')).toHaveLength(1)
  })

  it('with no preference rows at all, nobody is texted', async () => {
    h.prefsRows = []
    const { result, trace } = await run(INPUT)
    expect(textedTo(trace)).toEqual([])
    expect(recipientInsert(trace).some((r) => r.channel === 'sms')).toBe(false)
    expect(result).toMatchObject({ ok: true, optedOutCount: 2 })
  })

  it('a resident who said no to texts is not texted even with a phone on file', async () => {
    h.prefsRows = [{ user_id: 'user-a', email_opt_in: true, sms_opt_in: false }]
    const { trace } = await run(INPUT)
    expect(textedTo(trace)).toEqual([])
  })

  it('everyone opted out of the only channel: refuses and sends nothing', async () => {
    h.prefsRows = []
    const { result, trace } = await run({ ...INPUT, channels: ['sms'] })
    expect(result).toEqual({
      ok: false,
      error: 'Nobody in this audience can get this message: everyone with contact details on file has opted out of the selected channels.',
    })
    expect(textedTo(trace)).toEqual([])
  })

  it('a failed preference read refuses before anything is written or sent', async () => {
    h.prefsError = { code: '500' }
    const { result, trace } = await run(INPUT)
    expect(result).toEqual({ ok: false, error: 'Couldn’t check residents’ message preferences. Nothing was sent.' })
    expect(tablesTouched(trace)).not.toContain('communications')
    expect(trace.some((t) => ['sendEmailBatch', 'sendSms'].includes((t as [string])[0]))).toBe(false)
  })

  it('a scheduled send queues no rows for opted-out channels', async () => {
    h.prefsRows = [{ user_id: 'user-b', email_opt_in: false, sms_opt_in: false }]
    const { result, trace } = await run({ ...INPUT, scheduledFor: '2026-12-01T09:00:00.000Z' })
    const rows = recipientInsert(trace).map((r) => `${r.channel}:${r.user_id ?? r.recipient_name}`)
    expect(rows).toEqual(['email:user-a', 'portal:user-a', 'portal:user-b', 'email:Cy', 'portal:user-d'])
    expect(result).toMatchObject({ ok: true, sentCount: 0, optedOutCount: 3 })
    expect(emailedTo(trace)).toEqual([])
  })

  it('board and custom-contact audiences do not read preferences', async () => {
    for (const kind of ['board', 'manual_emails'] as const) {
      const { trace } = await run({ ...INPUT, audience: { kind } })
      expect(tablesTouched(trace)).not.toContain('resident_communication_preferences')
    }
  })

  it('CA official notice (M1): email follows e-consent, not email_opt_in; texts still need opt-in', async () => {
    h.m1 = true
    // Ana consented to e-notices but turned announcement email off.
    h.prefsRows = [{ user_id: 'user-a', email_opt_in: false, sms_opt_in: false }]
    const { trace } = await run({ ...INPUT, officialNotice: true })
    expect(emailedTo(trace)).toEqual(['ana@example.test'])
    expect(textedTo(trace)).toEqual([])
  })

  it('logs nothing about recipients', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k))
    h.prefsRows = [{ user_id: 'user-b', email_opt_in: false, sms_opt_in: false }]
    await run(INPUT)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    for (const s of spies) s.mockRestore()
  })
})

describe('scheduling (BL-102 A1)', () => {
  const POOL = {
    ...INPUT,
    category: 'announcement' as const,
    subject: 'The pool closes {{ closing_date }}',
    bodyHtml: '<p>Hi {{recipient_name}}, the pool closes {{ closing_date }} for {{ closing_reason }}.</p>',
    bodyText: 'Hi {{recipient_name}}, the pool closes {{ closing_date }} for {{ closing_reason }}.',
    scheduledFor: '2026-12-01T14:00:00.000Z',
  }

  it('bakes the template answers into the stored message and keeps per-recipient fields', async () => {
    const { result, trace } = await run({
      ...POOL,
      extraFields: { closing_date: 'Monday, November 30', closing_reason: 'the season' },
    })
    expect(result).toMatchObject({ ok: true, sentCount: 0 })
    const row = commInsert(trace)!
    expect(row.status).toBe('scheduled')
    expect(row.subject).toBe('The pool closes Monday, November 30')
    expect(row.body_html).toBe('<p>Hi {{recipient_name}}, the pool closes Monday, November 30 for the season.</p>')
    expect(row.body_text).toBe('Hi {{recipient_name}}, the pool closes Monday, November 30 for the season.')
    expect(emailedTo(trace)).toEqual([])
  })

  it('refuses a message with an unanswered question, naming it, and writes nothing', async () => {
    const { result, trace } = await run({ ...POOL, extraFields: { closing_date: 'Monday, November 30', closing_reason: '' } })
    expect(result).toEqual({ ok: false, error: 'Answer every question before scheduling. Still blank: closing reason.' })
    expect(tablesTouched(trace)).not.toContain('communications')
  })

  it('refuses per-home details, which cannot be stored for later', async () => {
    const { result, trace } = await run({
      ...POOL,
      extraFields: { closing_date: 'x', closing_reason: 'y' },
      extraMergeFields: { 'ana@example.test': { dues_table: '<table></table>' } },
    })
    expect(result).toMatchObject({ ok: false })
    expect(tablesTouched(trace)).not.toContain('communications')
  })

  it('a time in the past sends now', async () => {
    const { result, trace } = await run({ ...INPUT, scheduledFor: '2026-10-19T11:00:00.000Z' })
    expect(commInsert(trace)!.status).toBe('sending')
    expect(result).toMatchObject({ ok: true })
    expect(emailedTo(trace).length).toBeGreaterThan(0)
  })
})
