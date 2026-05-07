/**
 * The eviction_cases.county column is constrained to one of these slugs
 * by the schema. This helper turns a slug back into a human-readable
 * label for display, falling back to the slug itself for any unrecognized
 * value (so we never crash when a new county is added to the constraint
 * before this map is updated).
 */
const LABELS: Record<string, string> = {
  harris_tx: 'Harris County',
  san_bernardino_ca: 'San Bernardino County',
  king_wa: 'King County',
}

export function formatCounty(slug: string | null | undefined): string {
  if (!slug) return '—'
  return LABELS[slug] ?? slug
}
