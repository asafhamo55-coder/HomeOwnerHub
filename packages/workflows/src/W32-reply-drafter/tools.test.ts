import { describe, it, expect } from 'vitest'
import { validateCitations, InvalidCitationError } from './tools'

describe('validateCitations', () => {
  const retrieved = ['doc:c1', 'law:s7', 'prop:context']

  it('accepts citations that were actually retrieved', () => {
    expect(() => validateCitations([{ refId: 'doc:c1' }, { refId: 'law:s7' }], retrieved)).not.toThrow()
  })

  it('REJECTS a refId that was never retrieved — the model invented it', () => {
    expect(() => validateCitations([{ refId: 'doc:c99' }], retrieved)).toThrow(InvalidCitationError)
  })

  it('rejects the whole draft when any one citation is invented', () => {
    expect(() =>
      validateCitations([{ refId: 'doc:c1' }, { refId: 'doc:c99' }], retrieved),
    ).toThrow(InvalidCitationError)
  })

  it('names every invalid refId so the failure is diagnosable', () => {
    try {
      validateCitations([{ refId: 'a' }, { refId: 'b' }], retrieved)
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCitationError)
      expect((error as InvalidCitationError).invalidRefIds.sort()).toEqual(['a', 'b'])
    }
  })

  it('accepts an empty citation list — an acknowledgement-only draft cites nothing', () => {
    expect(() => validateCitations([], retrieved)).not.toThrow()
  })

  it('rejects any citation when nothing was retrieved', () => {
    expect(() => validateCitations([{ refId: 'doc:c1' }], [])).toThrow(InvalidCitationError)
  })
})
