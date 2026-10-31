import { describe, expect, it } from 'vitest'
import { healthDefaultOpen, healthStorageKey, readHealthOpen, writeHealthOpen, type KeyValueStorage } from './health-disclosure'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}
const throwing: KeyValueStorage = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
}

describe('healthDefaultOpen', () => {
  it('is collapsed for orgs younger than 60 days', () => {
    expect(healthDefaultOpen(daysAgo(0), NOW)).toBe(false)
    expect(healthDefaultOpen(daysAgo(29), NOW)).toBe(false)
    expect(healthDefaultOpen(daysAgo(59), NOW)).toBe(false)
  })
  it('is open from 60 days on', () => {
    expect(healthDefaultOpen(daysAgo(60), NOW)).toBe(true)
    expect(healthDefaultOpen(daysAgo(400), NOW)).toBe(true)
  })
  it('is collapsed when the date is missing, bad or in the future', () => {
    expect(healthDefaultOpen(null, NOW)).toBe(false)
    expect(healthDefaultOpen('nope', NOW)).toBe(false)
    expect(healthDefaultOpen(daysAgo(-5), NOW)).toBe(false)
  })
})

describe('remembering the choice', () => {
  it('uses the default until a choice is saved, then the saved choice wins', () => {
    const s = memory()
    expect(readHealthOpen(s, 'o1', true)).toBe(true)
    expect(readHealthOpen(s, 'o1', false)).toBe(false)
    writeHealthOpen(s, 'o1', false)
    expect(readHealthOpen(s, 'o1', true)).toBe(false)
    writeHealthOpen(s, 'o1', true)
    expect(readHealthOpen(s, 'o1', false)).toBe(true)
  })
  it('keeps each org apart', () => {
    const s = memory()
    writeHealthOpen(s, 'o1', true)
    expect(readHealthOpen(s, 'o2', false)).toBe(false)
    expect([...s.data.keys()]).toEqual([healthStorageKey('o1')])
  })
  it('ignores junk values', () => {
    const s = memory()
    s.data.set(healthStorageKey('o1'), 'maybe')
    expect(readHealthOpen(s, 'o1', true)).toBe(true)
  })
  it('never throws when storage is missing or blocked', () => {
    expect(readHealthOpen(null, 'o1', true)).toBe(true)
    expect(readHealthOpen(throwing, 'o1', false)).toBe(false)
    expect(() => writeHealthOpen(throwing, 'o1', true)).not.toThrow()
    expect(() => writeHealthOpen(null, 'o1', true)).not.toThrow()
  })
})
