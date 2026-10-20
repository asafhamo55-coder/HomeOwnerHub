import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  notificationCommunicationId,
  runResidentNotification,
  type NotifyContext,
  type ResidentNotifyDeps,
  type ResidentNotifyEvent,
  type ResidentNotifyStore,
} from './run'
import { sha256Hex } from '@/lib/sms-consent'
import { RESIDENT_NOTIFY_KEY, signResidentNotifySettings } from './settings'

const ASSOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG = 'bbbbbbbb-0000-4000-8000-000000000002'
const ARC = 'cccccccc-0000-4000-8000-000000000003'
const TICKET = 'dddddddd-0000-4000-8000-000000000004'
const MSG = 'eeeeeeee-0000-4000-8000-000000000005'
const USER = 'ffffffff-0000-4000-8000-000000000006'
const SECRET = 'secret'

function settings(on: boolean) {
  return {
    [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(
      ASSOC,
      { decisionsAndReplies: on },
      { updatedAt: '2026-10-18T00:00:00Z', updatedBy: null },
      SECRET,
    ),
  }
}

function context(over: Partial<NotifyContext['resident']> = {}, on = true): NotifyContext {
  return {
    association: { id: ASSOC, name: 'Maple Court', type: 'hoa', organizationId: ORG, complianceSettings: settings(on) },
    resident: { userId: USER, unitId: null, name: 'Dana Smith', email: 'dana@example.test', phone: null, ...over },
    title: 'Repaint front door',
  }
}

/** BL-111: the test number's consent hash — a text needs it in smsPhones. */
const CONSENTED = new Set([sha256Hex('+14045551234')])

function fakeStore(
  ctx: NotifyContext | null,
  given: { email: boolean; sms: boolean; smsPhones?: ReadonlySet<string> } = { email: true, sms: false },
  phone: string | null = null,
) {
  // Texts on with no explicit consent set: consent covers the test number.
  const prefs = given.sms && !('smsPhones' in given) ? { ...given, smsPhones: CONSENTED } : given
  const claimed = new Set<string>()
  const recipients: Array<{ id: string; channel: string; status?: string }> = []
  const finished: Array<[string, string]> = []
  const store: ResidentNotifyStore = {
    loadContext: vi.fn(async () => ctx),
    loadPreferences: vi.fn(async () => prefs),
    loadPhone: vi.fn(async () => phone),
    orgSandbox: vi.fn(async () => false),
    claim: vi.fn(async (c) => {
      if (claimed.has(c.id)) return { ok: false as const, reason: 'exists' as const }
      claimed.add(c.id)
      return { ok: true as const }
    }),
    insertRecipient: vi.fn(async (_c, _o, r) => {
      const id = `r${recipients.length + 1}`
      recipients.push({ id, channel: r.channel })
      return { id }
    }),
    markRecipient: vi.fn(async (id, outcome) => {
      const row = recipients.find((r) => r.id === id)!
      row.status = outcome.status
    }),
    finish: vi.fn(async (id, status) => {
      finished.push([id, status])
    }),
  }
  return { store, claimed, recipients, finished }
}

function deps(over: Partial<ResidentNotifyDeps> = {}): ResidentNotifyDeps {
  return {
    sendEmail: vi.fn(async () => ({ ok: true as const, messageId: 'm1' })),
    sendSms: vi.fn(async () => ({ ok: true as const, messageSid: 's1' })),
    emailConfigured: () => true,
    smsConfigured: () => true,
    settingsSecret: () => SECRET,
    portalUrl: (p: string) => `https://app.test${p}`,
    ...over,
  }
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const decision: ResidentNotifyEvent = { kind: 'arc_decision', arcId: ARC, decision: 'approved', letter: 'Approved as submitted.' }
const reply: ResidentNotifyEvent = { kind: 'ticket_reply', ticketId: TICKET, messageId: MSG, reply: 'On it.' }

describe('runResidentNotification', () => {
  it('setting OFF (the default): sends nothing and claims nothing', async () => {
    const { store } = fakeStore(context({}, false))
    const d = deps()
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r.status).toBe('off')
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('nothing saved at all reads as OFF', async () => {
    const ctx = context()
    ctx.association.complianceSettings = {}
    const { store } = fakeStore(ctx)
    expect((await runResidentNotification(store, deps(), decision, logger)).status).toBe('off')
  })

  it('ON: emails the resident the letter through the guarded sender, with the org sandbox flag and the communication id', async () => {
    const { store, recipients, finished } = fakeStore(context())
    const d = deps()
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r).toMatchObject({ status: 'sent', sent: 1, failed: 0 })
    const id = notificationCommunicationId(decision)
    expect(r.communicationId).toBe(id)
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    const [input, opts] = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(input).toMatchObject({ to: 'dana@example.test', subject: 'Your ARC application was approved', recipientRef: 'r1' })
    expect(input.text).toContain('Approved as submitted.')
    expect(input.text).toContain(`https://app.test/resident/arc/${ARC}`)
    expect(input.senderName).toBe('Maple Court HOA')
    expect(opts).toEqual({ orgSandbox: false, ref: id })
    expect(recipients).toEqual([{ id: 'r1', channel: 'email', status: 'sent' }])
    expect(finished).toEqual([[id, 'sent']])
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({ id, category: 'arc', organizationId: ORG, associationId: ASSOC }))
  })

  it('is idempotent per event: the same event a second time sends nothing', async () => {
    const { store } = fakeStore(context())
    const d = deps()
    await runResidentNotification(store, d, decision, logger)
    const again = await runResidentNotification(store, d, decision, logger)
    expect(again.status).toBe('already_sent')
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('the communication id is deterministic per event, and differs when the letter or decision does', () => {
    expect(notificationCommunicationId(decision)).toBe(notificationCommunicationId({ ...decision }))
    expect(notificationCommunicationId(decision)).not.toBe(notificationCommunicationId({ ...decision, letter: 'Different' }))
    expect(notificationCommunicationId(decision)).not.toBe(notificationCommunicationId({ ...decision, decision: 'denied' }))
    expect(notificationCommunicationId(reply)).not.toBe(notificationCommunicationId({ ...reply, messageId: ARC }))
    expect(notificationCommunicationId(reply)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('a ticket reply: short email with the reply and the request link', async () => {
    const { store } = fakeStore({ ...context(), title: 'Pool gate' })
    const d = deps()
    const r = await runResidentNotification(store, d, reply, logger)
    expect(r.status).toBe('sent')
    const [input] = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(input.subject).toBe('The board replied to your request')
    expect(input.text).toContain('On it.')
    expect(input.text).toContain(`https://app.test/resident/tickets/${TICKET}`)
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({ category: 'custom' }))
  })

  it('Request info: the board’s message, linking to the application', async () => {
    const { store } = fakeStore(context())
    const d = deps()
    await runResidentNotification(store, d, { kind: 'arc_info_request', arcId: ARC, messageId: MSG, message: 'Send a color sample.' }, logger)
    const [input] = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(input.subject).toBe('The board needs more information about your ARC application')
    expect(input.text).toContain('Send a color sample.')
  })

  it('resident opted out of email: nothing sent, nothing claimed', async () => {
    const { store } = fakeStore(context(), { email: false, sms: false })
    const d = deps()
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r.status).toBe('opted_out')
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('no email on file: no_contact', async () => {
    const { store } = fakeStore(context({ email: null }))
    expect((await runResidentNotification(store, deps(), decision, logger)).status).toBe('no_contact')
  })

  it('SMS only when the resident opted in AND SMS is configured, one text ≤279 characters', async () => {
    const withPhone = context({ phone: '+14045551234' })
    const off = fakeStore(withPhone, { email: true, sms: false })
    const d1 = deps()
    await runResidentNotification(off.store, d1, decision, logger)
    expect(d1.sendSms).not.toHaveBeenCalled()

    const notConfigured = fakeStore(withPhone, { email: true, sms: true })
    const d2 = deps({ smsConfigured: () => false })
    await runResidentNotification(notConfigured.store, d2, decision, logger)
    expect(d2.sendSms).not.toHaveBeenCalled()

    const on = fakeStore(withPhone, { email: true, sms: true })
    const d3 = deps()
    const r = await runResidentNotification(on.store, d3, { ...decision, letter: 'x'.repeat(900) }, logger)
    expect(r).toMatchObject({ status: 'sent', sent: 2 })
    const [sms, opts] = (d3.sendSms as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sms.to).toBe('+14045551234')
    expect(sms.body.length).toBeLessThanOrEqual(279)
    expect(opts.ref).toBe(r.communicationId)
    expect(on.recipients.map((x) => x.channel)).toEqual(['email', 'sms'])
  })

  it('looks the phone up only when a text could go out', async () => {
    const off = fakeStore(context(), { email: true, sms: false }, '+14045551234')
    await runResidentNotification(off.store, deps(), decision, logger)
    expect(off.store.loadPhone).not.toHaveBeenCalled()

    const on = fakeStore(context(), { email: true, sms: true }, '+14045551234')
    const d = deps()
    await runResidentNotification(on.store, d, decision, logger)
    expect(on.store.loadPhone).toHaveBeenCalledWith(USER, null)
    expect(d.sendSms).toHaveBeenCalledTimes(1)
  })

  it('BL-111: a number the consent does not cover is not texted (number changed / pre-consent opt-in)', async () => {
    for (const smsPhones of [new Set([sha256Hex('+14045550000')]), undefined]) {
      const { store } = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true, smsPhones })
      const d = deps()
      const r = await runResidentNotification(store, d, decision, logger)
      expect(d.sendSms).not.toHaveBeenCalled()
      expect(d.sendEmail).toHaveBeenCalledTimes(1)
      expect(r).toMatchObject({ status: 'sent', sent: 1 })
    }
  })

  it('SMS opt-in alone (email opted out) still texts', async () => {
    const { store } = fakeStore(context({ phone: '+14045551234' }), { email: false, sms: true })
    const d = deps()
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r.status).toBe('sent')
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(d.sendSms).toHaveBeenCalledTimes(1)
  })

  it('email not configured on the server: failed, and nothing claimed so the event is not burned', async () => {
    const { store } = fakeStore(context())
    const r = await runResidentNotification(store, deps({ emailConfigured: () => false }), decision, logger)
    expect(r.status).toBe('failed')
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('a provider failure is recorded on the row and reported as failed — never thrown', async () => {
    const { store, recipients, finished } = fakeStore(context())
    const d = deps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: 'Resend 500' })) })
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r).toMatchObject({ status: 'failed', sent: 0, failed: 1 })
    expect(recipients[0].status).toBe('failed')
    expect(finished[0][1]).toBe('failed')
  })

  it('BL-109: every channel held by the outbound guard — suppressed rows, cancelled (held) parent, never failed', async () => {
    const { store, recipients, finished } = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true })
    const d = deps({
      sendEmail: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })),
      sendSms: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })),
    })
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r).toMatchObject({ status: 'held', sent: 0, failed: 0, held: 2 })
    expect(recipients.map((x) => x.status)).toEqual(['suppressed', 'suppressed'])
    expect(finished[0][1]).toBe('cancelled')
  })

  it('BL-109: one channel held, one delivered — sent, with the held channel counted apart', async () => {
    const { store, recipients, finished } = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true })
    const d = deps({ sendSms: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })) })
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r).toMatchObject({ status: 'sent', sent: 1, failed: 0, held: 1 })
    expect(recipients.map((x) => x.status)).toEqual(['sent', 'suppressed'])
    expect(finished[0][1]).toBe('sent')
  })

  it('BL-109: held plus a real failure, nothing delivered — still failed', async () => {
    const { store, finished } = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true })
    const d = deps({
      sendEmail: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })),
      sendSms: vi.fn(async () => ({ ok: false as const, error: 'Twilio 500' })),
    })
    const r = await runResidentNotification(store, d, decision, logger)
    expect(r).toMatchObject({ status: 'failed', sent: 0, failed: 1, held: 1 })
    expect(finished[0][1]).toBe('failed')
  })

  it('a store or sender that throws becomes failed', async () => {
    const { store } = fakeStore(context())
    store.loadPreferences = vi.fn(async () => {
      throw new Error('boom dana@example.test')
    })
    const r = await runResidentNotification(store, deps(), decision, logger)
    expect(r.status).toBe('failed')

    const s2 = fakeStore(context())
    const r2 = await runResidentNotification(
      s2.store,
      deps({
        sendEmail: vi.fn(async () => {
          throw new Error('network')
        }),
      }),
      decision,
      logger,
    )
    expect(r2.status).toBe('failed')
    expect(s2.finished[0][1]).toBe('failed')
  })

  it('logs ids and counts only — never an address, name, subject or body', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const { store } = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true })
    store.loadPreferences = vi.fn(async () => {
      throw new Error('boom dana@example.test')
    })
    await runResidentNotification(store, deps(), decision, log)
    const s2 = fakeStore(context({ phone: '+14045551234' }), { email: true, sms: true })
    await runResidentNotification(s2.store, deps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: 'x' })) }), decision, log)
    const all = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    for (const pii of ['dana@example.test', 'Dana', 'Maple', '4045551234', 'Approved as submitted', 'Repaint']) {
      expect(all).not.toContain(pii)
    }
  })

  it('the application could not be loaded: failed', async () => {
    const { store } = fakeStore(null)
    expect((await runResidentNotification(store, deps(), decision, logger)).status).toBe('failed')
  })
})
