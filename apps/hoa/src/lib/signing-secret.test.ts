import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MissingSigningSecretError,
  requireSigningSecret,
  resetSigningSecretLogForTests,
  resolveSigningSecret,
} from './signing-secret'
import { complianceAckSecret } from './compliance/deadlines'
import { lateFeeSettingsSecret } from './late-fees/store'
import { gaRegistrationSecret } from './ga-registration/store'
import { arcClockSecret } from './arc-review/clock'
import { paySettingsSecret } from './pay-by-zelle'
import { inviteSecret } from './professionals/invite-token'
import { vendorInsuranceSettingsSecret } from '../../../../packages/workflows/src/vendor-insurance/settings'

beforeEach(() => resetSigningSecretLogForTests())
afterEach(() => vi.restoreAllMocks())

const SRK = 'srk-value-not-to-leak'
const PROD = { VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: SRK }

describe('resolveSigningSecret', () => {
  it('returns the dedicated secret everywhere', () => {
    expect(resolveSigningSecret('X_SECRET', { X_SECRET: 'd', ...PROD })).toBe('d')
    expect(resolveSigningSecret('X_SECRET', { X_SECRET: 'd' })).toBe('d')
  })

  it('returns null (never throws, never the service key) in production when missing, logging the name once', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(resolveSigningSecret('X_SECRET', PROD)).toBeNull()
    expect(resolveSigningSecret('X_SECRET', { VERCEL_ENV: 'production' })).toBeNull()
    expect(resolveSigningSecret('X_SECRET', { ...PROD, X_SECRET: '' })).toBeNull()
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0][0])).toContain('X_SECRET')
    expect(JSON.stringify(err.mock.calls)).not.toContain(SRK)
  })

  it('logs once per secret name', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    resolveSigningSecret('A_SECRET', PROD)
    resolveSigningSecret('B_SECRET', PROD)
    resolveSigningSecret('A_SECRET', PROD)
    expect(err).toHaveBeenCalledTimes(2)
  })

  it('keeps the fallback in preview, development and test', () => {
    for (const VERCEL_ENV of ['preview', 'development', undefined]) {
      expect(resolveSigningSecret('X_SECRET', { VERCEL_ENV, SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
    }
    expect(resolveSigningSecret('X_SECRET', { SUPABASE_SECRET_KEY: 'sk' })).toBe('sk')
    expect(resolveSigningSecret('X_SECRET', {})).toBeNull()
  })
})

describe('requireSigningSecret', () => {
  it('throws MissingSigningSecretError in production, logging the name once and never the value', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => requireSigningSecret('X_SECRET', PROD)).toThrow(MissingSigningSecretError)
    expect(() => requireSigningSecret('X_SECRET', PROD)).toThrow(/X_SECRET/)
    expect(err).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(err.mock.calls)).not.toContain(SRK)
  })

  it('returns the dedicated secret, and the fallback outside production', () => {
    expect(requireSigningSecret('X_SECRET', { X_SECRET: 'd', ...PROD })).toBe('d')
    expect(requireSigningSecret('X_SECRET', { VERCEL_ENV: 'preview', SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
  })
})

describe('every PAY_SETTINGS_SECRET getter returns null in production without it (callers fail closed per feature)', () => {
  const getters: Array<[string, (env: Record<string, string | undefined>) => string | null]> = [
    ['paySettingsSecret', paySettingsSecret],
    ['complianceAckSecret', complianceAckSecret],
    ['lateFeeSettingsSecret', lateFeeSettingsSecret],
    ['gaRegistrationSecret', gaRegistrationSecret],
    ['arcClockSecret', arcClockSecret],
    ['vendorInsuranceSettingsSecret', vendorInsuranceSettingsSecret],
  ]
  for (const [name, fn] of getters) {
    it(`${name}: null in production, dedicated wins, fallback elsewhere`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(fn(PROD)).toBeNull()
      expect(fn({ ...PROD, PAY_SETTINGS_SECRET: 'ded' })).toBe('ded')
      expect(fn({ VERCEL_ENV: 'preview', SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
    })
  }
})

describe('inviteSecret uses the same VERCEL_ENV rule', () => {
  const LONG = 'x'.repeat(32)
  it('production: dedicated only, otherwise null (no pay-secret or service-key fallback)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(inviteSecret({ ...PROD, PAY_SETTINGS_SECRET: 'pay' })).toBeNull()
    expect(inviteSecret({ ...PROD, PRO_INVITE_SECRET: 'short' })).toBeNull()
    expect(inviteSecret({ ...PROD, PRO_INVITE_SECRET: LONG })).toBe(LONG)
  })
  it('preview and dev keep the chain, even with NODE_ENV=production', () => {
    expect(inviteSecret({ VERCEL_ENV: 'preview', NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
  })
})
