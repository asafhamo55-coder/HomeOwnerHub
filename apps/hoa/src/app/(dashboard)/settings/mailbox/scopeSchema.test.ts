import { describe, expect, it } from 'vitest'
import { ScopeSchema } from './scopeSchema'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function parse(scopeMode: string, scopeValue: string | undefined) {
  return ScopeSchema.safeParse({ accountId: ACCOUNT_ID, scopeMode, scopeValue })
}

describe('ScopeSchema — cross-field mode/value validation', () => {
  it('accepts address mode with a valid email', () => {
    const result = parse('address', 'board@madisonparkhoa.org')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.scopeValue).toBe('board@madisonparkhoa.org')
  })

  it('rejects address mode carrying a Gmail label id', () => {
    const result = parse('address', 'Label_9')
    expect(result.success).toBe(false)
  })

  it('rejects label mode carrying an email address (the critical bug)', () => {
    // The exact scenario from Finding 1: the picker's shared `value`
    // state still holds a stale address after the user switched the
    // radio to "label" mode. The server must reject this pairing on its
    // own, independent of the client-side reset.
    const result = parse('label', 'board@madisonparkhoa.org')
    expect(result.success).toBe(false)
  })

  it('accepts label mode with a valid label id', () => {
    const result = parse('label', 'Label_9')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.scopeValue).toBe('Label_9')
  })

  it.each(['address', 'label'] as const)(
    'rejects %s mode with an empty value',
    (mode) => {
      const result = parse(mode, '')
      expect(result.success).toBe(false)
    },
  )

  it.each(['address', 'label'] as const)(
    'rejects %s mode with a whitespace-only value',
    (mode) => {
      const result = parse(mode, '   ')
      expect(result.success).toBe(false)
    },
  )

  it('accepts all mode with no value', () => {
    const result = parse('all', undefined)
    expect(result.success).toBe(true)
  })

  it('accepts a +-tagged address', () => {
    const result = parse('address', 'hoa+board@madisonparkhoa.org')
    expect(result.success).toBe(true)
  })

  it('accepts a subdomain address', () => {
    const result = parse('address', 'board@mail.madisonparkhoa.org')
    expect(result.success).toBe(true)
  })
})
