import { describe, expect, it } from 'vitest'
import { normalizeStatuteBody, statuteContentHash } from './normalize'

describe('statuteContentHash', () => {
  const base = '(1) The board shall meet.\n\n(2) Records are open.'

  it('is a 64-char hex SHA-256', () => {
    expect(statuteContentHash(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  // The hash must not fire on presentation: the source wraps text in em
  // spaces, NBSPs and CRLFs that vary between renderings of the same law.
  it('ignores whitespace and line-ending presentation', () => {
    const noisy = '  (1) The  board shall meet.\r\n\r\n\r\n(2) Records\tare open.  \n'
    expect(statuteContentHash(noisy)).toBe(statuteContentHash(base))
  })

  it('treats composed and decomposed characters as the same text', () => {
    expect(statuteContentHash('café')).toBe(statuteContentHash('café'))
  })

  // ...but it must fire on any change to the words.
  it('changes when one word changes', () => {
    expect(statuteContentHash(base.replace('shall', 'may'))).not.toBe(statuteContentHash(base))
  })

  it('changes when punctuation changes (verbatim means verbatim)', () => {
    expect(statuteContentHash(base.replace('meet.', 'meet;'))).not.toBe(statuteContentHash(base))
  })
})

describe('normalizeStatuteBody', () => {
  it('is idempotent', () => {
    const once = normalizeStatuteBody(' a \n\n b​ c ')
    expect(normalizeStatuteBody(once)).toBe(once)
    expect(once).toBe('a\n\nb c')
  })
})
