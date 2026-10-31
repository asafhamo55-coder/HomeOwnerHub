/**
 * Pure helpers shared by materializeCurrentPeriodAssessments and its
 * preview (previewMaterialize), so the two cannot drift. Display and
 * selection only; no amounts, postings or I/O here.
 */

/** Dues are due on the 15th of the fiscal period's start month. */
export function materializeDueDate(periodStartDate: string): string {
  return `${periodStartDate.slice(0, 7)}-15`
}

/** The units a run would bill, and the ones it would skip as already billed. */
export function planMaterialize<U extends { id: string }>(
  units: readonly U[],
  billedUnitIds: Iterable<string | null>,
): { toBill: U[]; alreadyBilled: number } {
  const have = new Set(billedUnitIds)
  const toBill = units.filter((u) => !have.has(u.id))
  return { toBill, alreadyBilled: units.length - toBill.length }
}
