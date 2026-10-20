import { afterEach, describe, expect, it, vi } from 'vitest'
import { appOrigin, appUrl, LEGACY_APP_ORIGIN } from './app-origin'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('appOrigin', () => {
  it('reads NEXT_PUBLIC_APP_URL, without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.homeownerledger.com/')
    expect(appOrigin()).toBe('https://app.homeownerledger.com')
    expect(appUrl('/auth/callback')).toBe('https://app.homeownerledger.com/auth/callback')
    expect(appUrl('resident/dues')).toBe('https://app.homeownerledger.com/resident/dues')
  })

  it('falls back to the pre-split host in production, so nothing moves until the env var does', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(appOrigin()).toBe(LEGACY_APP_ORIGIN)
    expect(LEGACY_APP_ORIGIN).toBe('https://www.homeownerledger.com')
  })

  it('falls back to localhost outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(appOrigin()).toBe('http://localhost:3000')
  })
})
