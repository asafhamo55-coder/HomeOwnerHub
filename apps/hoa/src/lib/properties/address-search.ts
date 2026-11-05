import { formatStreetOnly } from './address-format'
import { escapeLikePattern } from './resolve'

/**
 * A PostgREST `.or()` filter that finds an address both ways.
 *
 * New addresses are saved in the standard format ("123 Main St"), older ones
 * may still say "Main Street", so a search looks for what was typed AND for
 * its standard form. The second pattern is skipped when it is identical.
 *
 * Characters PostgREST reads inside `or()` (`,` `(` `)` `*` and quotes) are
 * turned into spaces first, and LIKE wildcards are escaped, so a term can
 * change what is matched but never the shape of the query.
 *
 * Returns null when nothing is left to search for.
 */
export function addressOrFilter(column: string, term: string): string | null {
  const typed = term.replace(/[,()*"]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!typed) return null
  const patterns = [typed]
  const standard = formatStreetOnly(typed)
  if (standard && standard !== typed) patterns.push(standard)
  return patterns.map((p) => `${column}.ilike.%${escapeLikePattern(p)}%`).join(',')
}
