import { describe, expect, it } from 'vitest'
import { HOA_MODULES, enabledModules, moduleEnabled, modulesAddedByComplete } from './entitlements'

describe('plan → module entitlements (BL-104 §7 on BL-068 switches)', () => {
  it('before PRICING_V2 every org has every module (nobody loses a feature)', () => {
    for (const plan of ['free', 'monthly', 'annual', 'essentials', 'complete', null]) {
      expect(enabledModules({ plan }, false)).toEqual([...HOA_MODULES])
    }
  })

  it('Essentials = core + dues + ai', () => {
    expect(enabledModules({ plan: 'essentials' }, true)).toEqual(['core', 'dues', 'ai'])
  })

  it('Complete adds accounting, mailbox, vendors and leases', () => {
    expect(enabledModules({ plan: 'complete' }, true)).toEqual([...HOA_MODULES])
    expect(modulesAddedByComplete()).toEqual(['accounting', 'mailbox', 'vendors', 'leases'])
  })

  it('legacy $4.99/door subscriptions get Complete', () => {
    expect(enabledModules({ plan: 'monthly' }, true)).toEqual([...HOA_MODULES])
    expect(enabledModules({ plan: 'annual' }, true)).toEqual([...HOA_MODULES])
  })

  it('a trial (no subscription) is on Essentials', () => {
    expect(moduleEnabled({ plan: 'free' }, 'accounting', true)).toBe(false)
    expect(moduleEnabled({ plan: 'free' }, 'ai', true)).toBe(true)
  })

  it('a platform-admin override wins either way; core cannot be switched off', () => {
    expect(moduleEnabled({ plan: 'essentials', overrides: { accounting: true } }, 'accounting', true)).toBe(true)
    expect(moduleEnabled({ plan: 'complete', overrides: { leases: false } }, 'leases', true)).toBe(false)
    expect(moduleEnabled({ plan: 'complete', overrides: { core: false } }, 'core', true)).toBe(true)
  })
})
