import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/email-consent', () => ({ loadEmailConsent: m.load }))
vi.mock('@homeowner-portal/db/m1', () => ({ M1_APPLIED: false }))

const { loadPaperRule } = await import('./label-consent')
const db = {} as never

beforeEach(() => vi.clearAllMocks())

describe('loadPaperRule', () => {
  it('does not apply, and reads nothing, outside California', async () => {
    const rule = await loadPaperRule(db, 'o1', ['GA', 'FL'], { m1: true })
    expect(rule?.consentApplies('GA')).toBe(false)
    expect(m.load).not.toHaveBeenCalled()
  })

  it('does not apply while M1 is off, even in California', async () => {
    const rule = await loadPaperRule(db, 'o1', ['CA'], { m1: false })
    expect(rule?.consentApplies('CA')).toBe(false)
    expect(m.load).not.toHaveBeenCalled()
  })

  it('returns null when the consent read fails, so the page prints nothing', async () => {
    m.load.mockResolvedValue({ ok: false, error: 'x' })
    expect(await loadPaperRule(db, 'o1', ['CA'], { m1: true })).toBeNull()
  })

  it('returns null when consent is not available', async () => {
    m.load.mockResolvedValue({ ok: true, available: false })
    expect(await loadPaperRule(db, 'o1', ['CA'], { m1: true })).toBeNull()
  })

  it('keeps only granted accounts, and judges each state on its own in a mixed org', async () => {
    m.load.mockResolvedValue({
      ok: true,
      available: true,
      consent: new Map([
        ['yes', { granted: true, method: 'portal', at: 'x' }],
        ['revoked', { granted: false, method: 'portal', at: 'x' }],
      ]),
    })
    const rule = await loadPaperRule(db, 'o1', ['CA', 'GA', null], { m1: true })
    expect(m.load).toHaveBeenCalledWith(db, 'o1', { m1: true })
    expect([...rule!.granted]).toEqual(['yes'])
    expect(rule!.consentApplies('CA')).toBe(true)
    expect(rule!.consentApplies('GA')).toBe(false)
    expect(rule!.consentApplies(null)).toBe(false)
  })
})
