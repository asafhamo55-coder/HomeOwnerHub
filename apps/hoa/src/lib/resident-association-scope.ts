/**
 * The associations a signed-in resident belongs to, taken from their own
 * units. Pure, so server loaders and tests share one definition.
 *
 * Rows tied to another association are never shown; rows with no
 * association at all are organization-wide and stay visible.
 */
export function ownAssociationIds(units: ReadonlyArray<{ association_id: string | null }>): string[] {
  return [...new Set(units.map((u) => u.association_id).filter((id): id is string => !!id))]
}

/** True when a row's association is the resident's own, or the row is organization-wide. */
export function inResidentAssociations(
  associationId: string | null | undefined,
  allowed: ReadonlySet<string> | readonly string[],
): boolean {
  if (associationId == null) return true
  return (allowed instanceof Set ? allowed : new Set(allowed)).has(associationId)
}
