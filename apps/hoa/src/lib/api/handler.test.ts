import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { ApiRouteError } from './errors'
import { withRoute } from './handler'

const req = () => new Request('http://x/api/thing', { method: 'POST' })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('withRoute', () => {
  it('returns the handler response untouched', async () => {
    const GET = withRoute('thing', async () => Response.json({ ok: true }, { status: 201 }))
    const res = await GET(req())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('turns a thrown ApiRouteError into its envelope', async () => {
    const POST = withRoute('thing', async () => {
      throw new ApiRouteError('forbidden', 'Board only.')
    })
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: 'Board only.' } })
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('turns any other throw into a generic JSON 500 and never echoes its text', async () => {
    const POST = withRoute('thing', async () => {
      throw new Error('relation "secret_table" does not exist; owner jane@example.com')
    })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const text = await res.text()
    expect(text).not.toMatch(/secret_table|jane@example\.com/)
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('logs the route name and error code only, never the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const POST = withRoute('thing', async () => {
      throw Object.assign(new Error('owner jane@example.com'), { code: '23505' })
    })
    await POST(req())
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('api:thing')
    expect(logged).toContain('23505')
    expect(logged).not.toContain('jane@example.com')
  })

  it('rethrows Next control-flow errors (redirect / notFound / dynamic usage)', async () => {
    for (const digest of ['NEXT_REDIRECT;replace;/login;307;', 'NEXT_HTTP_ERROR_FALLBACK;404', 'DYNAMIC_SERVER_USAGE']) {
      const POST = withRoute('thing', async () => {
        throw Object.assign(new Error('control'), { digest })
      })
      await expect(POST(req())).rejects.toMatchObject({ digest })
    }
  })

  it('passes the route context (dynamic params) through', async () => {
    const GET = withRoute('thing', async (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
      Response.json({ id: (await ctx.params).id }),
    )
    const res = await GET(req(), { params: Promise.resolve({ id: 'abc' }) })
    expect(await res.json()).toEqual({ id: 'abc' })
  })

  it('catches a synchronous throw too', async () => {
    const GET = withRoute('thing', (() => {
      throw new Error('sync')
    }) as unknown as () => Promise<Response>)
    const res = await GET(req())
    expect(res.status).toBe(500)
  })
})

describe('withRoute — BL-112 kill switch at the client layer', () => {
  it('turns an AiPausedError (even wrapped as .cause) into the friendly 503 ai_paused, not a 500', async () => {
    const { AiPausedError } = await import('@homeowner-portal/ai/guard')
    const route = withRoute('ai.thing', async () => {
      throw new Error('workflow_W1_failed', { cause: new AiPausedError() })
    })
    const res = await route(req())
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: { code: string; reason?: string } }
    expect(body.error.code).toBe('upstream_unavailable')
    expect(body.error.reason).toBe('ai_paused')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})
