import { describe, expect, it } from 'vitest'
import { stateLawAskGate } from './state-law-gate'

describe('stateLawAskGate (/legal/ask)', () => {
  it.each([
    ['FL', 'Florida'],
    ['CA', 'California'],
    ['TX', 'Texas'],
  ] as const)('%s with no statutes on file: says plainly it is not loaded, and offers no question box', (state, name) => {
    const gate = stateLawAskGate(state, 0)
    expect(gate.kind).toBe('not_loaded')
    if (gate.kind !== 'not_loaded') return
    expect(gate.title).toBe(`${name} state law isn’t loaded yet`)
    expect(gate.description).toContain('never from general knowledge')
  })

  it('a state with statutes on file gets the question box', () => {
    expect(stateLawAskGate('GA', 27)).toEqual({ kind: 'ready', state: 'GA' })
    expect(stateLawAskGate('FL', 36)).toEqual({ kind: 'ready', state: 'FL' })
  })

  it('no supported state is its own case', () => {
    expect(stateLawAskGate(null, 0)).toEqual({ kind: 'unsupported' })
  })
})
