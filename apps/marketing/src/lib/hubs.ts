// BL-097: the PM and Eviction hubs are not offered right now. The switch
// itself lives in packages/ui (shared with the apps' hub switchers); this
// file holds the marketing-side helpers that read it.
// See docs/decisions/2026-10-19-hide-pm-eviction.md.
import { OTHER_HUBS_ENABLED } from '@homeowner-portal/ui/hubs'

export { OTHER_HUBS_ENABLED }

/** Marketing routes that exist only to sell the PM / Eviction hubs. */
export const OTHER_HUB_PATHS = ['/landlords', '/eviction'] as const

/** False for a link into a hub we are not offering right now. */
export function isOfferedHref(href: string): boolean {
  if (OTHER_HUBS_ENABLED) return true
  return !OTHER_HUB_PATHS.some(
    (p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}#`) || href.startsWith(`${p}?`),
  )
}
