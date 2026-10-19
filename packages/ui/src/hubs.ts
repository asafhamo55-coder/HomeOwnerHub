/**
 * BL-097 — the PM and Eviction hubs are not offered right now.
 *
 * Single switch for every path into them: the in-app hub switchers, the
 * marketing nav / footer / homepage / pricing / command palette, and the
 * marketing /landlords + /eviction routes (which redirect to /hoa while this
 * is off). apps/pm and apps/eviction still build; nothing we ship links to
 * them. Flip to `true` to bring every entry point back in one edit.
 *
 * Kept dependency-free (no React, no client code) so it can be imported from
 * server components and config via `@homeowner-portal/ui/hubs`.
 *
 * See docs/decisions/2026-10-19-hide-pm-eviction.md.
 */
export const OTHER_HUBS_ENABLED: boolean = false
