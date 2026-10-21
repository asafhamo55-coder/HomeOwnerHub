import { describe, expect, it } from 'vitest'
import { minutesBlocks } from './minutes-blocks'

describe('minutesBlocks', () => {
  it('keeps a numbered agenda one block across a stray blank line', () => {
    const text = '1. Approve the minutes\n2. Treasurer’s report\n3. Pool resurfacing\n\n4. Open violations\n5. Owner comments'
    expect(minutesBlocks(text)).toEqual(['1. Approve the minutes\n2. Treasurer’s report\n3. Pool resurfacing\n4. Open violations\n5. Owner comments'])
  })

  it('still splits prose paragraphs, and prose from a list', () => {
    expect(minutesBlocks('Called to order.\n\nQuorum present.\n\n- Item one\n\n- Item two')).toEqual([
      'Called to order.',
      'Quorum present.',
      '- Item one\n- Item two',
    ])
  })

  it('handles CRLF and empty text', () => {
    expect(minutesBlocks('a\r\n\r\nb')).toEqual(['a', 'b'])
    expect(minutesBlocks('')).toEqual([])
  })
})
