// Polling for Stripe's asynchronous transitions (test clocks advancing,
// ACH settling). The sleep is injectable so the logic is unit-tested
// without waiting.

export interface PollOptions {
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Named in the timeout error. */
  what?: string
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function pollUntil<T>(read: () => Promise<T>, done: (v: T) => boolean, opts: PollOptions = {}): Promise<T> {
  const { timeoutMs = 120_000, intervalMs = 2_000, sleep = realSleep, now = Date.now, what = 'condition' } = opts
  const deadline = now() + timeoutMs
  for (;;) {
    const v = await read()
    if (done(v)) return v
    if (now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`)
    await sleep(intervalMs)
  }
}

/** The slice of the SDK advanceClock uses (structural, so tests can fake it). */
export interface ClockApi {
  advance(id: string, params: { frozen_time: number }): Promise<{ status: string }>
  retrieve(id: string): Promise<{ status: string; frozen_time: number }>
}

/**
 * Advance a test clock and wait until Stripe has finished simulating
 * everything up to the new time (status back to 'ready').
 */
export async function advanceClock(clocks: ClockApi, id: string, frozenTime: number, opts: PollOptions = {}) {
  await clocks.advance(id, { frozen_time: frozenTime })
  const clock = await pollUntil(
    () => clocks.retrieve(id),
    (c) => c.status === 'ready' || c.status === 'internal_failure',
    { what: `test clock ${id} to finish advancing`, ...opts },
  )
  if (clock.status !== 'ready') throw new Error(`test clock ${id} ended in status ${clock.status}`)
  return clock
}

export const DAY = 86_400
