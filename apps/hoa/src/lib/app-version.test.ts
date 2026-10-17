import { afterEach, describe, expect, it, vi } from 'vitest'
import { appBuildTime, appCommitSha, appVersion, formatAppVersion } from './app-version'

const SHA = 'c56061f0123456789abcdef0123456789abcdef0'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('formatAppVersion (pure)', () => {
  it('formats the build date in America/New_York plus the 7-char sha', () => {
    const v = formatAppVersion(SHA, '2026-10-17T15:00:00.000Z')
    expect(v.label).toBe('v2026.10.17 · c56061f')
    expect(v.shortSha).toBe('c56061f')
    expect(v.sha).toBe(SHA)
  })

  it('uses the New York calendar day, not UTC, near midnight', () => {
    // 02:30 UTC on the 18th is still the evening of the 17th in New York.
    expect(formatAppVersion(SHA, '2026-10-18T02:30:00.000Z').label).toBe('v2026.10.17 · c56061f')
  })

  it('puts the full sha and build time in the title', () => {
    const v = formatAppVersion(SHA, '2026-10-17T15:00:00.000Z')
    expect(v.title).toContain(SHA)
    expect(v.title).toContain('2026-10-17T15:00:00.000Z')
  })

  it('falls back to "local" when the sha is missing or empty', () => {
    expect(formatAppVersion(undefined, '2026-10-17T15:00:00.000Z').label).toBe('v2026.10.17 · local')
    expect(formatAppVersion('', '2026-10-17T15:00:00.000Z').shortSha).toBe('local')
    expect(formatAppVersion('local', undefined).label).toBe('local')
  })

  it('drops the date when the build time is missing or not a date', () => {
    expect(formatAppVersion(SHA, undefined).label).toBe('c56061f')
    expect(formatAppVersion(SHA, 'not-a-date').label).toBe('c56061f')
    expect(formatAppVersion(SHA, undefined).title).toBe(`Commit ${SHA}`)
  })
})

describe('env readers', () => {
  it('appCommitSha reads VERCEL_GIT_COMMIT_SHA, falling back to "local"', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA)
    expect(appCommitSha()).toBe(SHA)
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
    expect(appCommitSha()).toBe('local')
  })

  it('appBuildTime reads NEXT_PUBLIC_BUILD_TIME', () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_TIME', '2026-10-17T15:00:00.000Z')
    expect(appBuildTime()).toBe('2026-10-17T15:00:00.000Z')
  })

  it('appVersion combines both', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA)
    vi.stubEnv('NEXT_PUBLIC_BUILD_TIME', '2026-10-17T15:00:00.000Z')
    expect(appVersion().label).toBe('v2026.10.17 · c56061f')
  })
})
