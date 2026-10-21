import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import {
  RECEIPT_PORTAL_PATH,
  receiptCommunicationId,
  runPaymentReceipt,
  type PaymentReceiptDeps,
  type PaymentReceiptEvent,
  type PaymentReceiptStore,
  type ReceiptContext,
  type ReceiptOwner,
} from './receipt-run'
import { PAYMENT_RECEIPTS_KEY, signPaymentReceiptSettings } from './receipt-settings'
import { RESIDENT_NOTIFY_KEY, signResidentNotifySettings } from './settings'

const ASSOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG = 'bbbbbbbb-0000-4000-8000-000000000002'
const PAYMENT = 'cccccccc-0000-4000-8000-000000000003'
const UNIT = 'dddddddd-0000-4000-8000-000000000004'
const OWNER = 'eeeeeeee-0000-4000-8000-000000000005'
const CO_OWNER = 'ffffffff-0000-4000-8000-000000000006'
const SECRET = 'secret'

function receiptsSetting(on: boolean, secret = SECRET) {
  return {
    [PAYMENT_RECEIPTS_KEY]: signPaymentReceiptSettings(
      ASSOC,
      { emailOnRecord: on },
      { updatedAt: '2026-10-20T00:00:00Z', updatedBy: null },
      secret,
    ),
  }
}

const dana: ReceiptOwner = { userId: OWNER, name: 'Dana Smith', email: 'dana@example.test' }
const lee: ReceiptOwner = { userId: CO_OWNER, name: 'Lee Smith', email: 'lee@example.test' }

function context(complianceSettings: unknown, owners: ReceiptOwner[] = [dana]): ReceiptContext {
  return {
    association: { id: ASSOC, name: 'Maple Court', type: 'hoa', organizationId: ORG, complianceSettings },
    payment: { id: PAYMENT, amount: 250, paidDay: '2026-10-20', method: 'check', unitId: UNIT },
    propertyLabel: '12 Oak St · Unit 4',
    balance: 125.5,
    owners,
  }
}

function fakeStore(ctx: ReceiptContext | null, optedOut: string[] = []) {
  const claimed = new Map<string, unknown>()
  const recipients: Array<{ id: string; email: string; status?: string }> = []
  const finished: Array<[string, string]> = []
  const store: PaymentReceiptStore = {
    loadContext: vi.fn(async () => ctx),
    emailOptIn: vi.fn(async (_org, userId) => !optedOut.includes(userId)),
    orgSandbox: vi.fn(async () => true),
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
  }
  return { store, claimed, recipients, finished }
}

function deps(over: Partial<PaymentReceiptDeps> = {}): PaymentReceiptDeps {
  return {
    // A fake: no test here can reach a real transport.
    sendEmail: vi.fn(async () => ({ ok: true as const, messageId: 'm1' })),
    emailConfigured: () => true,
    settingsSecret: () => SECRET,
    portalUrl: (p: string) => `https://app.test${p}`,
    ...over,
  }
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

const auto: PaymentReceiptEvent = { paymentId: PAYMENT, trigger: 'auto', associationId: ASSOC }
const manual: PaymentReceiptEvent = { paymentId: PAYMENT, trigger: 'manual', associationId: ASSOC }

describe('runPaymentReceipt — automatic (board recorded a payment)', () => {
  it('default OFF: nothing saved sends nothing and claims nothing', async () => {
    const { store } = fakeStore(context({}))
    const d = deps()
    const r = await runPaymentReceipt(store, d, auto, logger())
    expect(r.status).toBe('off')
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('saved OFF sends nothing', async () => {
    const { store } = fakeStore(context(receiptsSetting(false)))
    const d = deps()
    expect((await runPaymentReceipt(store, d, auto, logger())).status).toBe('off')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a value not signed with the server secret reads as OFF', async () => {
    const { store } = fakeStore(context(receiptsSetting(true, 'attacker-secret')))
    const d = deps()
    expect((await runPaymentReceipt(store, d, auto, logger())).status).toBe('off')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('the BL-082 decisions/replies switch does not turn receipts on', async () => {
    const other = {
      [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(
        ASSOC,
        { decisionsAndReplies: true },
        { updatedAt: '2026-10-20T00:00:00Z', updatedBy: null },
        SECRET,
      ),
    }
    const { store } = fakeStore(context(other))
    expect((await runPaymentReceipt(store, deps(), auto, logger())).status).toBe('off')
  })

  it('opted in: emails the owner once through the guarded sender, with the sandbox flag and the communication id', async () => {
    const { store, recipients, finished, claimed } = fakeStore(context(receiptsSetting(true)))
    const d = deps()
    const r = await runPaymentReceipt(store, d, auto, logger())
    const id = receiptCommunicationId(PAYMENT, 'auto')
    expect(r).toMatchObject({ status: 'sent', communicationId: id, sent: 1, failed: 0, held: 0 })
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    const [input, opts] = vi.mocked(d.sendEmail).mock.calls[0]!
    expect(input.to).toBe('dana@example.test')
    expect(input.recipientRef).toBe('r1')
    expect(opts).toEqual({ orgSandbox: true, ref: id })
    expect(recipients).toEqual([{ id: 'r1', email: 'dana@example.test', status: 'sent' }])
    expect(finished).toEqual([[id, 'sent']])
    expect(claimed.get(id)).toMatchObject({ paymentId: PAYMENT, unitId: UNIT, trigger: 'auto', recipientCount: 1 })
  })

  it('once per payment: a second run for the same payment sends nothing', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)))
    const d = deps()
    await runPaymentReceipt(store, d, auto, logger())
    const again = await runPaymentReceipt(store, d, auto, logger())
    expect(again.status).toBe('already_sent')
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('the receipt carries association, amount, date, method, balance and the portal ledger link — nothing else', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)))
    const d = deps()
    await runPaymentReceipt(store, d, auto, logger())
    const [input] = vi.mocked(d.sendEmail).mock.calls[0]!
    expect(input.subject).toBe('Payment received: $250.00')
    for (const part of ['Maple Court', '$250.00', 'Oct 20, 2026', 'Check', '$125.50', `https://app.test${RECEIPT_PORTAL_PATH}`]) {
      expect(input.text).toContain(part)
      expect(input.html).toContain(part)
    }
    // No internal ids in what the owner reads.
    expect(input.text).not.toContain(PAYMENT)
    expect(input.text).not.toContain(UNIT)
  })

  it('co-owners each get their own email; one owner never sees another’s address', async () => {
    const { store } = fakeStore(context(receiptsSetting(true), [dana, lee, { ...dana, email: 'DANA@example.test' }]))
    const d = deps()
    const r = await runPaymentReceipt(store, d, auto, logger())
    expect(r.sent).toBe(2)
    const calls = vi.mocked(d.sendEmail).mock.calls
    expect(calls.map(([i]) => i.to)).toEqual(['dana@example.test', 'lee@example.test'])
    for (const [i] of calls) {
      expect(i.text).not.toContain('example.test')
      expect(i.html).not.toContain('example.test')
      expect(i.text).not.toContain('Lee')
      expect(i.text).not.toContain('Dana')
    }
  })

  it('respects email preferences: an owner who turned off email is skipped', async () => {
    const { store } = fakeStore(context(receiptsSetting(true), [dana, lee]), [OWNER])
    const d = deps()
    const r = await runPaymentReceipt(store, d, auto, logger())
    expect(r).toMatchObject({ status: 'sent', sent: 1, optedOut: 1 })
    expect(vi.mocked(d.sendEmail).mock.calls.map(([i]) => i.to)).toEqual(['lee@example.test'])
  })

  it('every owner opted out: opted_out, nothing claimed or sent', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)), [OWNER])
    const d = deps()
    expect((await runPaymentReceipt(store, d, auto, logger())).status).toBe('opted_out')
    expect(store.claim).not.toHaveBeenCalled()
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('an owner with no portal account (no preferences row) gets the receipt', async () => {
    const { store } = fakeStore(context(receiptsSetting(true), [{ userId: null, name: null, email: 'pat@example.test' }]))
    const d = deps()
    expect((await runPaymentReceipt(store, d, auto, logger())).status).toBe('sent')
    expect(store.emailOptIn).not.toHaveBeenCalled()
  })

  it('no owner email on file: no_contact, nothing claimed', async () => {
    const { store } = fakeStore(context(receiptsSetting(true), [{ userId: OWNER, name: 'Dana', email: '  ' }]))
    expect((await runPaymentReceipt(store, deps(), auto, logger())).status).toBe('no_contact')
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('guard hold reads as held, recorded suppressed, finished cancelled — not failed', async () => {
    const { store, recipients, finished } = fakeStore(context(receiptsSetting(true)))
    const d = deps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR })) })
    const r = await runPaymentReceipt(store, d, auto, logger())
    expect(r).toMatchObject({ status: 'held', sent: 0, failed: 0, held: 1 })
    expect(recipients[0]!.status).toBe('suppressed')
    expect(finished).toEqual([[receiptCommunicationId(PAYMENT, 'auto'), 'cancelled']])
  })

  it('a provider failure is failed, never thrown', async () => {
    const { store, finished } = fakeStore(context(receiptsSetting(true)))
    const d = deps({ sendEmail: vi.fn(async () => { throw new Error('boom dana@example.test') }) })
    const log = logger()
    const r = await runPaymentReceipt(store, d, auto, log)
    expect(r.status).toBe('failed')
    expect(finished[0]![1]).toBe('failed')
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])).not.toContain('example.test')
  })

  it('email not configured: nothing claimed (the transport would fake success)', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)))
    const r = await runPaymentReceipt(store, deps({ emailConfigured: () => false }), auto, logger())
    expect(r.status).toBe('email_not_configured')
    expect(store.claim).not.toHaveBeenCalled()
  })

  it('a payment outside the caller’s association is not found', async () => {
    const ctx = context(receiptsSetting(true))
    ctx.association.id = '99999999-0000-4000-8000-000000000009'
    const { store } = fakeStore(ctx)
    const d = deps()
    expect((await runPaymentReceipt(store, d, auto, logger())).status).toBe('not_found')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a store error is failed, and logs carry ids and counts only', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)))
    vi.mocked(store.loadContext).mockRejectedValueOnce(new Error('payment-receipt: payment read failed (42501)'))
    const log = logger()
    expect((await runPaymentReceipt(store, deps(), auto, log)).status).toBe('failed')
  })

  it('success logs never carry an address, a name or an amount', async () => {
    const { store } = fakeStore(context(receiptsSetting(true), [dana, lee]))
    const log = logger()
    await runPaymentReceipt(store, deps(), auto, log)
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])
    for (const pii of ['example.test', 'Dana', 'Lee', '250', 'Oak St']) expect(logged).not.toContain(pii)
  })
})

describe('runPaymentReceipt — board clicked Send receipt', () => {
  it('works with the setting off (never saved)', async () => {
    const { store } = fakeStore(context({}))
    const d = deps()
    const r = await runPaymentReceipt(store, d, manual, logger())
    expect(r.status).toBe('sent')
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('works with the setting saved off', async () => {
    const { store } = fakeStore(context(receiptsSetting(false)))
    expect((await runPaymentReceipt(store, deps(), manual, logger())).status).toBe('sent')
  })

  it('still respects the owner’s email opt-out', async () => {
    const { store } = fakeStore(context({}), [OWNER])
    const d = deps()
    expect((await runPaymentReceipt(store, d, manual, logger())).status).toBe('opted_out')
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('is its own receipt: an automatic one already sent does not block it; a double click sends once', async () => {
    const { store } = fakeStore(context(receiptsSetting(true)))
    const d = deps()
    await runPaymentReceipt(store, d, auto, logger())
    expect((await runPaymentReceipt(store, d, manual, logger())).status).toBe('sent')
    expect((await runPaymentReceipt(store, d, manual, logger())).status).toBe('already_sent')
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
    expect(receiptCommunicationId(PAYMENT, 'manual')).not.toBe(receiptCommunicationId(PAYMENT, 'auto'))
  })
})
