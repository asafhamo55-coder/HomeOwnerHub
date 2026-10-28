import { describe, expect, it, vi } from 'vitest'
import { buildDigestEmail, loadSeasonalNudge } from './daily-digest'
import { digestNudge, nudgeAnnouncePath } from '../../../apps/hoa/src/lib/announcements/nudge'
import { signDismissal } from '../../../apps/hoa/src/lib/announcements/dismiss'
import { todayIn } from './association-time'

/**
 * BL-173: the digest's seasonal line. Halloween 2026 is Saturday Oct 31 with
 * a 10-day window, so the window opens Oct 21 and the day before is Oct 30.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function dbWith(result: { data: unknown; error: unknown }) {
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return chain
  })
  return { from }
}

const base = { orgName: 'Maple HOA', mailboxes: [], reconnectUrl: 'x', waiting: null }

describe('digestNudge timing', () => {
  it('speaks on the first window day and the day before', () => {
    expect(digestNudge('2026-10-21')?.occasionId).toBe('halloween-party')
    expect(digestNudge('2026-10-30')?.occasionId).toBe('halloween-party')
    expect(digestNudge('2026-10-30')?.headline).toBe('Halloween is tomorrow')
  })
  it('is silent on other days', () => {
    for (const d of ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-01']) {
      expect(digestNudge(d)?.occasionId).not.toBe('halloween-party')
    }
  })
  it('skips a dismissed occasion for that year only', () => {
    expect(digestNudge('2026-10-21', new Set(['halloween-party:2026']))?.occasionId).not.toBe('halloween-party')
  })
  it('links into the announce flow', () => {
    const n = digestNudge('2026-10-21')!
    expect(nudgeAnnouncePath(n)).toBe('/communications/announce?occasion=halloween-party&date=2026-10-31')
  })
})

describe('the digest line', () => {
  const nudge = digestNudge('2026-10-30')!
  const withOther = {
    ...base,
    lateFees: { summary: { charged: 1, totalCents: 1000 }, policyUrl: 'https://app.test/settings/late-fees' },
    nudge: { nudge, announceUrl: 'https://app.test/communications/announce?occasion=halloween-party&date=2026-10-31' },
  }
  it('rides an email that goes out anyway, with the link', () => {
    const e = buildDigestEmail(withOther)
    expect(e.text).toContain('Halloween is tomorrow: send your community a note')
    expect(e.text).toContain('https://app.test/communications/announce?occasion=halloween-party&date=2026-10-31')
    expect(e.html).toContain('href="https://app.test/communications/announce?occasion=halloween-party&amp;date=2026-10-31"')
    expect(e.subject).toContain('late fee')
  })
  it('never makes an email on its own', () => {
    const e = buildDigestEmail({ ...base, nudge: withOther.nudge })
    expect(e.text).not.toContain('send your community a note')
  })
})

describe('loadSeasonalNudge', () => {
  it('uses the association time zone boundary: 8pm Eastern Oct 20 is still Oct 20', async () => {
    // 2026-10-21T00:30Z is 8:30pm Oct 20 in New York, so the window has not opened.
    const today = todayIn('America/New_York', new Date('2026-10-21T00:30:00Z'))
    expect(today).toBe('2026-10-20')
    expect(await loadSeasonalNudge(dbWith({ data: [], error: null }), 'o', today, logger, 's')).toBeNull()
    const next = todayIn('America/New_York', new Date('2026-10-21T11:00:00Z'))
    expect((await loadSeasonalNudge(dbWith({ data: [{ id: 'a1', compliance_settings: {} }], error: null }), 'o', next, logger, 's'))?.occasionId).toBe('halloween-party')
  })
  it('honours a signed dismissal and ignores a forged one', async () => {
    const good = signDismissal('a1', 'halloween-party:2026', { at: '2026-10-21T00:00:00Z', by: null }, 's')
    const settings = (e: unknown) => ({ announcement_nudges: { dismissed: [e] } })
    const run = (e: unknown) => loadSeasonalNudge(dbWith({ data: [{ id: 'a1', compliance_settings: settings(e) }], error: null }), 'o', '2026-10-21', logger, 's')
    expect(await run(good)).toBeNull()
    expect((await run({ ...good, sig: 'ab'.repeat(32) }))?.occasionId).toBe('halloween-party')
  })
  it('a failed read is silence, logged by code', async () => {
    expect(await loadSeasonalNudge(dbWith({ data: null, error: { code: '42501' } }), 'o', '2026-10-21', logger, 's')).toBeNull()
  })
})
