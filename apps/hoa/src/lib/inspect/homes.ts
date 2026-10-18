// BL-028: the homes inspection mode offers. The board picks from the same
// property list as the violation wizard (hoa_properties, archived homes
// left out), but a W3 draft is keyed by unit, so each home carries its
// canonical bridged unit (lib/properties/resolve). A home with no unit
// cannot take a draft; it is counted so the page can say so, not hidden
// silently. Pure.
//
// No geolocation: no table stores coordinates for a home, so there is
// nothing to sort by distance (checked for BL-028; adding it needs a
// migration and geocoding).

import { compareAddress } from '@/lib/properties/list-view'
import type { PropertyOption } from '@/lib/properties/picker-search'

export interface InspectHomes {
  /** `id` is the UNIT id (what the draft route takes). */
  homes: PropertyOption[]
  /** Homes with no linked unit, so they can't be inspected here yet. */
  unlinked: number
}

export function inspectHomes(
  properties: ReadonlyArray<{ id: string; address: string; unit_number: string | null }>,
  unitByProperty: ReadonlyMap<string, string>,
): InspectHomes {
  const homes: PropertyOption[] = []
  let unlinked = 0
  for (const p of properties) {
    const unitId = unitByProperty.get(p.id)
    if (unitId) homes.push({ id: unitId, address: p.address, unit_number: p.unit_number })
    else unlinked++
  }
  homes.sort((a, b) => compareAddress(a.address, b.address))
  return { homes, unlinked }
}
