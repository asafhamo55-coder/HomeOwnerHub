import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// The service worker keeps signed-in pages for offline use. These tests run
// the real public/sw.js against a fake Cache API and check that a different
// person at the same browser is never answered from them.

const SRC = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8')

type Handler = (event: Record<string, unknown>) => void

function boot() {
  const store = new Map<string, Map<string, Response>>()
  const handlers: Record<string, Handler> = {}
  let online = true
  let nextResponse: () => Response = () => new Response('page', { headers: { 'Content-Type': 'text/html' } })

  const cacheObj = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const m = store.get(name)!
    return {
      put: async (req: Request, res: Response) => void m.set(req.url, res),
      addAll: async () => {},
    }
  }
  const caches = {
    open: async (n: string) => cacheObj(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    match: async (req: Request) => {
      for (const m of store.values()) if (m.has(req.url)) return m.get(req.url)
      return undefined
    },
  }
  const sandbox = {
    self: {
      location: { origin: 'https://app.test' },
      addEventListener: (t: string, h: Handler) => (handlers[t] = h),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: async () => {
      if (!online) throw new Error('offline')
      return nextResponse()
    },
    URL,
    Response,
    Request,
    Promise,
  }
  vm.createContext(sandbox)
  vm.runInContext(SRC, sandbox)

  async function request(path: string, init?: { navigate?: boolean }) {
    const req = new Request(`https://app.test${path}`)
    let responded: Promise<Response> | undefined
    const waits: Promise<unknown>[] = []
    handlers.fetch({
      request: init?.navigate ? Object.assign(req, {}) : req,
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    return responded
  }
  async function message(data: unknown) {
    const waits: Promise<unknown>[] = []
    handlers.message({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }
  return {
    store,
    request,
    message,
    setOnline: (v: boolean) => (online = v),
    setResponse: (f: () => Response) => (nextResponse = f),
  }
}

async function settle() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('service worker runtime cache', () => {
  it('serves a cached page offline for the same session (baseline)', async () => {
    const sw = boot()
    await sw.request('/violations')
    await settle()
    sw.setOnline(false)
    const res = await sw.request('/violations')
    expect(await res!.text()).toBe('page')
  })

  it('drops cached pages when the page asks on sign-out', async () => {
    const sw = boot()
    await sw.request('/violations')
    await settle()
    await sw.message({ type: 'CLEAR_RUNTIME_CACHE' })
    sw.setOnline(false)
    await expect(sw.request('/violations')).rejects.toThrow()
  })

  it('drops cached pages when a sign-in entry point is loaded', async () => {
    const sw = boot()
    await sw.request('/resident/dues')
    await settle()
    await sw.request('/login')
    sw.setOnline(false)
    await expect(sw.request('/resident/dues')).rejects.toThrow()
  })

  it('never stores no-store non-page responses such as exports', async () => {
    const sw = boot()
    sw.setResponse(
      () =>
        new Response('csv', {
          headers: { 'Content-Type': 'text/csv', 'Cache-Control': 'private, no-store' },
        }),
    )
    await sw.request('/export/ledger')
    await settle()
    sw.setOnline(false)
    await expect(sw.request('/export/ledger')).rejects.toThrow()
  })
})
