import { describe, expect, it } from 'vitest'
import { resolveCorrespondenceState } from './correspondence-state'
import type { CorrespondenceThreadSummary } from '@/lib/inbox/queries'

const thread: CorrespondenceThreadSummary = {
  id: 'thread-1',
  subject: 'Leaky faucet',
  status: 'open',
  lastMessageAt: '2026-07-01T12:00:00Z',
}

describe('resolveCorrespondenceState', () => {
  it('resolves to "unlinked" when there is no bridged unit — outcome is never even attempted', () => {
    expect(resolveCorrespondenceState(null, null)).toEqual({ kind: 'unlinked' })
  })

  it('resolves to "error" on a rejected read — NOT "empty" — this is the core fix: a failed read must never render as "no correspondence"', () => {
    const rejected: PromiseSettledResult<CorrespondenceThreadSummary[]> = {
      status: 'rejected',
      reason: new Error('listThreadsForUnit: failed to load correspondence: boom'),
    }

    const state = resolveCorrespondenceState('unit-1', rejected)

    expect(state).toEqual({ kind: 'error' })
    expect(state.kind).not.toBe('empty')
  })

  it('resolves to "empty" on a fulfilled read with zero threads', () => {
    const fulfilled: PromiseSettledResult<CorrespondenceThreadSummary[]> = {
      status: 'fulfilled',
      value: [],
    }

    expect(resolveCorrespondenceState('unit-1', fulfilled)).toEqual({ kind: 'empty' })
  })

  it('resolves to "loaded" with the threads on a fulfilled read with results', () => {
    const fulfilled: PromiseSettledResult<CorrespondenceThreadSummary[]> = {
      status: 'fulfilled',
      value: [thread],
    }

    expect(resolveCorrespondenceState('unit-1', fulfilled)).toEqual({
      kind: 'loaded',
      threads: [thread],
    })
  })

  it('a unitId with a null outcome (defensive: should not happen in practice) still reads as "unlinked" rather than crashing', () => {
    expect(resolveCorrespondenceState('unit-1', null)).toEqual({ kind: 'unlinked' })
  })

  it('every state is distinguished by `kind`, not a boolean, so all four are pairwise distinct', () => {
    const states = [
      resolveCorrespondenceState(null, null),
      resolveCorrespondenceState('unit-1', { status: 'rejected', reason: new Error('x') }),
      resolveCorrespondenceState('unit-1', { status: 'fulfilled', value: [] }),
      resolveCorrespondenceState('unit-1', { status: 'fulfilled', value: [thread] }),
    ]
    const kinds = states.map((s) => s.kind)
    expect(new Set(kinds).size).toBe(4)
  })
})
