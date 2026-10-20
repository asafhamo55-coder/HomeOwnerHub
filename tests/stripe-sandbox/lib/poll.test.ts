import { describe, expect, it } from 'vitest'
import { advanceClock, pollUntil, type ClockApi } from './poll'

function fakeTime() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => void (t += ms) }
}

describe('pollUntil', () => {
  it('returns the first value that satisfies the predicate', async () => {
    const vals = ['processing', 'processing', 'succeeded']
    const time = fakeTime()
    const v = await pollUntil(async () => vals.shift()!, (s) => s !== 'processing', { ...time, intervalMs: 10 })
    expect(v).toBe('succeeded')
    expect(time.now()).toBe(20)
  })

  it('times out with the name of what it waited for', async () => {
    const time = fakeTime()
    await expect(pollUntil(async () => 1, () => false, { ...time, timeoutMs: 50, intervalMs: 10, what: 'ACH to settle' })).rejects.toThrow(
      /Timed out after 50ms waiting for ACH to settle/,
    )
  })
})

describe('advanceClock', () => {
  function fakeClocks(statuses: string[]) {
    const advanced: number[] = []
    const api: ClockApi = {
      async advance(_id, p) {
        advanced.push(p.frozen_time)
        return { status: 'advancing' }
      },
      async retrieve() {
        return { status: statuses.shift() ?? 'ready', frozen_time: advanced.at(-1) ?? 0 }
      },
    }
    return { api, advanced }
  }

  it('advances, then waits for ready', async () => {
    const f = fakeClocks(['advancing', 'advancing', 'ready'])
    const c = await advanceClock(f.api, 'clock_1', 1_000, { ...fakeTime(), intervalMs: 1 })
    expect(f.advanced).toEqual([1_000])
    expect(c).toEqual({ status: 'ready', frozen_time: 1_000 })
  })

  it('throws on internal_failure instead of hanging', async () => {
    const f = fakeClocks(['advancing', 'internal_failure'])
    await expect(advanceClock(f.api, 'clock_1', 1_000, { ...fakeTime(), intervalMs: 1 })).rejects.toThrow(/internal_failure/)
  })
})
