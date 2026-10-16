import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

const req = (auth?: string, url = 'https://hoa.test/api/cron/sentry-test') =>
  new Request(url, {
    headers: auth ? { authorization: auth } : {},
  })

async function errorBody(res: Response) {
  return (await res.json()) as { error: { code: string; message: string } }
}

describe('GET /api/cron/sentry-test', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed with the 503 not_configured envelope when SENTRY_TEST_SECRET is unset', async () => {
    vi.stubEnv('SENTRY_TEST_SECRET', '')
    vi.stubEnv('CRON_SECRET', 'cron-only')
    const res = await GET(req('Bearer anything'))
    expect(res.status).toBe(503)
    const body = await errorBody(res)
    expect(body.error.code).toBe('not_configured')
    expect(typeof body.error.message).toBe('string')
  })

  it('rejects a missing or wrong bearer token with the 401 unauthenticated envelope', async () => {
    vi.stubEnv('SENTRY_TEST_SECRET', 's3cret')
    for (const res of [await GET(req()), await GET(req('Bearer nope')), await GET(req('Basic s3cret'))]) {
      expect(res.status).toBe(401)
      expect((await errorBody(res)).error.code).toBe('unauthenticated')
    }
  })

  it('does not accept CRON_SECRET: one env var per purpose (R-21 / RC-7)', async () => {
    vi.stubEnv('SENTRY_TEST_SECRET', 'sentry-only')
    vi.stubEnv('CRON_SECRET', 'cron-only')
    const res = await GET(req('Bearer cron-only'))
    expect(res.status).toBe(401)
    expect((await errorBody(res)).error.code).toBe('unauthenticated')
  })

  it('ignores a ?key= query secret', async () => {
    vi.stubEnv('SENTRY_TEST_SECRET', 's3cret')
    const res = await GET(req(undefined, 'https://hoa.test/api/cron/sentry-test?key=s3cret'))
    expect(res.status).toBe(401)
  })

  it('throws (so onRequestError reports it) only with the right token', async () => {
    vi.stubEnv('SENTRY_TEST_SECRET', 's3cret')
    await expect(GET(req('Bearer s3cret'))).rejects.toThrow('Sentry test error from hoa')
  })
})
