// Friendly names for the assessment_type values (regular | special |
// late_fee | fine). Unknown types fall back to a humanized slug.
//
// This lives on its own rather than in assessments.ts because that file
// is 'use server' — Next only permits async function exports there, so a
// plain const would fail the build.

export const CHARGE_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular dues',
  special: 'Special assessment',
  late_fee: 'Late fee',
  fine: 'Fine',
}

export function chargeTypeLabel(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
