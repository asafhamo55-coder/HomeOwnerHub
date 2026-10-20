// BL-104 §7 — plan → module entitlements, on BL-068's module list.
// Pure: the BL-068 per-tenant switches (migration batch M2) are not built
// yet, so nothing reads a module column today. When they land, the switch
// row is the platform-admin override passed in here; until then every
// caller passes none and gets the plan's default.
//
// Decision §1: Essentials = Core + Dues (simple ledger) + AI at Essentials
// limits. Complete adds Accounting, Mailbox, Vendors & RFPs, Leases and full
// AI limits. Legacy $4.99/door subscriptions = Complete. Before PRICING_V2
// every org is Complete (effectivePlan), so no module disappears today.

import { effectivePlan, type HoaPlanId } from './pricing-v2'

/** BL-068's modules. 'core' is always on. */
export const HOA_MODULES = ['core', 'dues', 'ai', 'accounting', 'mailbox', 'vendors', 'leases'] as const
export type HoaModule = (typeof HOA_MODULES)[number]

export const MODULE_LABEL: Readonly<Record<HoaModule, string>> = {
  core: 'Core',
  dues: 'Dues & online payments',
  ai: 'AI assistant',
  accounting: 'Accounting',
  mailbox: 'Shared HOA mailbox',
  vendors: 'Vendors & RFPs',
  leases: 'Leases & rentals',
}

export const PLAN_MODULES: Readonly<Record<HoaPlanId, readonly HoaModule[]>> = {
  essentials: ['core', 'dues', 'ai'],
  complete: ['core', 'dues', 'ai', 'accounting', 'mailbox', 'vendors', 'leases'],
}

/** Platform-admin override (BL-068 switch): true/false forces a module; absent = the plan's default. */
export type ModuleOverrides = Partial<Record<HoaModule, boolean>>

/**
 * Whether a module is on for an org. `plan` is orgs.plan as stored.
 * Core cannot be switched off (it holds the data every module hangs off).
 */
export function moduleEnabled(
  org: { plan: string | null | undefined; overrides?: ModuleOverrides | null },
  module: HoaModule,
  pricingV2: boolean,
): boolean {
  if (module === 'core') return true
  const forced = org.overrides?.[module]
  if (typeof forced === 'boolean') return forced
  return PLAN_MODULES[effectivePlan(org.plan, pricingV2)].includes(module)
}

/** Every module that is on for an org, in HOA_MODULES order. */
export function enabledModules(
  org: { plan: string | null | undefined; overrides?: ModuleOverrides | null },
  pricingV2: boolean,
): HoaModule[] {
  return HOA_MODULES.filter((m) => moduleEnabled(org, m, pricingV2))
}

/** The modules Complete adds over Essentials — the upgrade pitch on a module-off page. */
export function modulesAddedByComplete(): HoaModule[] {
  return PLAN_MODULES.complete.filter((m) => !PLAN_MODULES.essentials.includes(m))
}
