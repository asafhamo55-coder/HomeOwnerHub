// Type-to-search over a property list (the violation wizard's picker).
// Pure (vitest node harness).

import { compareAddress } from './list-view'

export interface PropertyOption {
  id: string
  address: string
  unit_number: string | null
}

export function propertyOptionLabel(o: PropertyOption): string {
  return o.unit_number ? `${o.address} · ${o.unit_number}` : o.address
}

/** Every whitespace-separated word must appear (address or unit), any order. */
export function searchPropertyOptions<T extends PropertyOption>(options: readonly T[], term: string, limit = 50): T[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)
  return options
    .filter((o) => {
      const hay = propertyOptionLabel(o).toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => compareAddress(a.address, b.address))
    .slice(0, limit)
}
