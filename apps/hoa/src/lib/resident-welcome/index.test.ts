import { describe, expect, it } from 'vitest'
import {
  HOME_SCREEN_KEY,
  HOME_SCREEN_STEPS,
  WELCOME_TILES,
  detectPlatform,
  dismissHomeScreenHelper,
  dismissWelcome,
  shouldShowHomeScreenHelper,
  shouldShowWelcome,
  welcomeKey,
} from './index'

function memory(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('welcome card memory', () => {
  it('shows once, then never again for that HOA', () => {
    const s = memory()
    expect(shouldShowWelcome(s, 'org1')).toBe(true)
    dismissWelcome(s, 'org1')
    expect(shouldShowWelcome(s, 'org1')).toBe(false)
    expect(shouldShowWelcome(s, 'org2')).toBe(true)
    expect(s.getItem(welcomeKey('org1'))).toBe('1')
  })
  it('stays hidden when storage is missing or blocked', () => {
    expect(shouldShowWelcome(null, 'o')).toBe(false)
    expect(shouldShowWelcome(throwing, 'o')).toBe(false)
    expect(() => dismissWelcome(throwing, 'o')).not.toThrow()
    expect(shouldShowHomeScreenHelper(throwing)).toBe(false)
  })
  it('remembers the home screen helper separately', () => {
    const s = memory()
    expect(shouldShowHomeScreenHelper(s)).toBe(true)
    dismissHomeScreenHelper(s)
    expect(s.getItem(HOME_SCREEN_KEY)).toBe('1')
    expect(shouldShowHomeScreenHelper(s)).toBe(false)
  })
})

describe('detectPlatform', () => {
  it('knows iPhone, iPad as Mac, Android and desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe('other')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('other')
  })
})

describe('detectPlatform unknown touch devices', () => {
  it('has a both-platform result for a touch device that is neither', () => {
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/120', 5)).toBe('touch')
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/120', 0)).toBe('other')
  })
})

describe('copy', () => {
  it('has four tiles, four steps per phone, and no em dashes', () => {
    expect(WELCOME_TILES).toHaveLength(4)
    expect(HOME_SCREEN_STEPS.ios).toHaveLength(4)
    expect(HOME_SCREEN_STEPS.android).toHaveLength(4)
    const all = JSON.stringify([WELCOME_TILES, HOME_SCREEN_STEPS])
    expect(all).not.toContain('—')
    expect(all).not.toContain('–')
  })
})
