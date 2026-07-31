import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from './resolve'

describe('escapeLikePattern', () => {
  it('leaves a plain address unchanged', () => {
    expect(escapeLikePattern('john.doe@example.com')).toBe('john.doe@example.com')
  })

  it('escapes an underscore', () => {
    expect(escapeLikePattern('john_doe@example.com')).toBe('john\\_doe@example.com')
  })

  it('escapes a percent sign', () => {
    expect(escapeLikePattern('100%done@example.com')).toBe('100\\%done@example.com')
  })

  it('escapes a literal backslash', () => {
    expect(escapeLikePattern('back\\slash@example.com')).toBe('back\\\\slash@example.com')
  })

  it('escapes backslash before underscore/percent so the result does not double-escape', () => {
    // If underscore/percent were escaped before the backslash, the
    // backslashes just inserted for them would themselves get escaped
    // again, corrupting the pattern.
    expect(escapeLikePattern('a\\_b')).toBe('a\\\\\\_b')
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b')
  })
})
