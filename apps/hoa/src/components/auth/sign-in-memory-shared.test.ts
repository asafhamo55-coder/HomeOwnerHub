import { describe, expect, it } from 'vitest'
import {
  dismissPasswordPrompt,
  lastSignInMethod,
  passwordPromptDismissed,
  rememberSignInMethod,
  shouldOfferPasswordPrompt,
  type StorageLike,
} from './sign-in-memory-shared'

function memory(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}
const blocked: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('sign-in memory', () => {
  it('remembers the last method', () => {
    const s = memory()
    expect(lastSignInMethod(s)).toBeNull()
    rememberSignInMethod('link', s)
    expect(lastSignInMethod(s)).toBe('link')
    rememberSignInMethod('password', s)
    expect(lastSignInMethod(s)).toBe('password')
  })

  it('remembers a skip', () => {
    const s = memory()
    expect(passwordPromptDismissed(s)).toBe(false)
    dismissPasswordPrompt(s)
    expect(passwordPromptDismissed(s)).toBe(true)
  })

  it('survives blocked storage', () => {
    expect(() => rememberSignInMethod('link', blocked)).not.toThrow()
    expect(lastSignInMethod(blocked)).toBeNull()
    expect(passwordPromptDismissed(blocked)).toBe(false)
  })
})

describe('shouldOfferPasswordPrompt', () => {
  const base = { lastMethod: 'link' as const, dismissed: false, userMetadata: {} }
  it('offers after a link sign-in with no password', () => {
    expect(shouldOfferPasswordPrompt(base)).toBe(true)
    expect(shouldOfferPasswordPrompt({ ...base, userMetadata: null })).toBe(true)
  })
  it('stays away after a skip, a chosen password, or a password sign-in', () => {
    expect(shouldOfferPasswordPrompt({ ...base, dismissed: true })).toBe(false)
    expect(shouldOfferPasswordPrompt({ ...base, userMetadata: { password_set: true } })).toBe(false)
    expect(shouldOfferPasswordPrompt({ ...base, lastMethod: 'password' })).toBe(false)
    expect(shouldOfferPasswordPrompt({ ...base, lastMethod: null })).toBe(false)
  })
})
