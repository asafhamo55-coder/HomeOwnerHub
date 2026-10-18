import { describe, expect, it } from 'vitest'
import { inspectHomes } from './homes'

describe('inspectHomes', () => {
  it('offers each home under its unit id (what W3 takes), sorted by address', () => {
    const r = inspectHomes(
      [
        { id: 'p2', address: '20 Oak St', unit_number: null },
        { id: 'p1', address: '4 Oak St', unit_number: 'B' },
        { id: 'p3', address: '9 Elm Ct', unit_number: null },
      ],
      new Map([
        ['p1', 'u1'],
        ['p2', 'u2'],
      ]),
    )
    expect(r.homes).toEqual([
      { id: 'u1', address: '4 Oak St', unit_number: 'B' },
      { id: 'u2', address: '20 Oak St', unit_number: null },
    ])
    expect(r.unlinked).toBe(1)
  })

  it('no homes → nothing to offer, nothing unlinked', () => {
    expect(inspectHomes([], new Map())).toEqual({ homes: [], unlinked: 0 })
  })
})
