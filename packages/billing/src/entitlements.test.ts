import { describe, expect, it } from 'vitest'
import { HOA_MODULES, enabledModules, moduleEnabled } from './entitlements'

describe('one plan, every feature (docs/decisions/2026-11-01-one-plan.md)', () => {
  it('every org has every module: orgs.plan is not an input, so a stored complete, a legacy value, a pilot override or a trial all see all of them', () => {
    expect(enabledModules({})).toEqual([...HOA_MODULES])
  })

  it('accounting, mailbox, vendors and leases are on with no override', () => {
    for (const m of ['accounting', 'mailbox', 'vendors', 'leases'] as const) expect(moduleEnabled({ overrides: null }, m)).toBe(true)
  })

  it('a platform-admin override can still force a module off; core cannot be switched off', () => {
    expect(moduleEnabled({ overrides: { leases: false } }, 'leases')).toBe(false)
    expect(moduleEnabled({ overrides: { accounting: true } }, 'accounting')).toBe(true)
    expect(moduleEnabled({ overrides: { core: false } }, 'core')).toBe(true)
  })
})
