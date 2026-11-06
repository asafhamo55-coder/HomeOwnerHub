import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { installFakeTwilio, twilioError } from '@/lib/test-utils/fake-twilio'

/**
 * BL-146b: outbound texts go through Twilio's Messages REST resource
 * (form-encoded POST, Basic auth, a Messaging Service), so the row's
 * external_id holds the message `sid` the signed status webhook matches
 * on. These tests run the REAL sendSms, deliverToRecipients and
 * resident-notify runner with only fetch faked, and prove:
 *   - the request shape (URL, auth header, form fields) and that the sid
 *     is what gets stored in external_id;
 *   - every gate in front of the provider still holds (outbound guard,
 *     sandbox org, missing config, text allowance, no phone, consent,
 *     opt-out), and a blocked text never reaches the network;
 *   - a provider failure still lands as a short, PII-free code.
 * Nothing here reaches a real provider or a database.
 */

const h = vi.hoisted(() => ({
  orgSandbox: false,
  gate: null as null | { take: () => boolean },
}))

const smsSend = vi.fn()
vi.mock('@homeowner-portal/observability/outbound-guard', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/observability/outbound-guard')>()),
  fetchOrgSandbox: async () => h.orgSandbox,
}))
vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  sendEmail: async () => ({ ok: true, messageId: 'm-1' }),
  sendEmailBatch: async (payloads: unknown[]) => payloads.map((_, i) => ({ ok: true, messageId: `m-${i}` })),
}))
vi.mock('@/lib/sms-allowance', () => ({ smsAllowanceGate: async () => h.gate }))

const UUID = 'SMaaaaaaaabbbb4ccc8ddd0123456789ab'
const ALLOWED = '+14045550100'
const OTHER = '+14045550199'

function stubEnv(over: Record<string, string> = {}) {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.homeownerledger.com')
  vi.stubEnv('SMS_STATUS_WEBHOOK_ENABLED', 'true')
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'token')
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', 'MGtest')
  for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v)
}

async function freshSms() {
  vi.resetModules()
  return import('./sms')
}

beforeEach(() => {
  h.orgSandbox = false
  h.gate = null
  smsSend.mockReset()
  smsSend.mockResolvedValue({ sid: UUID })
  installFakeTwilio(smsSend)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendSms — Twilio request and response', () => {
  it('posts one form-encoded message with Basic auth and a Messaging Service, and returns the sid', async () => {
    stubEnv()
    const { sendSms } = await freshSms()
    const result = await sendSms({ to: ALLOWED, body: 'Water off Thursday' })
    expect(result).toEqual({ ok: true, messageSid: UUID })
    expect(smsSend).toHaveBeenCalledTimes(1)
    const req = smsSend.mock.calls[0][0]
    expect(req.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    expect(req.auth).toBe(`Basic ${Buffer.from('ACtest:token').toString('base64')}`)
    expect(req.form).toEqual({
      To: '+14045550100',
      Body: 'Water off Thursday',
      MessagingServiceSid: 'MGtest',
      StatusCallback: 'https://www.homeownerledger.com/api/webhooks/twilio/status',
    })
    expect(req.form).not.toHaveProperty('From')
  })

  it('passes the body through untouched — a full 279-character text is not cut or split here', async () => {
    stubEnv()
    const { sendSms, htmlToSmsBody } = await freshSms()
    const body = htmlToSmsBody(`<p>${'a'.repeat(400)}</p>`)
    expect(body).toHaveLength(279)
    await sendSms({ to: ALLOWED, body })
    expect(smsSend.mock.calls[0][0].form.Body).toBe(body)
  })

  it('a response without a sid stores null rather than inventing one', async () => {
    stubEnv()
    smsSend.mockResolvedValue({})
    const { sendSms } = await freshSms()
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: true, messageSid: null })
  })
})

describe('sendSms — error handling', () => {
  it('maps a Twilio error response to a short code, never the message text', async () => {
    stubEnv()
    smsSend.mockResolvedValue(twilioError(400, 21211, "The 'To' number +14045550100 is not a valid phone number."))
    const { sendSms } = await freshSms()
    const r = await sendSms({ to: ALLOWED, body: 'x' })
    expect(r).toEqual({ ok: false, error: 'Twilio error 21211' })
  })

  it('falls back to the HTTP status when the error has no code or is not JSON', async () => {
    stubEnv()
    const { sendSms } = await freshSms()
    smsSend.mockResolvedValueOnce(twilioError(401, null, 'Authenticate'))
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'Twilio HTTP 401' })
    smsSend.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 502 }))
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'Twilio HTTP 502' })
  })

  it('a network error never echoes its message', async () => {
    stubEnv()
    smsSend.mockRejectedValueOnce(new Error('connect to +14045550100 failed')).mockRejectedValueOnce('boom')
    const { sendSms } = await freshSms()
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'Twilio request failed' })
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'Twilio request failed' })
  })

  it('a timeout reads as a timeout', async () => {
    stubEnv()
    smsSend.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    const { sendSms } = await freshSms()
    expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'Twilio request timed out' })
  })

  it('uses a timeout signal on the request', async () => {
    stubEnv()
    const fetchSpy = vi.fn(async (_u: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal)
      return new Response(JSON.stringify({ sid: UUID }), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { sendSms } = await freshSms()
    await sendSms({ to: ALLOWED, body: 'x' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('logs nothing on a failed send', async () => {
    stubEnv()
    smsSend.mockResolvedValue(twilioError(401, 20003))
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k))
    const { sendSms } = await freshSms()
    await sendSms({ to: ALLOWED, body: 'Water off Thursday' })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})

describe('sendSms — gates in front of the client', () => {
  it('outside production, a number off the allowlist is blocked and the client is never called', async () => {
    stubEnv()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { sendSms } = await freshSms()
    expect(await sendSms({ to: OTHER, body: 'x' })).toEqual({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('in production, a sandboxed org is held to the allowlist', async () => {
    stubEnv({ VERCEL_ENV: 'production' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { sendSms } = await freshSms()
    expect(await sendSms({ to: OTHER, body: 'x' }, { orgSandbox: true })).toEqual({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
    expect(smsSend).not.toHaveBeenCalled()
    expect(await sendSms({ to: OTHER, body: 'x' })).toEqual({ ok: true, messageSid: UUID })
  })

  for (const missing of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID']) {
    it(`without ${missing}, fails "SMS not configured" and never calls the client`, async () => {
      stubEnv({ [missing]: '' })
      const { sendSms } = await freshSms()
      expect(await sendSms({ to: ALLOWED, body: 'x' })).toEqual({ ok: false, error: 'SMS not configured' })
      expect(smsSend).not.toHaveBeenCalled()
    })
  }
})

describe('deliverToRecipients — the message sid lands in external_id', () => {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  function db() {
    return {
      from: () => {
        let patch: Record<string, unknown> = {}
        const chain = {
          update: (p: Record<string, unknown>) => ((patch = p), chain),
          eq: (_c: string, id: string) => {
            updates.push({ id, patch })
            return chain
          },
          then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
        }
        return chain
      },
    }
  }
  const base = {
    communicationId: 'comm-1',
    organizationId: 'org-1',
    associationName: 'Maple Court',
    associationType: 'hoa',
    subject: 'Pool closed',
    bodyHtml: '<p>The pool is closed Saturday.</p>',
    extraFields: {},
  }
  const row = (id: string, phone: string | null) => ({ id, channel: 'sms', email: null, phone, recipient_name: null, unit_id: null })
  const patchOf = (id: string) => updates.find((u) => u.id === id)!.patch

  async function deliver(recipients: ReturnType<typeof row>[]) {
    vi.resetModules()
    const { deliverToRecipients } = await import('./communications/deliver')
    return deliverToRecipients(db() as never, { ...base, recipients })
  }

  beforeEach(() => {
    updates.length = 0
    stubEnv()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('a sent text stores the message sid as external_id', async () => {
    const counts = await deliver([row('r1', ALLOWED)])
    expect(counts.sentCount).toBe(1)
    expect(patchOf('r1')).toMatchObject({ delivery_status: 'sent', external_id: UUID })
  })

  it('the stored id is exactly what the status webhook looks a receipt up by', async () => {
    await deliver([row('r1', ALLOWED)])
    const { smsStatusMove } = await import('./sms-status')
    // The route reads `MessageSid` off the receipt and matches external_id on it.
    expect(patchOf('r1').external_id).toBe(UUID)
    expect(smsStatusMove('delivered')).toMatchObject({ status: 'delivered' })
  })

  it('outbound guard: a non-allowlisted number is held (suppressed), never sent', async () => {
    const counts = await deliver([row('r1', OTHER)])
    expect(counts.heldCount).toBe(1)
    expect(smsSend).not.toHaveBeenCalled()
    expect(patchOf('r1').external_id).toBeUndefined()
  })

  it('sandbox org in production: held, never sent', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    h.orgSandbox = true
    const counts = await deliver([row('r1', OTHER)])
    expect(counts.heldCount).toBe(1)
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('text allowance used up: not sent, row failed with the board message', async () => {
    const { SMS_ALLOWANCE_REACHED_MESSAGE } = await import('@homeowner-portal/billing')
    h.gate = { take: () => false }
    const counts = await deliver([row('r1', ALLOWED)])
    expect(counts.skippedCount).toBe(1)
    expect(smsSend).not.toHaveBeenCalled()
    expect(patchOf('r1')).toMatchObject({ delivery_status: 'failed', error_message: SMS_ALLOWANCE_REACHED_MESSAGE })
  })

  it('no phone: not sent', async () => {
    const counts = await deliver([row('r1', null)])
    expect(counts.skippedCount).toBe(1)
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('a provider failure marks the row failed with a short code and no external_id', async () => {
    smsSend.mockResolvedValue(twilioError(400, 21606))
    const counts = await deliver([row('r1', ALLOWED)])
    expect(counts.failedCount).toBe(1)
    expect(patchOf('r1')).toMatchObject({ delivery_status: 'failed', error_message: 'Twilio error 21606' })
    expect(patchOf('r1').external_id).toBeUndefined()
  })
})

describe('resident notifications — consent and opt-out still gate the text', () => {
  const ASSOC = 'a0000000-0000-4000-8000-000000000001'
  const SECRET = 'svc-secret'

  async function setup(prefs: { sms: boolean; phones: string[] }) {
    vi.resetModules()
    const { runResidentNotification } = await import('./resident-notify/run')
    const { RESIDENT_NOTIFY_KEY, signResidentNotifySettings } = await import('./resident-notify/settings')
    const { sha256Hex } = await import('./sms-consent')
    const { residentNotifyDeps } = await import('./resident-notify/deps')
    const outcomes: Array<{ status: string; externalId?: string | null }> = []
    const store = {
      loadContext: async () => ({
        association: {
          id: ASSOC,
          name: 'Maple Creek',
          type: 'hoa',
          organizationId: 'org-1',
          complianceSettings: {
            [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(
              ASSOC,
              { decisionsAndReplies: true },
              { updatedAt: '2026-10-18T00:00:00Z', updatedBy: null },
              SECRET,
            ),
          },
        },
        // No email, so only the text path runs.
        resident: { userId: 'u-1', unitId: null, name: 'Dana', email: null, phone: ALLOWED },
        title: 'Fence',
      }),
      loadPreferences: async () => ({ email: false, sms: prefs.sms, smsPhones: new Set(prefs.phones.map(sha256Hex)) }),
      loadPhone: async () => null,
      orgSandbox: async () => false,
      claim: async () => ({ ok: true }),
      insertRecipient: async () => ({ id: '0f0f0f0f-0000-4000-8000-000000000001' }),
      markRecipient: async (_id: string, outcome: { status: string; externalId?: string | null }) => {
        outcomes.push(outcome)
      },
      finish: async () => {},
    }
    const quiet = { info: () => {}, warn: () => {}, error: () => {} }
    const event = { kind: 'ticket_reply' as const, ticketId: 't-1', messageId: 'm-1', reply: 'On it.' }
    const run = () => runResidentNotification(store as never, residentNotifyDeps, event, quiet)
    return { run, outcomes }
  }

  beforeEach(() => {
    stubEnv({ VERCEL_ENV: 'production', PAY_SETTINGS_SECRET: SECRET })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('opted in, consent covers the number: sent, and the message sid is the stored id', async () => {
    const { run, outcomes } = await setup({ sms: true, phones: [ALLOWED] })
    await run()
    expect(smsSend).toHaveBeenCalledTimes(1)
    expect(outcomes).toEqual([expect.objectContaining({ status: 'sent', externalId: UUID })])
  })

  it('consent does not cover this number: no text', async () => {
    const { run } = await setup({ sms: true, phones: [OTHER] })
    await run()
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('opted out of texts: no text', async () => {
    const { run } = await setup({ sms: false, phones: [ALLOWED] })
    await run()
    expect(smsSend).not.toHaveBeenCalled()
  })
})
