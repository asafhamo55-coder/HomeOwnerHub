// One plan, every feature (docs/decisions/2026-11-01-one-plan.md). Pure.
// Every org has every module, whatever orgs.plan says: 'essentials', a
// stored 'complete', a legacy $4.99/door value, a pilot override or no
// subscription at all (trial). No page asks for an upgrade to reach one.
//
// The only thing that can switch a module off is the platform-admin override
// (BL-068 switch, migration batch M2, not built yet): a forced false wins.
// Nothing reads a module column today, so every caller passes none.

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

/** Platform-admin override (BL-068 switch): false forces a module off; absent = on. */
export type ModuleOverrides = Partial<Record<HoaModule, boolean>>

/**
 * Whether a module is on for an org. The plan is not an input: there is one
 * plan and it includes everything. Core cannot be switched off (it holds the
 * data every module hangs off).
 */
export function moduleEnabled(org: { overrides?: ModuleOverrides | null }, module: HoaModule): boolean {
  if (module === 'core') return true
  const forced = org.overrides?.[module]
  return typeof forced === 'boolean' ? forced : true
}

/** Every module that is on for an org, in HOA_MODULES order. */
export function enabledModules(org: { overrides?: ModuleOverrides | null }): HoaModule[] {
  return HOA_MODULES.filter((m) => moduleEnabled(org, m))
}
