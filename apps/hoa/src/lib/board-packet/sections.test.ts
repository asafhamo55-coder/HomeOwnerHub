import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError }))

import { loadPacketSections } from './sections'

describe('loadPacketSections — each section fails on its own', () => {
  beforeEach(() => reportError.mockReset())

  it('one throwing loader fails only its own section; the rest load', async () => {
    const s = await loadPacketSections({
      income: () => Promise.resolve({ totalIncome: 1200 }),
      balance: () => Promise.reject(new Error('accounting query failed (57014): canceling statement due to statement timeout')),
      violations: () => Promise.resolve({ total: 3 }),
    })
    expect(s.income).toEqual({ ok: true, data: { totalIncome: 1200 }, count: null })
    expect(s.balance).toEqual({ ok: false })
    expect(s.violations).toEqual({ ok: true, data: { total: 3 }, count: null })
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0]![2]).toEqual({ what: 'board packet: balance', code: 'thrown' })
  })

  it('a failed section carries no data — nothing a page could render as $0', async () => {
    const s = await loadPacketSections({ delinquency: () => Promise.reject(new Error('x')) })
    expect(Object.keys(s.delinquency)).toEqual(['ok'])
  })

  it('every section can fail at once and the call still resolves', async () => {
    const boom = () => Promise.reject(new Error('down'))
    const s = await loadPacketSections({ a: boom, b: boom, c: boom })
    expect([s.a.ok, s.b.ok, s.c.ok]).toEqual([false, false, false])
    expect(reportError).toHaveBeenCalledTimes(3)
  })

  it('loaders run in parallel, not one after another', async () => {
    let inFlight = 0
    let peak = 0
    const slow = () =>
      new Promise<number>((resolve) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        setTimeout(() => {
          inFlight -= 1
          resolve(1)
        }, 5)
      })
    await loadPacketSections({ a: slow, b: slow, c: slow })
    expect(peak).toBe(3)
  })

  it('a null loader is skipped: not run, not reported, and not ok', async () => {
    const s = await loadPacketSections({ income: null, arc: () => Promise.resolve([]) })
    expect(s.income).toEqual({ ok: false, skipped: true })
    expect(s.arc.ok).toBe(true)
    expect(reportError).not.toHaveBeenCalled()
  })
})
