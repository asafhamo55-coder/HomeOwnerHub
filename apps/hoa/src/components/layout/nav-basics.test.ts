import { describe, expect, it } from 'vitest'
import {
  ADMIN_ACCOUNT,
  BOARD_ACCOUNT,
  HOA_NAV,
  resolveNavMode,
  visibleNavLinks,
} from './nav'

const all = HOA_NAV.flatMap((g) => g.items)
const DAY = 86_400_000

describe('plain nav labels', () => {
  it('uses plain words and keeps the routes', () => {
    const byHref = Object.fromEntries(all.map((l) => [l.href, l]))
    expect(byHref['/arc']?.label).toBe('Architecture requests')
    expect(byHref['/approvals']?.label).toBe('Things to approve')
    expect(all.map((l) => l.label)).not.toContain('ARC review')
    expect(all.map((l) => l.label)).not.toContain('Approvals')
  })
})

describe('basics menu', () => {
  it('shows exactly the basics, and every link stays in the full list', () => {
    const labels = [...all, ...BOARD_ACCOUNT].filter((l) => l.basic).map((l) => l.label)
    expect(labels.sort()).toEqual(
      ['Architecture requests', 'Dashboard', 'Documents', 'Dues', 'Help', 'Meetings', 'Messages', 'Things to approve', 'Tickets', 'Violations'].sort(),
    )
    expect(visibleNavLinks(all, 'all', null)).toHaveLength(all.length)
    expect(visibleNavLinks(ADMIN_ACCOUNT, 'basics', null).map((l) => l.label)).toEqual(['Help'])
  })
  it('always keeps the active page, even when it is not a basic', () => {
    expect(visibleNavLinks(all, 'basics', null).map((l) => l.href)).not.toContain('/vendors')
    expect(visibleNavLinks(all, 'basics', '/vendors').map((l) => l.href)).toContain('/vendors')
  })
})

describe('newly switched-on features stay out of the basics menu', () => {
  const byHref = Object.fromEntries(all.map((l) => [l.href, l]))
  it.each([
    ['/polls', 'Polls'],
    ['/amenities', 'Amenities'],
    ['/community-board', 'Community board'],  ])('%s is in the full menu as %s and is not a basic', (href, label) => {
    expect(byHref[href]?.label).toBe(label)
    expect(byHref[href]?.basic).toBeFalsy()
    expect(visibleNavLinks(all, 'basics', null).map((l) => l.href)).not.toContain(href)
  })
})

describe('resolveNavMode', () => {
  const now = Date.UTC(2026, 9, 31)
  it('a stored choice wins', () => {
    expect(resolveNavMode({ stored: 'all', role: 'board', firstSeen: now, now })).toBe('all')
    expect(resolveNavMode({ stored: 'basics', role: 'admin', firstSeen: null, now })).toBe('basics')
  })
  it('admins default to all', () => {
    expect(resolveNavMode({ stored: null, role: 'admin', firstSeen: now, now })).toBe('all')
  })
  it('board members get basics in the first 30 days or when unknown, then all', () => {
    expect(resolveNavMode({ stored: null, role: 'board', firstSeen: null, now })).toBe('basics')
    expect(resolveNavMode({ stored: null, role: 'board', firstSeen: now - 10 * DAY, now })).toBe('basics')
    expect(resolveNavMode({ stored: null, role: 'board', firstSeen: now - 31 * DAY, now })).toBe('all')
    expect(resolveNavMode({ stored: 'junk', role: 'board', firstSeen: null, now })).toBe('basics')
  })
})
