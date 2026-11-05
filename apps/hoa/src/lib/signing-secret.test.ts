import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSigningSecret, MissingSigningSecretError } from './signing-secret'
import { complianceAckSecret } from './compliance/deadlines'
import { lateFeeSettingsSecret } from './late-fees/store'
import { gaRegistrationSecret } from './ga-registration/store'
import { arcClockSecret } from './arc-review/clock'
import { vendorInsuranceSettingsSecret } from '../../../../packages/workflows/src/vendor-insurance/settings'

afterEach(() => vi.restoreAllMocks())

const SRK = 'srk-value-not-to-leak'
const PROD = { VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: SRK }

describe('resolveSigningSecret', () => {
  it('returns the dedicated secret everywhere', () => {
    expect(resolveSigningSecret('X_SECRET', { X_SECRET: 'd', ...PROD })).toBe('d')
    expect(resolveSigningSecret('X_SECRET', { X_SECRET: 'd' })).toBe('d')
  })

  it('throws and logs the name only in production when the dedicated secret is missing', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => resolveSigningSecret('X_SECRET', PROD)).toThrow(MissingSigningSecretError)
    expect(() => resolveSigningSecret('X_SECRET', { VERCEL_ENV: 'production' })).toThrow(/X_SECRET/)
    expect(err).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(err.mock.calls)).not.toContain(SRK)
  })

  it('treats an empty dedicated secret as missing in production', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => resolveSigningSecret('X_SECRET', { ...PROD, X_SECRET: '' })).toThrow(MissingSigningSecretError)
  })

  it('keeps the fallback in preview, development and test', () => {
    for (const VERCEL_ENV of ['preview', 'development', undefined]) {
      expect(resolveSigningSecret('X_SECRET', { VERCEL_ENV, SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
    }
    expect(resolveSigningSecret('X_SECRET', { SUPABASE_SECRET_KEY: 'sk' })).toBe('sk')
    expect(resolveSigningSecret('X_SECRET', {})).toBeNull()
  })
})

describe('every PAY_SETTINGS_SECRET chain fails closed in production', () => {
  const chains: Array<[string, (env: Record<string, string | undefined>) => string | null]> = [
    ['complianceAckSecret', complianceAckSecret],
    ['lateFeeSettingsSecret', lateFeeSettingsSecret],
    ['gaRegistrationSecret', gaRegistrationSecret],
    ['arcClockSecret', arcClockSecret],
    ['vendorInsuranceSettingsSecret', vendorInsuranceSettingsSecret],
  ]
  for (const [name, fn] of chains) {
    it(`${name}: throws in production, falls back elsewhere, prefers dedicated`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => fn(PROD)).toThrow(/PAY_SETTINGS_SECRET/)
      expect(fn({ ...PROD, PAY_SETTINGS_SECRET: 'ded' })).toBe('ded')
      expect(fn({ VERCEL_ENV: 'preview', SUPABASE_SERVICE_ROLE_KEY: SRK })).toBe(SRK)
    })
  }
})
