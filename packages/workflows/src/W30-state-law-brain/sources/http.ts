import type { HttpGetter, HttpResponse } from './types'

/**
 * The only code in the ingestion pipeline that touches the network.
 *
 * Politeness, per the official sources' published rules:
 *   - flsenate.gov/robots.txt (checked 2026-10-15) allows /Laws/ and sets
 *     `Crawl-delay: 10`. This getter waits at least `minIntervalMs` between
 *     requests to the same host (default 10s), so it honours that even if a
 *     future adapter makes several requests in one run.
 *   - an identifying User-Agent, so the operator can tell who is calling.
 *   - redirects are NOT followed: flsenate.gov answers an unpublished
 *     edition year with a 302 to its index page, and following it would
 *     turn "this year is not out yet" into a 200 with no statutes in it.
 *
 * Unit and integration tests never construct this; they inject a getter
 * that serves recorded fixtures.
 */
export interface PoliteGetterOptions {
  minIntervalMs?: number
  timeoutMs?: number
  userAgent?: string
  /** Injectable for tests of the throttle itself. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  fetchImpl?: typeof fetch
}

export const DEFAULT_USER_AGENT =
  'HomeownerHub-StateLawIngest/1.0 (weekly HOA statute refresh; one request per chapter)'

export function createPoliteGetter(opts: PoliteGetterOptions = {}): HttpGetter {
  const minIntervalMs = opts.minIntervalMs ?? 10_000
  const timeoutMs = opts.timeoutMs ?? 30_000
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? (() => Date.now())
  const fetchImpl = opts.fetchImpl ?? fetch
  const lastRequestAt = new Map<string, number>()

  return {
    async get(url: string): Promise<HttpResponse> {
      const host = new URL(url).host
      const last = lastRequestAt.get(host)
      if (last !== undefined) {
        const wait = last + minIntervalMs - now()
        if (wait > 0) await sleep(wait)
      }
      lastRequestAt.set(host, now())

      const res = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: 'text/html' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const body = res.status >= 300 && res.status < 400 ? '' : await res.text()
      return { status: res.status, url, body }
    },
  }
}
