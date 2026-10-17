import type { PropertyId, UnitId } from './resolve'

/**
 * THE way to build a link to a property page. Every `/properties/<id>`
 * href and revalidatePath goes through here (href-ratchet.test.ts fails
 * a new hand-built one).
 *
 * Takes a branded id, so a bare string — the 07160ec bug, a unit id
 * passed where a property id belonged — has to be named for what it is
 * first. Either brand is accepted: `/properties/[id]` resolves a unit id
 * to its property and redirects to the canonical (property-id) URL.
 */
export function propertyHref(
  id: PropertyId | UnitId,
  opts: { edit?: boolean; query?: URLSearchParams | Record<string, string> | string } = {},
): string {
  const base = `/properties/${encodeURIComponent(id)}${opts.edit ? '/edit' : ''}`
  const raw =
    opts.query === undefined
      ? ''
      : typeof opts.query === 'string'
        ? opts.query.replace(/^\?/, '')
        : new URLSearchParams(opts.query).toString()
  return raw ? `${base}?${raw}` : base
}
