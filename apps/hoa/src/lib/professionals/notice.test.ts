import { describe, expect, it } from 'vitest'
import { PRO_ACTIONS, expiryLabel } from './model'
import { PRO_EXPIRY_WARN_DAYS, TREASURER_ROUTED_ACTIONS, proExpiryCounts, treasurerRecipientIds } from './notice'

describe('Treasurer routing of CPA submissions (BL-168 follow-up)', () => {
  it('the routed actions are exactly the CPA’s entry and review note', () => {
    expect([...TREASURER_ROUTED_ACTIONS].sort()).toEqual([PRO_ACTIONS.entry, PRO_ACTIONS.review].sort())
  })

  const m = (user_id: string, role: string, officer_title: string | null = null) => ({ user_id, role, officer_title })

  it('the Treasurer alone when there is one', () => {
    const ids = treasurerRecipientIds([m('a', 'admin'), m('t', 'board', 'treasurer'), m('b', 'board', 'secretary')])
    expect([...ids]).toEqual(['t'])
  })

  it('every admin when the board has no Treasurer', () => {
    const ids = treasurerRecipientIds([m('a1', 'admin'), m('a2', 'admin'), m('b', 'board', 'president'), m('p', 'cpa')])
    expect([...ids].sort()).toEqual(['a1', 'a2'])
  })

  it('a treasurer title on a non-board row never counts; professionals and residents are never recipients', () => {
    const ids = treasurerRecipientIds([m('a', 'admin', 'treasurer'), m('c', 'cpa', 'treasurer'), m('r', 'resident')])
    expect([...ids]).toEqual(['a'])
  })

  it('nobody to tell yields an empty set', () => {
    expect(treasurerRecipientIds([]).size).toBe(0)
  })
})

describe('professional grant expiry counts (BL-168 follow-up)', () => {
  const now = Date.parse('2026-10-27T11:00:00Z')
  const day = 86_400_000
  const at = (offsetMs: number) => ({ access_expires_at: new Date(now + offsetMs).toISOString() })

  it('splits expired, expiring within 30 days, and later', () => {
    const counts = proExpiryCounts(
      [at(-day), at(-1), at(1), at(PRO_EXPIRY_WARN_DAYS * day), at(PRO_EXPIRY_WARN_DAYS * day + 1), { access_expires_at: null }, { access_expires_at: 'junk' }],
      now,
    )
    expect(counts).toEqual({ expiring: 2, expired: 2 })
  })

  it('no grants, no counts', () => {
    expect(proExpiryCounts([], now)).toEqual({ expiring: 0, expired: 0 })
  })
})

describe('Settings → Professionals expiry label', () => {
  const today = '2026-10-27'
  it('says how long is left, or Expired', () => {
    expect(expiryLabel('2026-11-26T00:00:00Z', today)).toBe('Expires in 30 days')
    expect(expiryLabel('2026-10-28T00:00:00Z', today)).toBe('Expires in 1 day')
    expect(expiryLabel('2026-10-27T05:00:00Z', today)).toBe('Expires today')
    expect(expiryLabel('2026-10-26T00:00:00Z', today)).toBe('Expired')
    expect(expiryLabel(null, today)).toBe('No end date')
  })
})
