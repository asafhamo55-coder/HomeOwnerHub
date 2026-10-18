import { afterEach, describe, expect, it, vi } from 'vitest'
import { WHATS_NEW } from '@/generated/guide'
import { boardWhatsNew, boardWhatsNewByNote, latestBoardWhatsNewId } from './whats-new'
import { WHATS_NEW_SEEN_KEY, isWhatsNewUnread, markWhatsNewSeen, readWhatsNewSeen, storageAvailable } from './whats-new-seen'

describe('board What’s new entries', () => {
  it('only admin/board entries, newest first, with the first as the dot id', () => {
    const b = boardWhatsNew()
    expect(b.every((e) => e.roles.includes('admin') || e.roles.includes('board'))).toBe(true)
    expect(b.some((e) => e.roles.length === 1 && e.roles[0] === 'resident')).toBe(false)
    expect(latestBoardWhatsNewId()).toBe(b[0]?.id ?? null)
    expect(WHATS_NEW.length).toBeGreaterThanOrEqual(b.length)
  })

  it('groups by release note', () => {
    for (const [note, entries] of boardWhatsNewByNote()) expect(entries.every((e) => e.note === note)).toBe(true)
  })
})

function fakeStorage(opts: { throws?: boolean } = {}) {
  const map = new Map<string, string>()
  const ls = {
    getItem: (k: string) => {
      if (opts.throws) throw new Error('SecurityError')
      return map.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (opts.throws) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
  }
  const events: string[] = []
  vi.stubGlobal('window', { localStorage: ls, dispatchEvent: (e: Event) => (events.push(e.type), true) })
  vi.stubGlobal('CustomEvent', class extends Event {
    detail: unknown
    constructor(type: string, init?: { detail?: unknown }) {
      super(type)
      this.detail = init?.detail
    }
  })
  return { map, events }
}

afterEach(() => vi.unstubAllGlobals())

describe('the browser-remembered seen marker', () => {
  it('unread until the newest id is marked seen', () => {
    const { map, events } = fakeStorage()
    expect(isWhatsNewUnread('n#1', readWhatsNewSeen(), storageAvailable())).toBe(true)
    markWhatsNewSeen('n#1')
    expect(map.get(WHATS_NEW_SEEN_KEY)).toBe('n#1')
    expect(events).toEqual(['hoa:whats-new-seen'])
    expect(isWhatsNewUnread('n#1', readWhatsNewSeen(), storageAvailable())).toBe(false)
    expect(isWhatsNewUnread('n#2', readWhatsNewSeen(), storageAvailable())).toBe(true)
  })

  it('no entries means no dot', () => {
    fakeStorage()
    expect(isWhatsNewUnread(null, readWhatsNewSeen(), storageAvailable())).toBe(false)
  })

  it('blocked storage never throws and shows no dot', () => {
    fakeStorage({ throws: true })
    expect(readWhatsNewSeen()).toBeNull()
    expect(storageAvailable()).toBe(false)
    expect(() => markWhatsNewSeen('n#1')).not.toThrow()
    expect(isWhatsNewUnread('n#1', readWhatsNewSeen(), storageAvailable())).toBe(false)
  })
})
