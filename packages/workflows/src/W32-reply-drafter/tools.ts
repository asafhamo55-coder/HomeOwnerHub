/**
 * Thrown when a draft cites a source that was never retrieved.
 *
 * This is the strongest guarantee in Phase B and the reason it is a hard
 * throw rather than a warning: a fabricated citation is worse than no
 * citation, because it is specifically designed to survive review. A board
 * member who sees "CC&Rs §4.2" beside a sentence will believe the sentence.
 */
export class InvalidCitationError extends Error {
  constructor(public readonly invalidRefIds: string[]) {
    super(
      `Draft cited ${invalidRefIds.length} source(s) that were not retrieved: ${invalidRefIds.join(', ')}`,
    )
    this.name = 'InvalidCitationError'
  }
}

/**
 * Every cited refId must appear in what retrieval actually returned.
 *
 * An empty citation list is valid — an acknowledgement-only draft (spec D5)
 * asserts no facts and therefore cites nothing.
 */
export function validateCitations(
  citations: Array<{ refId: string }>,
  retrievedRefIds: string[],
): void {
  const known = new Set(retrievedRefIds)
  const invalid = citations.map((c) => c.refId).filter((refId) => !known.has(refId))
  if (invalid.length > 0) throw new InvalidCitationError(invalid)
}
