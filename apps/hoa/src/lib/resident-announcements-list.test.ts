import { describe, expect, it } from 'vitest'
import {
  announcementsHref,
  categoriesWithItems,
  isLongBody,
  isNewAnnouncement,
  parseCategoryParam,
} from './resident-announcements-list'
import { readThenMarkViewed } from './resident-announcements'

describe('isNewAnnouncement', () => {
  it('is new when there is no last-viewed time', () => {
    expect(isNewAnnouncement('2026-10-01T00:00:00Z', null)).toBe(true)
  })
  it('is new only after the last visit', () => {
    expect(isNewAnnouncement('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(true)
    expect(isNewAnnouncement('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(false)
    expect(isNewAnnouncement('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(false)
  })
})

describe('category filter', () => {
  const items = [{ category: 'dues' }, { category: 'meeting' }, { category: 'dues' }]
  it('lists only categories with items', () => {
    expect(categoriesWithItems(items)).toEqual([
      { category: 'dues', count: 2 },
      { category: 'meeting', count: 1 },
    ])
  })
  it('ignores a category with no items', () => {
    const chips = categoriesWithItems(items)
    expect(parseCategoryParam('emergency', chips)).toBeNull()
    expect(parseCategoryParam('dues', chips)).toBe('dues')
    expect(parseCategoryParam(undefined, chips)).toBeNull()
  })
  it('keeps category while paging and drops defaults', () => {
    expect(announcementsHref('dues', 2)).toBe('/resident/announcements?category=dues&page=2')
    expect(announcementsHref('dues', 1)).toBe('/resident/announcements?category=dues')
    expect(announcementsHref(null, 3)).toBe('/resident/announcements?page=3')
    expect(announcementsHref(null, 1)).toBe('/resident/announcements')
  })
})

describe('isLongBody', () => {
  it('short bodies get no toggle', () => {
    expect(isLongBody('Pool closes Friday.')).toBe(false)
  })
  it('long or many-line bodies do', () => {
    expect(isLongBody('x'.repeat(400))).toBe(true)
    expect(isLongBody('a\n'.repeat(8))).toBe(true)
  })
})

describe('readThenMarkViewed', () => {
  it('reads the last-viewed time before stamping the visit', async () => {
    const calls: string[] = []
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push('read')
              return { data: { announcements_last_viewed_at: '2026-10-01T00:00:00Z' }, error: null }
            },
          }),
        }),
        update: () => ({
          eq: async () => {
            calls.push('mark')
            return {}
          },
        }),
      }),
    }
    expect(await readThenMarkViewed(supabase, 'u1')).toBe('2026-10-01T00:00:00Z')
    expect(calls).toEqual(['read', 'mark'])
  })
})
