import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/inngest is the one route the conventions skill exempts from RC-10
 * (withRoute): the Inngest SDK's serve() owns GET/POST/PUT, the signature
 * check and the response bodies. What this suite pins instead is the part
 * that IS ours: the request is authenticated by the SDK's signing check
 * (RC-7: provider signatures keep their SDK check), it fails closed, and
 * the route mounts every job on the shared client.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

const unsignedPost = () =>
  new Request('https://hoa.test/api/inngest?fnId=homeownerhub-mailbox-send&stepId=step', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: { name: 'x', data: {} }, ctx: {}, steps: {} }),
  })

async function loadRoute() {
  vi.resetModules()
  return import('./route')
}

describe('/api/inngest', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses an unsigned invocation in cloud mode (no job runs without a valid Inngest signature)', async () => {
    vi.stubEnv('INNGEST_DEV', '0')
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey-prod-' + 'a'.repeat(64))
    const { POST } = await loadRoute()
    const res = await POST(unsignedPost() as never, undefined as never)
    expect(res.status).toBe(401)
  }, 20_000)

  it('fails closed in cloud mode when the signing key is unset', async () => {
    vi.stubEnv('INNGEST_DEV', '0')
    vi.stubEnv('INNGEST_SIGNING_KEY', '')
    const { POST } = await loadRoute()
    const res = await POST(unsignedPost() as never, undefined as never)
    expect(res.status).toBe(401)
  }, 20_000)

  it('gives background work the 60s ceiling', async () => {
    const { maxDuration } = await loadRoute()
    expect(maxDuration).toBe(60)
  })

  it('mounts every job the jobs package exports', async () => {
    const serve = vi.fn(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }))
    vi.resetModules()
    vi.doMock('inngest/next', () => ({ serve }))
    try {
      await import('./route')
      const jobs = await import('@homeowner-portal/jobs')
      expect(serve).toHaveBeenCalledTimes(1)
      const opts = (serve.mock.calls[0] as unknown as [{ client: unknown; functions: unknown[] }])[0]
      expect(opts.client).toBe(jobs.inngest)

      const ids = (opts.functions as Array<{ id: (prefix?: string) => string }>).map((f) => f.id())
      expect(new Set(ids).size).toBe(ids.length)

      // Every directly exported job object is mounted (the three factory-built
      // jobs — daily digest, dues reminders and the month-end board report —
      // are built in the route).
      const exported = Object.entries(jobs)
        .filter(([name]) => name.endsWith('Job') && !name.startsWith('create'))
        .map(([, fn]) => fn)
      for (const fn of exported) expect(opts.functions).toContain(fn)
      expect(opts.functions.length).toBe(exported.length + 3)
      expect(ids).toContain('monthly-board-report')
    } finally {
      vi.doUnmock('inngest/next')
    }
  })

  it('documents who calls it accurately (Stripe posts to /api/webhooks/stripe, not here — C-18)', () => {
    const src = readFileSync(path.join(here, 'route.ts'), 'utf8')
    expect(src).not.toMatch(/Stripe POSTs to \/api\/inngest/)
    expect(src).not.toMatch(/Webhooks \(which Stripe/)
  })
})
