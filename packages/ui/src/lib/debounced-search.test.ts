import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedSearch, type SearchState } from './debounced-search'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let states: Array<SearchState<string>>
let calls: Array<{ q: string; signal: AbortSignal; d: ReturnType<typeof deferred<string>> }>

function setup(delayMs = 200, minLength = 2) {
  return createDebouncedSearch<string>({
    delayMs,
    minLength,
    search: (q, signal) => {
      const d = deferred<string>()
      calls.push({ q, signal, d })
      return d.promise
    },
    onState: (s) => states.push(s),
  })
}

const flush = () => new Promise((r) => setImmediate(r))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  states = []
  calls = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createDebouncedSearch', () => {
  it('stays idle below the minimum length and never searches', () => {
    const s = setup()
    s.update('k')
    vi.advanceTimersByTime(1000)
    expect(calls).toHaveLength(0)
    expect(states.at(-1)).toEqual({ status: 'idle' })
  })

  it('debounces: one request for a burst of keystrokes, with the last query', () => {
    const s = setup()
    s.update('ka')
    s.update('kau')
    s.update('kaur')
    vi.advanceTimersByTime(199)
    expect(calls).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(calls.map((c) => c.q)).toEqual(['kaur'])
  })

  it('reports loading as soon as a searchable query is typed', () => {
    const s = setup()
    s.update('kaur')
    expect(states.at(-1)).toEqual({ status: 'loading', query: 'kaur' })
  })

  it('trims the query', () => {
    const s = setup()
    s.update('  kaur ')
    vi.advanceTimersByTime(200)
    expect(calls[0].q).toBe('kaur')
  })

  it('reports ready with the results', async () => {
    const s = setup()
    s.update('kaur')
    vi.advanceTimersByTime(200)
    calls[0].d.resolve('R1')
    await flush()
    expect(states.at(-1)).toEqual({ status: 'ready', query: 'kaur', results: 'R1' })
  })

  it('aborts the in-flight request and ignores its late answer when the query changes', async () => {
    const s = setup()
    s.update('kau')
    vi.advanceTimersByTime(200)
    s.update('kaur')
    expect(calls[0].signal.aborted).toBe(true)
    vi.advanceTimersByTime(200)
    calls[1].d.resolve('NEW')
    calls[0].d.resolve('STALE')
    await flush()
    expect(states.filter((x) => x.status === 'ready')).toEqual([{ status: 'ready', query: 'kaur', results: 'NEW' }])
  })

  it('reports an error truthfully (not as "no results")', async () => {
    const s = setup()
    s.update('kaur')
    vi.advanceTimersByTime(200)
    calls[0].d.reject(new Error('Network down'))
    await flush()
    expect(states.at(-1)).toEqual({ status: 'error', query: 'kaur', message: 'Network down' })
  })

  it('does not report an abort as an error', async () => {
    const s = setup()
    s.update('kaur')
    vi.advanceTimersByTime(200)
    s.cancel()
    calls[0].d.reject(new DOMException('aborted', 'AbortError'))
    await flush()
    expect(states.some((x) => x.status === 'error')).toBe(false)
    expect(states.at(-1)).toEqual({ status: 'idle' })
  })

  it('going back below the minimum cancels a pending search', () => {
    const s = setup()
    s.update('kaur')
    s.update('k')
    vi.advanceTimersByTime(500)
    expect(calls).toHaveLength(0)
    expect(states.at(-1)).toEqual({ status: 'idle' })
  })
})
