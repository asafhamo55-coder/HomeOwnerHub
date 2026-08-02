import { describe, it, expect } from 'vitest'
import { validateCitations, InvalidCitationError, UnsupportedQuoteError } from './tools'

describe('validateCitations', () => {
  const fragments = [
    { refId: 'doc:c1', text: 'The by-laws say... members must pay dues. This is real information from the bylaws.' },
    { refId: 'law:s7', text: 'State law section 7 requires 30 days written notice before a lien.' },
    { refId: 'prop:context', text: 'Unit 4B, owner John Smith, balance $450.' },
  ]

  it('accepts citations that were actually retrieved', () => {
    expect(() =>
      validateCitations(
        [
          { refId: 'doc:c1', quote: 'the by-laws say...' },
          { refId: 'law:s7', quote: '30 days written notice' },
        ],
        fragments,
      ),
    ).not.toThrow()
  })

  it('REJECTS a refId that was never retrieved — the model invented it', () => {
    expect(() => validateCitations([{ refId: 'doc:c99', quote: 'anything' }], fragments)).toThrow(
      InvalidCitationError,
    )
  })

  it('rejects the whole draft when any one citation is invented', () => {
    expect(() =>
      validateCitations(
        [
          { refId: 'doc:c1', quote: 'real information' },
          { refId: 'doc:c99', quote: 'anything' },
        ],
        fragments,
      ),
    ).toThrow(InvalidCitationError)
  })

  it('names every invalid refId so the failure is diagnosable', () => {
    try {
      validateCitations(
        [
          { refId: 'a', quote: 'x' },
          { refId: 'b', quote: 'y' },
        ],
        fragments,
      )
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCitationError)
      expect((error as InvalidCitationError).invalidRefIds.sort()).toEqual(['a', 'b'])
    }
  })

  it('accepts an empty citation list — an acknowledgement-only draft cites nothing', () => {
    expect(() => validateCitations([], fragments)).not.toThrow()
  })

  it('rejects any citation when nothing was retrieved', () => {
    expect(() => validateCitations([{ refId: 'doc:c1', quote: 'real' }], [])).toThrow(InvalidCitationError)
  })

  // ── Quote fidelity: refId membership alone is not enough ────────────

  it('accepts a quote genuinely present in its cited fragment (whitespace/case normalised)', () => {
    expect(() =>
      validateCitations(
        [{ refId: 'law:s7', quote: '  30  DAYS   written\nnotice  ' }],
        fragments,
      ),
    ).not.toThrow()
  })

  it('REJECTS a quote absent from its cited fragment entirely', () => {
    expect(() =>
      validateCitations([{ refId: 'law:s7', quote: 'this text is nowhere in the fragment' }], fragments),
    ).toThrow(UnsupportedQuoteError)
  })

  it('REJECTS a quote lifted from a DIFFERENT fragment than the one cited — real refId, wrong source', () => {
    // The quote is real text, but it belongs to prop:context, not law:s7.
    expect(() =>
      validateCitations([{ refId: 'law:s7', quote: 'John Smith, balance $450' }], fragments),
    ).toThrow(UnsupportedQuoteError)
  })

  it('REJECTS an empty quote — the empty string is a substring of everything, so it must not vacuously pass', () => {
    expect(() => validateCitations([{ refId: 'doc:c1', quote: '' }], fragments)).toThrow(UnsupportedQuoteError)
  })

  it('REJECTS a whitespace-only quote for the same reason as an empty quote', () => {
    expect(() => validateCitations([{ refId: 'doc:c1', quote: '   \n\t  ' }], fragments)).toThrow(
      UnsupportedQuoteError,
    )
  })

  it('names every refId whose quote failed fidelity', () => {
    try {
      validateCitations(
        [
          { refId: 'doc:c1', quote: 'not in this fragment' },
          { refId: 'law:s7', quote: 'also not in this fragment' },
        ],
        fragments,
      )
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedQuoteError)
      expect((error as UnsupportedQuoteError).unsupportedRefIds.sort()).toEqual(['doc:c1', 'law:s7'])
    }
  })

  it('checks refId membership before quote fidelity — an invented refId fails as InvalidCitationError, not UnsupportedQuoteError', () => {
    expect(() =>
      validateCitations(
        [
          { refId: 'doc:c1', quote: 'not in this fragment either' },
          { refId: 'doc:invented', quote: 'fake' },
        ],
        fragments,
      ),
    ).toThrow(InvalidCitationError)
  })
})
