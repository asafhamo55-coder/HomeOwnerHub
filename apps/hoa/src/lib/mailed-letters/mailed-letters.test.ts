import { describe, expect, it, vi } from 'vitest'
import { createFakeMailProvider } from './fake-provider'
import { letterCostCents, formatCents, type MailPricing } from './cost'
import { toLobLetterBody, type MailLetterRequest } from './provider'
import { mailRecordFromProvider, trackingPatch } from './tracking'
import { clockStartOf } from '../collections/mail-tracking'

vi.mock('@homeowner-portal/db/m14', () => ({ M14_APPLIED: true }))
import { sendApprovedLetterByMail, previewCost, sourceId, type MailedLetterRow, type SendDeps, type SendInput } from './send'

const pricing: MailPricing = { baseCents: 100, colorCents: 20, extraPageCents: 10, certifiedCents: 700, certifiedReturnReceiptCents: 1000 }
const addr = { name: 'A', line1: '1 Main', city: 'Atlanta', state: 'GA', zip: '30303' }
const base: Omit<MailLetterRequest, 'idempotencyKey'> = { to: addr, from: addr, pdf: new Uint8Array([1]), pages: 2, color: false, service: 'certified' }

function setup(over: Partial<SendDeps> = {}) {
  const provider = createFakeMailProvider(pricing)
  const rows: MailedLetterRow[] = []
  const deps: SendDeps = {
    provider,
    pricing,
    alreadySent: async (src) => rows.some((r) => r.source.kind === src.kind && sourceId(r.source) === sourceId(src)),
    insert: async (r) => (rows.push(r), { ok: true }),
    log: () => {},
    ...over,
  }
  const input: SendInput = {
    letter: { organizationId: 'o', associationId: 'a', source: { kind: 'approval', approvalRequestId: 'r1' }, collectionCaseId: 'c', approved: true },
    request: base,
    confirmedCents: 100 + 10 + 700,
    confirmed: true,
    userId: 'u',
  }
  return { provider, rows, deps, input }
}

describe('cost', () => {
  it('adds up in integer cents', () => {
    expect(letterCostCents(pricing, { pages: 2, color: false, service: 'certified' })).toBe(810)
    expect(letterCostCents(pricing, { pages: 1, color: true, service: 'first_class' })).toBe(120)
    expect(letterCostCents(pricing, { pages: 3, color: true, service: 'certified_return_receipt' })).toBe(1140)
    expect(formatCents(810)).toBe('$8.10')
  })
  it('preview shows each line and the total', () => {
    const p = previewCost(pricing, { pages: 2, color: false, service: 'certified' })
    expect(p.lines.map((l) => l.cents)).toEqual([100, 10, 700])
    expect(p.totalLabel).toBe('$8.10')
  })
})

describe('sendApprovedLetterByMail', () => {
  it('sends once, stores cents and tracking, no address', async () => {
    const { provider, rows, deps, input } = setup()
    const r = await sendApprovedLetterByMail(deps, input)
    expect(r.ok).toBe(true)
    expect(provider.sent).toHaveLength(1)
    expect(rows[0]).toMatchObject({ quotedCents: 810, confirmedCents: 810, provider: 'fake', mailService: 'certified' })
    expect(JSON.stringify(rows[0])).not.toContain('Main')
    expect(rows[0].trackingNumber).toMatch(/^FAKE/)
  })
  it('refuses without an explicit confirmation', async () => {
    const { provider, deps, input } = setup()
    const r = await sendApprovedLetterByMail(deps, { ...input, confirmed: false })
    expect(r.ok).toBe(false)
    expect(provider.sent).toHaveLength(0)
  })
  it('refuses when the confirmed price is not the current price', async () => {
    const { provider, deps, input } = setup()
    const r = await sendApprovedLetterByMail(deps, { ...input, confirmedCents: 100 })
    expect(r.ok).toBe(false)
    expect(provider.sent).toHaveLength(0)
  })
  it('refuses an unapproved letter', async () => {
    const { provider, deps, input } = setup()
    const r = await sendApprovedLetterByMail(deps, { ...input, letter: { ...input.letter, approved: false } })
    expect(r.ok).toBe(false)
    expect(provider.sent).toHaveLength(0)
  })
  it('sends a violation notice under its violation id, with no collections case', async () => {
    const { provider, rows, deps, input } = setup()
    const violation = { ...input, letter: { ...input.letter, source: { kind: 'violation' as const, violationId: 'v1' }, collectionCaseId: null } }
    const r = await sendApprovedLetterByMail(deps, violation)
    expect(r.ok).toBe(true)
    expect(provider.sent).toHaveLength(1)
    expect(provider.sent[0]?.idempotencyKey).toBe('v1')
    expect(rows[0]).toMatchObject({ source: { kind: 'violation', violationId: 'v1' }, collectionCaseId: null })
  })
  it('never sends the same violation notice twice, and sending an approval does not block a violation', async () => {
    const { provider, deps, input } = setup()
    const violation = { ...input, letter: { ...input.letter, source: { kind: 'violation' as const, violationId: 'v1' }, collectionCaseId: null } }
    expect((await sendApprovedLetterByMail(deps, input)).ok).toBe(true)
    expect((await sendApprovedLetterByMail(deps, violation)).ok).toBe(true)
    expect((await sendApprovedLetterByMail(deps, violation)).ok).toBe(false)
    expect(provider.sent).toHaveLength(2)
  })
  it('refuses with no provider or no pricing', async () => {
    const a = setup({ provider: null })
    expect((await sendApprovedLetterByMail(a.deps, a.input)).ok).toBe(false)
    const b = setup({ pricing: null })
    expect((await sendApprovedLetterByMail(b.deps, b.input)).ok).toBe(false)
  })
  it('never sends the same approved letter twice', async () => {
    const { provider, deps, input } = setup()
    await sendApprovedLetterByMail(deps, input)
    const again = await sendApprovedLetterByMail(deps, input)
    expect(again.ok).toBe(false)
    expect(provider.sent).toHaveLength(1)
  })
  it('records nothing when the provider fails', async () => {
    const { provider, rows, deps, input } = setup()
    provider.failNextSend()
    const r = await sendApprovedLetterByMail(deps, input)
    expect(r.ok).toBe(false)
    expect(rows).toHaveLength(0)
  })
  it('warns not to resend when the record cannot be saved', async () => {
    const { deps, input } = setup({ insert: async () => ({ ok: false }) })
    const r = await sendApprovedLetterByMail(deps, input)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/Do not send it again/)
  })
})

describe('retries and charges', () => {
  it('a retry after a failed save records the same provider letter and charges once', async () => {
    let saveWorks = false
    const { provider, rows, deps, input } = setup({ insert: async (r) => (saveWorks ? (rows.push(r), { ok: true }) : { ok: false }) })
    expect((await sendApprovedLetterByMail(deps, input)).ok).toBe(false)
    saveWorks = true
    expect((await sendApprovedLetterByMail(deps, input)).ok).toBe(true)
    expect(provider.sent).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })
  it('logs, by id only, when the provider charged a different amount than the board confirmed', async () => {
    const log = vi.fn()
    const { provider, deps, input } = setup({ log })
    const real = provider.send.bind(provider)
    provider.send = async (req) => ({ ...(await real(req)), chargedCents: 999 })
    const r = await sendApprovedLetterByMail(deps, input)
    expect(r.ok).toBe(true)
    const call = log.mock.calls.find(([m]) => String(m).includes('charge differs'))
    expect(call).toBeTruthy()
    expect(JSON.stringify(call)).not.toContain('Main')
  })
})

describe('tracking and Lob shape', () => {
  it('a later answer with no date never erases a date already saved', () => {
    expect(trackingPatch({ status: 'in_transit', trackingNumber: null, mailedOn: null, deliveredOn: null })).toEqual({ status: 'in_transit' })
    expect(trackingPatch({ status: 'delivered', trackingNumber: 'T1', mailedOn: '2026-11-02', deliveredOn: '2026-11-06' })).toEqual({
      status: 'delivered',
      tracking_number: 'T1',
      mailed_on: '2026-11-02',
      delivered_on: '2026-11-06',
    })
  })
  it('delivered certified mail starts the statutory clock, first class does not', () => {
    const u = { status: 'delivered' as const, trackingNumber: 'T1', mailedOn: '2026-11-02', deliveredOn: '2026-11-06' }
    expect(clockStartOf(mailRecordFromProvider('certified', u))).toBe('2026-11-06')
    expect(clockStartOf(mailRecordFromProvider('first_class', u))).toBeNull()
  })
  it('maps to a Lob letter body', () => {
    const b = toLobLetterBody({ ...base, idempotencyKey: 'k' }, 'https://example.test/l.pdf')
    expect(b).toMatchObject({ mail_type: 'usps_first_class', extra_service: 'certified', color: false })
    expect(b.to.address_zip).toBe('30303')
  })
})
