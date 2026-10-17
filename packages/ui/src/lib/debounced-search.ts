/**
 * Debounced, abortable search-as-you-type. Framework-free so it is unit
 * testable; CommandPalette drives it from its input.
 *
 * - Below `minLength` the state is `idle` and nothing is requested.
 * - A searchable query reports `loading` immediately (the palette shows
 *   "Searching…" rather than a stale or empty list), then requests once the
 *   typing pauses for `delayMs`.
 * - A newer query aborts the in-flight request; a late answer to an old
 *   query is dropped, so results never flash back to a previous term.
 * - A failure is `error`, never an empty `ready` — "couldn't search" and
 *   "nothing matches" are different answers.
 */

export type SearchState<T> =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: T }
  | { status: 'error'; query: string; message: string }

export interface DebouncedSearchOptions<T> {
  search: (query: string, signal: AbortSignal) => Promise<T>
  onState: (state: SearchState<T>) => void
  delayMs?: number
  minLength?: number
}

export interface DebouncedSearch {
  update: (query: string) => void
  /** Drop any pending or in-flight request and go idle. */
  cancel: () => void
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError'
}

export function createDebouncedSearch<T>({
  search,
  onState,
  delayMs = 200,
  minLength = 2,
}: DebouncedSearchOptions<T>): DebouncedSearch {
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null

  function stop() {
    if (timer) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
  }

  function update(raw: string) {
    const query = raw.trim()
    stop()
    if (query.length < minLength) {
      onState({ status: 'idle' })
      return
    }
    onState({ status: 'loading', query })
    timer = setTimeout(() => {
      timer = null
      const c = new AbortController()
      controller = c
      search(query, c.signal).then(
        (results) => {
          if (c.signal.aborted) return
          controller = null
          onState({ status: 'ready', query, results })
        },
        (err: unknown) => {
          if (c.signal.aborted || isAbort(err)) return
          controller = null
          const message = err instanceof Error && err.message ? err.message : 'Search failed.'
          onState({ status: 'error', query, message })
        },
      )
    }, delayMs)
  }

  return {
    update,
    cancel() {
      stop()
      onState({ status: 'idle' })
    },
  }
}
