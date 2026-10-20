import { describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'
import { signVendorInsuranceSettings, withVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import {
  COI_REQUEST_ERRORS,
  CoiRequestInput,
  buildCoiRequestDraft,
  sendCoiRequestCore,
  type CoiRecipientOutcome,
  type CoiRequestStore,
  type CoiSender,
} from './core'

/**
 * BL-083 "Request updated certificate": the only path by which a COI email
 * reaches a vendor, and only on an explicit board click. In-memory store,
 * fake sender — no database, no provider, no real email.
 */

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const VENDOR_EMAIL = 'office@acme-roofing.example'
const SECRET = 'test-secret'

function memoryStore(over: Partial<{ email: string | null; vendor: boolean; expiresOn: string | null; settings: unknown }> = {}) {
  const recorded: Array<Record<string, unknown>> = []
  const marks: CoiRecipientOutcome[] = []
  const finished: string[] = []
  const store: CoiRequestStore = {
    loadVendor: async (id) =>
      over.vendor === false
        ? null
        : { id, legalName: 'Acme Roofing LLC', primaryEmail: over.email === undefined ? VENDOR_EMAIL : over.email },
    loadAssociation: async () => ({ id: ASSOC, name: 'Maple Court HOA', complianceSettings: over.settings ?? {}, today: '2026-10-20' }),
    loadCoiExpiration: async () => (over.expiresOn === undefined ? '2026-10-15' : over.expiresOn),
    orgSandbox: async () => false,
    record: async (r) => {
      recorded.push(r)
      return { communicationId: 'comm-1', recipientId: 'rec-1' }
    },
    markRecipient: async (_id, o) => {
      marks.push(o)
    },
    finish: async (_id, status) => {
      finished.push(status)
    },
  }
  return { store, recorded, marks, finished }
}

const log = () => ({ error: vi.fn() })
const okSender = () => vi.fn<CoiSender>(async () => ({ ok: true as const, messageId: 'm-1' }))
const input = (over: Partial<{ subject: string; body: string }> = {}) => ({
  vendorId: VENDOR_ID,
  subject: 'Updated certificate of insurance for Maple Court HOA',
  body: 'Hello Acme,\n\nPlease send your updated certificate.',
  ...over,
})

describe('buildCoiRequestDraft', () => {
  it('drafts from the vendor and association, with the board’s minimums, and states expiry', async () => {
    process.env.PAY_SETTINGS_SECRET = SECRET
    const settings = withVendorInsuranceSettings(
      {},
      signVendorInsuranceSettings(
        ASSOC,
        {
          coiRemindersEnabled: true,
          minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: null, workersCompRequired: true, autoLiabilityMin: null, umbrellaMin: 2_000_000 },
        },
        { updatedAt: '2026-10-01T00:00:00Z', updatedBy: null },
        SECRET,
      ),
    )
    const m = memoryStore({ settings })
    const r = await buildCoiRequestDraft(m.store, VENDOR_ID, log())
    delete process.env.PAY_SETTINGS_SECRET
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toMatchObject({ to: VENDOR_EMAIL, state: 'expired', daysLeft: -5, expiresOn: '2026-10-15' })
    expect(r.data.subject).toBe('Updated certificate of insurance for Maple Court HOA')
    expect(r.data.body).toContain('expired on October 15, 2026')
    expect(r.data.body).toContain('General liability: $1,000,000 per occurrence')
    expect(r.data.body).toContain('Umbrella / excess liability: $2,000,000')
  })

  it('expiring within 30 days, and a vendor with no certificate on file', async () => {
    const soon = await buildCoiRequestDraft(memoryStore({ expiresOn: '2026-11-10' }).store, VENDOR_ID, log())
    expect(soon.ok && soon.data.state).toBe('expiring')
    const none = await buildCoiRequestDraft(memoryStore({ expiresOn: null }).store, VENDOR_ID, log())
    expect(none.ok && none.data.state).toBeNull()
    expect(none.ok && none.data.body).toContain('does not have a current certificate of insurance on file')
  })

  it('an unknown vendor is not_found; a failed read is failed and logs no name', async () => {
    expect(await buildCoiRequestDraft(memoryStore({ vendor: false }).store, VENDOR_ID, log())).toEqual({ ok: false, reason: 'not_found' })
    const m = memoryStore()
    m.store.loadCoiExpiration = async () => {
      throw new Error('boom')
    }
    const l = log()
    expect(await buildCoiRequestDraft(m.store, VENDOR_ID, l)).toEqual({ ok: false, reason: 'failed' })
    expect(JSON.stringify(l.error.mock.calls)).not.toContain('Acme')
  })
})

describe('sendCoiRequestCore', () => {
  it('sends the board’s reviewed text to the vendor’s address ON FILE, as the association, threaded', async () => {
    const m = memoryStore()
    const send = okSender()
    const r = await sendCoiRequestCore(m.store, send, input(), log())
    expect(r).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(1)
    const [email, opts] = send.mock.calls[0]
    expect(email).toMatchObject({
      to: VENDOR_EMAIL,
      subject: 'Updated certificate of insurance for Maple Court HOA',
      text: 'Hello Acme,\n\nPlease send your updated certificate.',
      senderName: 'Maple Court HOA',
      recipientRef: 'rec-1',
    })
    expect(email.html).toContain('<p>Hello Acme,</p>')
    expect(opts).toEqual({ orgSandbox: false, ref: 'comm-1' })
    expect(m.recorded[0]).toMatchObject({ to: VENDOR_EMAIL, vendorId: VENDOR_ID, associationId: ASSOC })
    expect(m.marks).toEqual([{ status: 'sent', externalId: 'm-1' }])
    expect(m.finished).toEqual(['sent'])
  })

  it('the recipient cannot be chosen by the caller: extra fields are stripped by the schema', () => {
    const parsed = CoiRequestInput.parse({ ...input(), to: 'resident@gmail.com' })
    expect(parsed).not.toHaveProperty('to')
  })

  it('escapes the board’s text in the HTML part', async () => {
    const send = okSender()
    await sendCoiRequestCore(memoryStore().store, send, input({ body: '<script>x</script>' }), log())
    expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;')
    expect(send.mock.calls[0][0].html).not.toContain('<script>')
  })

  it('no email on file, or an unknown vendor: nothing recorded, nothing sent', async () => {
    for (const [over, error] of [
      [{ email: null }, COI_REQUEST_ERRORS.noEmail],
      [{ email: '  ' }, COI_REQUEST_ERRORS.noEmail],
      [{ vendor: false }, COI_REQUEST_ERRORS.notFound],
    ] as const) {
      const m = memoryStore(over)
      const send = okSender()
      expect(await sendCoiRequestCore(m.store, send, input(), log())).toEqual({ ok: false, error })
      expect(send).not.toHaveBeenCalled()
      expect(m.recorded).toHaveLength(0)
    }
  })

  it('the outbound guard blocking it is reported as suppressed, not sent', async () => {
    const m = memoryStore()
    const send = vi.fn<CoiSender>(async () => ({ ok: false as const, error: OUTBOUND_BLOCKED_ERROR }))
    const r = await sendCoiRequestCore(m.store, send, input(), log())
    expect(r).toEqual({ ok: false, error: COI_REQUEST_ERRORS.blocked })
    expect(m.marks[0].status).toBe('suppressed')
    expect(m.finished).toEqual(['failed'])
  })

  it('a provider failure: generic message to the board, ids-only log, raw text only on the recipient row', async () => {
    const m = memoryStore()
    const l = log()
    const send = vi.fn<CoiSender>(async () => ({ ok: false as const, error: `rejected ${VENDOR_EMAIL}` }))
    const r = await sendCoiRequestCore(m.store, send, input(), l)
    expect(r).toEqual({ ok: false, error: COI_REQUEST_ERRORS.sendFailed })
    expect(m.marks[0]).toMatchObject({ status: 'failed' })
    const logged = JSON.stringify(l.error.mock.calls)
    expect(logged).not.toContain(VENDOR_EMAIL)
    expect(logged).not.toContain('Acme')
    expect(logged).toContain('comm-1')
  })

  it('a failed record write stops before any send', async () => {
    const m = memoryStore()
    m.store.record = async () => {
      throw new Error('vendor-coi-request: communication insert (42501)')
    }
    const send = okSender()
    expect(await sendCoiRequestCore(m.store, send, input(), log())).toEqual({ ok: false, error: COI_REQUEST_ERRORS.failed })
    expect(send).not.toHaveBeenCalled()
  })

  it('a bookkeeping failure after a successful send still reports success (no double email on retry)', async () => {
    const m = memoryStore()
    m.store.finish = async () => {
      throw new Error('x')
    }
    expect(await sendCoiRequestCore(m.store, okSender(), input(), log())).toEqual({ ok: true })
  })
})

describe('CoiRequestInput', () => {
  it('bounds subject and body and requires a uuid', () => {
    expect(CoiRequestInput.safeParse({ ...input(), vendorId: 'nope' }).success).toBe(false)
    expect(CoiRequestInput.safeParse(input({ subject: '   ' })).success).toBe(false)
    expect(CoiRequestInput.safeParse(input({ subject: 'x'.repeat(201) })).success).toBe(false)
    expect(CoiRequestInput.safeParse(input({ body: 'x'.repeat(5001) })).success).toBe(false)
  })
})
