import { describe, expect, it } from 'vitest'
import { createPoliteGetter, DEFAULT_USER_AGENT } from './http'

/** A fake fetch + clock: no network, no real waiting. */
function harness(status = 200) {
  let clock = 1_000_000
  const sleeps: number[] = []
  const requests: { url: string; init: RequestInit | undefined; at: number }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init, at: clock })
    return new Response(status === 200 ? '<html>ok</html>' : null, { status })
  }) as unknown as typeof fetch
  const getter = createPoliteGetter({
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
  })
  return { getter, sleeps, requests, advance: (ms: number) => (clock += ms) }
}

describe('createPoliteGetter', () => {
  // flsenate.gov/robots.txt: Crawl-delay: 10
  it('spaces requests to one host by at least 10 seconds', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    h.advance(3_000)
    await h.getter.get('https://www.flsenate.gov/b')
    expect(h.sleeps).toEqual([7_000])
    expect(h.requests[1].at - h.requests[0].at).toBe(10_000)
  })

  it('does not throttle different hosts against each other', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    await h.getter.get('https://downloads.example.test/b')
    expect(h.sleeps).toEqual([])
  })

  it('identifies itself and does not follow redirects', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    const init = h.requests[0].init!
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(DEFAULT_USER_AGENT)
    expect(init.redirect).toBe('manual')
  })

  it('reports a redirect as its status with no body', async () => {
    const h = harness(302)
    const res = await h.getter.get('https://www.flsenate.gov/Laws/Statutes/2027/Chapter720/All')
    expect(res.status).toBe(302)
    expect(res.body).toBe('')
  })
})
