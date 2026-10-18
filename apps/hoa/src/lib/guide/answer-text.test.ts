import { describe, expect, it } from 'vitest'
import { answerBlocks, answerPieces } from './answer-text'

describe('answer text', () => {
  it('splits citations and control chips out of a line', () => {
    expect(answerPieces('Select [[Mark paid]] on the row. [1]')).toEqual([
      { t: 'text', v: 'Select ' },
      { t: 'ui', label: 'Mark paid' },
      { t: 'text', v: ' on the row. ' },
      { t: 'cite', n: 1 },
    ])
  })

  it('groups consecutive numbered lines into one steps block', () => {
    const b = answerBlocks('To record it:\n1. Open Dues. [1]\n2) Select [[Mark paid]]. [1]\n\nThat is all. [2]')
    expect(b.map((x) => x.t)).toEqual(['p', 'steps', 'p'])
    expect(b[1]!.t === 'steps' && b[1]!.items.length).toBe(2)
  })

  it('treats plain text as text, with no markup interpretation', () => {
    expect(answerPieces('<b>x</b>')).toEqual([{ t: 'text', v: '<b>x</b>' }])
  })
})
