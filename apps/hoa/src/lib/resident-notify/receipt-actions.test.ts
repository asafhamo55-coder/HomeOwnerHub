import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-114: the board actions for payment receipts. Every one is a public
// POST endpoint, so each must refuse a non-board caller before reading or
// sending anything. The send itself is faked: no test reaches a transport.

const ORG = 'org-1'
const A1 = '11111111-1111-4111-8111-111111111111'
const PAYMENT = '22222222-2222-4222-8222-222222222222'

type Row = { id: string; name: string; organization_id: string; compliance_settings: Record<string, unknown> }

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Array<Record<string, unknown>>,
  gateOk: true,
  reads: 0,
  sendResult: { status: 'sent', communicationId: 'c1', sent: 1, failed: 0, held: 0, optedOut: 0 } as Record<string, unknown>,
}))

const sendNow = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => h.sendResult))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => (h.gateOk ? { ok: true } : { ok: false, error: 'denied' })),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG })) }))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('./receipt-notify', () => ({ sendPaymentReceiptNow: sendNow }))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_what: string, q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q
    return r.error ? { ok: false } : { ok: true, data: r.data }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'board-1' } } }) },
    from: () => {
      h.reads += 1
      const filters: Array<[string, unknown]> = []
      let update: Record<string, unknown> | null = null
      const match = () => h.rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        update: (v: { compliance_settings: Record<string, unknown> }) => ((update = v.compliance_settings), q),
        then: (resolve: (v: unknown) => unknown) => {
          const hit = match()
          if (update) {
            for (const r of hit) {
              r.compliance_settings = update
              h.updates.push(update)
            }
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve)
          }
          return Promise.resolve({ data: hit.map(({ organization_id: _o, ...r }) => r), error: null }).then(resolve)
        },
      }
      return q
    },
  }),
}))

const { getBoardPaymentReceiptSettings, savePaymentReceiptSettings, sendPaymentReceipt } = await import('./receipt-actions')
const { paymentReceiptsOn } = await import('./receipt-settings')

beforeEach(() => {
  h.gateOk = true
  h.updates = []
  h.reads = 0
  h.sendResult = { status: 'sent', communicationId: 'c1', sent: 1, failed: 0, held: 0, optedOut: 0 }
  sendNow.mockClear()
  h.rows = [{ id: A1, name: 'Alpha', organization_id: ORG, compliance_settings: { pay_by_zelle: { keep: 1 } } }]
})

describe('payment receipt board actions (BL-114)', () => {
  it('reads OFF when nothing was ever saved', async () => {
    const r = await getBoardPaymentReceiptSettings()
    expect(r).toMatchObject({ ok: true, data: { state: 'not_configured', on: false } })
  })

  it('saving ON signs it, keeps the other keys, and the send path then reads ON', async () => {
    expect(await savePaymentReceiptSettings({ on: true })).toEqual({ ok: true })
    const cs = h.rows[0]!.compliance_settings
    expect(cs.pay_by_zelle).toEqual({ keep: 1 })
    expect(paymentReceiptsOn(A1, cs, 'test-secret')).toBe(true)
    expect((await getBoardPaymentReceiptSettings()).ok && (await getBoardPaymentReceiptSettings())).toMatchObject({
      data: { on: true },
    })
  })

  it('rejects a non-boolean', async () => {
    expect(await savePaymentReceiptSettings({ on: 'yes' as unknown as boolean })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(h.updates).toEqual([])
  })

  describe('gate: a non-board caller is refused before anything is read, written or sent', () => {
    beforeEach(() => {
      h.gateOk = false
    })
    it('get', async () => {
      expect(await getBoardPaymentReceiptSettings()).toEqual({ ok: false, reason: 'forbidden' })
      expect(h.reads).toBe(0)
    })
    it('save', async () => {
      expect(await savePaymentReceiptSettings({ on: true })).toEqual({ ok: false, error: 'denied' })
      expect(h.reads).toBe(0)
      expect(h.updates).toEqual([])
    })
    it('send receipt', async () => {
      expect(await sendPaymentReceipt({ paymentId: PAYMENT })).toMatchObject({ ok: false, status: 'forbidden' })
      expect(sendNow).not.toHaveBeenCalled()
      expect(h.reads).toBe(0)
    })
  })

  it('Send receipt sends for the board’s own association, with the setting off', async () => {
    const r = await sendPaymentReceipt({ paymentId: PAYMENT })
    expect(r).toEqual({ ok: true, status: 'sent', sent: 1, held: 0, optedOut: 0 })
    expect(sendNow).toHaveBeenCalledTimes(1)
    expect(sendNow.mock.calls[0]![1]).toEqual({ paymentId: PAYMENT, associationId: A1 })
  })

  it('Send receipt rejects a malformed id without sending', async () => {
    expect(await sendPaymentReceipt({ paymentId: 'nope' })).toMatchObject({ ok: false, status: 'invalid' })
    expect(sendNow).not.toHaveBeenCalled()
  })

  it('a guard hold is reported as held, not as an error', async () => {
    h.sendResult = { status: 'held', communicationId: 'c1', sent: 0, failed: 0, held: 1, optedOut: 0 }
    expect(await sendPaymentReceipt({ paymentId: PAYMENT })).toMatchObject({ ok: true, status: 'held', held: 1 })
  })

  it('opted out and already sent come back as plain messages', async () => {
    h.sendResult = { status: 'opted_out', communicationId: null, sent: 0, failed: 0, held: 0, optedOut: 1 }
    expect(await sendPaymentReceipt({ paymentId: PAYMENT })).toMatchObject({ ok: false, status: 'opted_out' })
    h.sendResult = { status: 'already_sent', communicationId: 'c1', sent: 0, failed: 0, held: 0, optedOut: 0 }
    expect(await sendPaymentReceipt({ paymentId: PAYMENT })).toMatchObject({ ok: false, status: 'already_sent' })
  })
})
