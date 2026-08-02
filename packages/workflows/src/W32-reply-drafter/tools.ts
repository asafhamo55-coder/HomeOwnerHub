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
 * Thrown when a citation's refId was genuinely retrieved, but its `quote`
 * does not actually appear in that fragment's text.
 *
 * Membership alone (InvalidCitationError) proves the model didn't invent a
 * refId — it says nothing about whether the quoted text next to that refId
 * is real. A model can cite a real, retrieved refId while attaching a quote
 * lifted from `aiContext` (deliberately excluded from `fragments` — see
 * index.ts) or simply invented outright. That passes membership but is
 * exactly the fabrication risk InvalidCitationError exists to prevent, just
 * moved one level down. Same severity, same hard-throw treatment.
 */
export class UnsupportedQuoteError extends Error {
  constructor(public readonly unsupportedRefIds: string[]) {
    super(
      `Draft cited ${unsupportedRefIds.length} source(s) whose quote does not appear in the retrieved fragment text: ${unsupportedRefIds.join(', ')}`,
    )
    this.name = 'UnsupportedQuoteError'
  }
}

/**
 * Conservative normalisation for quote-fidelity matching: collapse all
 * whitespace runs to a single space, trim, and lowercase.
 *
 * Deliberately NOT doing anything fuzzier (ellipsis-aware splitting, smart
 * -quote folding, punctuation stripping, fuzzy/Levenshtein matching). Every
 * extra normalisation step is a way for a fabricated or paraphrased quote to
 * slip through disguised as a "formatting difference". A false rejection
 * just costs a retry; a false acceptance reaches a resident. Whitespace
 * collapsing only accounts for the model re-wrapping/re-spacing text it
 * copied verbatim, not for reworded content.
 */
function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Every cited refId must appear in what retrieval actually returned, AND
 * the citation's `quote` must actually occur in that refId's fragment text.
 *
 * An empty citation list is valid — an acknowledgement-only draft (spec D5)
 * asserts no facts and therefore cites nothing. An empty (or whitespace
 * -only) `quote` on a present citation is NOT valid: the empty string is a
 * substring of everything, so allowing it would let a citation attach to a
 * real refId without actually quoting anything from it — silently
 * defeating the fidelity check this function exists to add.
 */
export function validateCitations(
  citations: Array<{ refId: string; quote: string }>,
  fragments: Array<{ refId: string; text: string }>,
): void {
  const fragmentTextByRefId = new Map(fragments.map((f) => [f.refId, f.text]))

  const invalidRefIds = citations
    .map((c) => c.refId)
    .filter((refId) => !fragmentTextByRefId.has(refId))
  if (invalidRefIds.length > 0) throw new InvalidCitationError(invalidRefIds)

  const unsupportedRefIds = citations
    .filter((c) => {
      const normalizedQuote = normalizeForQuoteMatch(c.quote)
      if (normalizedQuote.length === 0) return true
      const fragmentText = fragmentTextByRefId.get(c.refId) ?? ''
      return !normalizeForQuoteMatch(fragmentText).includes(normalizedQuote)
    })
    .map((c) => c.refId)
  if (unsupportedRefIds.length > 0) throw new UnsupportedQuoteError(unsupportedRefIds)
}
