import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * sendEmailBatch exists because Resend allows 10 requests/second per TEAM,
 * and communications/send.ts used to fire one request per recipient in a
 * single Promise.all burst. A real 47-recipient announcement on 2026-08-31
 * delivered 10 and failed 37, every failure "Too many requests".
 *
 * Batching turns N requests into ceil(N/100), so the limit stops being
 * reachable at any realistic community size.
 */
const batchSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
    emails = { send: vi.fn() }
  },
}))

const ENV_FROM = 'HomeownerHub <noreply@homeownerledger.com>'

async function fresh() {
  vi.resetModules()
  return (await import('./email')).sendEmailBatch
}

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    to: `r${i}@example.com`,
    subject: `s${i}`,
    html: `<p>${i}</p>`,
    senderName: 'Madison Park HOA',
  }))

describe('sendEmailBatch', () => {
  const saved = { from: process.env.EMAIL_FROM, key: process.env.RESEND_API_KEY }

  beforeEach(() => {
    batchSend.mockReset()
    process.env.EMAIL_FROM = ENV_FROM
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    for (const [k, v] of [['EMAIL_FROM', saved.from], ['RESEND_API_KEY', saved.key]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('sends 47 recipients in ONE request, not 47', async () => {
    batchSend.mockResolvedValue({
      data: { data: mk(47).map((_, i) => ({ id: `id${i}` })), errors: [] },
      error: null,
    })
    const results = await (await fresh())(mk(47))

    expect(batchSend).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(47)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('chunks above 100 per call', async () => {
    batchSend.mockImplementation((payload: unknown[]) => ({
      data: { data: payload.map((_, i) => ({ id: `id${i}` })), errors: [] },
      error: null,
    }))
    const results = await (await fresh())(mk(250))

    expect(batchSend).toHaveBeenCalledTimes(3)
    expect(batchSend.mock.calls[0][0]).toHaveLength(100)
    expect(batchSend.mock.calls[2][0]).toHaveLength(50)
    expect(results).toHaveLength(250)
  })

  // Strict mode would fail all 47 because one address is malformed. That is
  // a regression from the per-recipient loop this replaces.
  it('requests permissive validation so one bad address cannot sink the batch', async () => {
    batchSend.mockResolvedValue({ data: { data: [], errors: [] }, error: null })
    await (await fresh())(mk(3))

    expect(batchSend.mock.calls[0][1]).toMatchObject({ batchValidation: 'permissive' })
  })

  it('maps per-index errors back to the right recipients', async () => {
    // index 1 failed; data carries only the two that succeeded
    batchSend.mockResolvedValue({
      data: {
        data: [{ id: 'id0' }, { id: 'id2' }],
        errors: [{ index: 1, message: 'Invalid `to` field.' }],
      },
      error: null,
    })
    const results = await (await fresh())(mk(3))

    expect(results[0]).toEqual({ ok: true, messageId: 'id0' })
    expect(results[1]).toEqual({ ok: false, error: 'Invalid `to` field.' })
    expect(results[2]).toEqual({ ok: true, messageId: 'id2' })
  })

  // The other plausible server shape: data aligned 1:1 with the payload.
  it('maps correctly when data is index-aligned with the payload', async () => {
    batchSend.mockResolvedValue({
      data: {
        data: [{ id: 'id0' }, { id: 'ignored' }, { id: 'id2' }],
        errors: [{ index: 1, message: 'bad' }],
      },
      error: null,
    })
    const results = await (await fresh())(mk(3))

    expect(results[0]).toEqual({ ok: true, messageId: 'id0' })
    expect(results[1]).toEqual({ ok: false, error: 'bad' })
    expect(results[2]).toEqual({ ok: true, messageId: 'id2' })
  })

  it('fails only the affected chunk when a whole batch call errors', async () => {
    batchSend
      .mockResolvedValueOnce({ data: null, error: { message: 'Too many requests.' } })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'ok' }], errors: [] },
        error: null,
      })
    const results = await (await fresh())(mk(101))

    expect(results.slice(0, 100).every((r) => !r.ok)).toBe(true)
    expect(results[0]).toEqual({ ok: false, error: 'Too many requests.' })
    expect(results[100]).toEqual({ ok: true, messageId: 'ok' })
  })

  it('applies the community sender name to every email in the batch', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 'a' }], errors: [] }, error: null })
    await (await fresh())(mk(1))

    expect(batchSend.mock.calls[0][0][0].from).toBe(
      '"Madison Park HOA" <noreply@homeownerledger.com>',
    )
  })

  it('reports EMAIL_FROM missing for every recipient', async () => {
    delete process.env.EMAIL_FROM
    const results = await (await fresh())(mk(2))

    expect(results).toEqual([
      { ok: false, error: 'EMAIL_FROM is not configured.' },
      { ok: false, error: 'EMAIL_FROM is not configured.' },
    ])
    expect(batchSend).not.toHaveBeenCalled()
  })

  it('no-ops without an API key, matching sendEmail', async () => {
    delete process.env.RESEND_API_KEY
    const results = await (await fresh())(mk(2))

    expect(results).toEqual([
      { ok: true, messageId: null },
      { ok: true, messageId: null },
    ])
    expect(batchSend).not.toHaveBeenCalled()
  })

  it('returns an empty array for no recipients without calling Resend', async () => {
    expect(await (await fresh())([])).toEqual([])
    expect(batchSend).not.toHaveBeenCalled()
  })
})
