/** The associations a resident's homes belong to; ballots outside them are not theirs to see. */
export function residentAssociationIds(units: Array<{ association_id: string | null }>): string[] {
  return [...new Set(units.map((u) => u.association_id).filter((id): id is string => id != null))]
}
