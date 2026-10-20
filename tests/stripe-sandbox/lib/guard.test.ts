import { describe, expect, it } from 'vitest'
import { decideSandbox, describeDecision } from './guard'

// Fake key-shaped strings: prefixes only, never real values.
const TEST_KEY = 'sk_test_unitFAKE0000'
const LIVE_KEY = 'sk_live_unitFAKE0000'

describe('decideSandbox', () => {
  it('skips with a clear message when no key is set', () => {
    const d = decideSandbox({})
    expect(d.mode).toBe('skip')
    expect(describeDecision(d)).toMatch(/SKIPPED: STRIPE_TEST_SECRET_KEY is not set/)
  })

  it('skips a key that is not sk_test_ (and never echoes it)', () => {
    for (const k of ['pk_test_abc', 'rk_test_abc', 'whsec_abc', 'garbage']) {
      const d = decideSandbox({ STRIPE_TEST_SECRET_KEY: k })
      expect(d.mode).toBe('skip')
      expect(describeDecision(d)).not.toContain(k)
    }
  })

  it('refuses (hard-fails) a live secret or restricted key, in either variable', () => {
    for (const env of [
      { STRIPE_TEST_SECRET_KEY: LIVE_KEY },
      { STRIPE_TEST_SECRET_KEY: 'rk_live_unitFAKE' },
      { STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_SECRET_KEY: LIVE_KEY },
      { STRIPE_SECRET_KEY: `  ${LIVE_KEY}` },
    ]) {
      const d = decideSandbox(env)
      expect(d.mode).toBe('refuse')
      expect(describeDecision(d)).toMatch(/REFUSED: .*LIVE Stripe key/)
      expect(describeDecision(d)).not.toContain('unitFAKE')
    }
  })

  it('runs on sk_test_, with webhook cases only when a whsec_ secret is present', () => {
    const noHook = decideSandbox({ STRIPE_TEST_SECRET_KEY: TEST_KEY })
    expect(noHook).toMatchObject({ mode: 'run', secretKey: TEST_KEY, webhookSecret: null })
    expect(describeDecision(noHook)).toMatch(/STRIPE_TEST_WEBHOOK_SECRET is not set/)

    const badHook = decideSandbox({ STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_TEST_WEBHOOK_SECRET: 'nope' })
    expect(badHook).toMatchObject({ mode: 'run', webhookSecret: null })

    const full = decideSandbox({ STRIPE_TEST_SECRET_KEY: ` ${TEST_KEY} `, STRIPE_TEST_WEBHOOK_SECRET: 'whsec_unitFAKE' })
    expect(full).toMatchObject({ mode: 'run', secretKey: TEST_KEY, webhookSecret: 'whsec_unitFAKE', webhookSkipReason: null })
    expect(describeDecision(full)).not.toContain('unitFAKE')
  })

  it('a test key in STRIPE_SECRET_KEY alone is not enough to run', () => {
    expect(decideSandbox({ STRIPE_SECRET_KEY: TEST_KEY }).mode).toBe('skip')
  })
})
