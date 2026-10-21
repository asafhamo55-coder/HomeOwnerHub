import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runResidentNotification, type NotifyContext, type ResidentNotifyStore } from './run'
import { RESIDENT_NOTIFY_KEY, signResidentNotifySettings } from './settings'
import { sha256Hex } from '@/lib/sms-consent'

/**
 * BL-082 × BL-004, end to end in the app: the deps the resident
 * notification runs with — the app's REAL sendEmail / sendSms, providers
 * mocked — must deliver nothing to a non-allowlisted resident outside
 * production or for a sandbox org. Nothing here reaches a real provider.
 */

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))
const smsSend = vi.fn()
vi.mock('@vonage/server-sdk', () => ({
  Vonage: class {
    messages = { send: smsSend }
  },
}))

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const RESIDENT = 'dana@resident.example'
const ALLOWED = 'treasurer@example.test'
const SECRET = 'svc-secret'

async function freshDeps() {
  vi.resetModules()
  return (await import('./deps')).residentNotifyDeps
}

function ctx(email: string): NotifyContext {
  return {
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
    resident: { userId: 'u-1', unitId: null, name: 'Dana', email, phone: '+14045559999' },
    title: 'Fence',
  }
}

function store(sandbox: boolean, email: string, sms = false) {
  const statuses: string[] = []
  const s: ResidentNotifyStore = {
    loadContext: async () => ctx(email),
    // BL-111: consent covers the resident's number.
    loadPreferences: async () => ({ email: true, sms, smsPhones: new Set([sha256Hex('+14045559999')]) }),
    loadPhone: async () => null,
    orgSandbox: async () => sandbox,
    claim: async () => ({ ok: true }),
    insertRecipient: async () => ({ id: '0f0f0f0f-0000-4000-8000-000000000001' }),
    markRecipient: async (_id, outcome) => {
      statuses.push(outcome.status)
    },
    finish: async () => {},
  }
  return { s, statuses }
}

const quiet = { info: () => {}, warn: () => {}, error: () => {} }
const event = { kind: 'ticket_reply' as const, ticketId: 't-1', messageId: 'm-1', reply: 'On it.' }

describe('residentNotifyDeps — the guarded senders the notification runs with', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
    smsSend.mockReset()
    smsSend.mockResolvedValue({ messageUUID: 'sid' })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'HomeownerHub <noreply@example.test>')
    vi.stubEnv('VONAGE_API_KEY', 'k')
    vi.stubEnv('VONAGE_API_SECRET', 's')
    vi.stubEnv('VONAGE_FROM_NUMBER', '14045550000')
    vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
    vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('outside production, a non-allowlisted resident gets nothing — email or text', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const deps = await freshDeps()
    const { s, statuses } = store(false, RESIDENT, true)
    const r = await runResidentNotification(s, deps, event, quiet)
    expect(send).not.toHaveBeenCalled()
    expect(smsSend).not.toHaveBeenCalled()
    expect(statuses).toEqual(['suppressed', 'suppressed'])
    // Held by the guard, not a failure (BL-109).
    expect(r.status).toBe('held')
  })

  it('a sandbox org in production sends nothing to a non-allowlisted resident', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s, statuses } = store(true, RESIDENT)
    await runResidentNotification(s, deps, event, quiet)
    expect(send).not.toHaveBeenCalled()
    expect(statuses).toEqual(['suppressed'])
  })

  it('reaches an allowlisted address as the association, threaded to the recipient row', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s, statuses } = store(true, ALLOWED)
    const r = await runResidentNotification(s, deps, event, quiet)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ to: ALLOWED, from: '"Maple Creek HOA" <noreply@example.test>' })
    expect(send.mock.calls[0][0].headers['Message-ID']).toContain('0f0f0f0f-0000-4000-8000-000000000001')
    expect(statuses).toEqual(['sent'])
    expect(r.status).toBe('sent')
  })

  it('reads the signed setting with the same secret Settings signs it with', async () => {
    vi.stubEnv('PAY_SETTINGS_SECRET', 'a-different-secret')
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s } = store(false, ALLOWED)
    expect((await runResidentNotification(s, deps, event, quiet)).status).toBe('off')
    expect(send).not.toHaveBeenCalled()
  })

  it('reports email / SMS as unconfigured without their keys', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('VONAGE_FROM_NUMBER', '')
    const deps = await freshDeps()
    expect(deps.emailConfigured()).toBe(false)
    expect(deps.smsConfigured()).toBe(false)
  })
})
