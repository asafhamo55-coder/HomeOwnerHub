/**
 * Loader timing (BL-099, "it takes too much time for data to be shown").
 *
 * Wrap a page's data loader to learn how long it took:
 *
 *   const rows = await timed('/dues', 'dues.list', () => loadDues(orgId))
 *
 * Every timing is a single structured log line — route, loader name, ms,
 * whether it threw. Nothing else: no ids, no arguments, no results, so it
 * can never carry PII (feedback: no PII in script output / logs).
 *
 *   [perf] {"route":"/dues","loader":"dues.list","ms":412,"ok":true,"slow":true}
 *
 * Loaders slower than SLOW_LOADER_MS are logged at info level on every
 * request, so they show up in Vercel's runtime logs without any switch.
 * Faster ones are only logged when PERF_LOG=1 (debug), to keep the log
 * readable.
 *
 * Server-Timing: a server component cannot set response headers, so pages
 * only get the log line. Route handlers (and the middleware) can: collect
 * timings with `perfTimer(route)` and copy them onto the response with
 * `applyServerTiming`. The header shows up in the browser's network panel
 * (Timing tab) with no logging involved.
 */

export const SLOW_LOADER_MS = 300

export interface LoaderTiming {
  route: string
  loader: string
  ms: number
  ok: boolean
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function verbose(): boolean {
  return process.env.PERF_LOG === '1'
}

/** The one log line. Exported for tests; callers use `timed`. */
export function logTiming(t: LoaderTiming): void {
  const slow = t.ms >= SLOW_LOADER_MS
  if (!slow && !verbose()) return
  const line = `[perf] ${JSON.stringify({ route: t.route, loader: t.loader, ms: t.ms, ok: t.ok, slow })}`
  if (slow) console.info(line)
  else console.debug(line)
}

/**
 * Await `fn`, log how long it took, and return (or rethrow) its result
 * unchanged. The loader's own behaviour — its error handling, its return
 * value, Next's redirect/notFound throws — passes straight through.
 */
export async function timed<T>(
  route: string,
  loader: string,
  fn: () => PromiseLike<T> | T,
  sink?: (t: LoaderTiming) => void,
): Promise<T> {
  const start = now()
  let ok = false
  try {
    const result = await fn()
    ok = true
    return result
  } finally {
    const t: LoaderTiming = { route, loader, ms: Math.round(now() - start), ok }
    sink?.(t)
    logTiming(t)
  }
}

/** `name;dur=12` metric names allow only token characters. */
function metricName(loader: string): string {
  return loader.replace(/[^A-Za-z0-9!#$%&'*+\-.^_`|~]/g, '_') || 'loader'
}

/** Format timings as a `Server-Timing` header value. */
export function serverTimingValue(timings: readonly Pick<LoaderTiming, 'loader' | 'ms'>[]): string {
  return timings.map((t) => `${metricName(t.loader)};dur=${t.ms}`).join(', ')
}

/**
 * A per-request collector for route handlers, where a response header can
 * be set. Each `time()` call is logged like `timed`, and remembered for
 * `applyServerTiming`.
 */
export function perfTimer(route: string) {
  const timings: LoaderTiming[] = []
  return {
    time<T>(loader: string, fn: () => PromiseLike<T> | T): Promise<T> {
      return timed(route, loader, fn, (t) => timings.push(t))
    },
    timings(): readonly LoaderTiming[] {
      return timings
    },
    /** Append this request's timings to a response's Server-Timing header. */
    apply<R extends Response>(response: R): R {
      return applyServerTiming(response, timings)
    },
  }
}

export function applyServerTiming<R extends Response>(
  response: R,
  timings: readonly Pick<LoaderTiming, 'loader' | 'ms'>[],
): R {
  if (timings.length === 0) return response
  const value = serverTimingValue(timings)
  try {
    const existing = response.headers.get('Server-Timing')
    response.headers.set('Server-Timing', existing ? `${existing}, ${value}` : value)
  } catch {
    // Immutable headers (a redirect built by Response.redirect): the log
    // line already carries the timing, the header is a convenience.
  }
  return response
}
