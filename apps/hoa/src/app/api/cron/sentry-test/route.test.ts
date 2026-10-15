import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

const req = (auth?: string) =>
  new Request('https://hoa.test/api/cron/sentry-test', {
    headers: auth ? { authorization: auth } : {},
  })

describe('GET /api/cron/sentry-test', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed with 503 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(req('Bearer anything'))).status).toBe(503)
  })

  it('rejects a missing or wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
  })

  it('throws (so onRequestError reports it) only with the right token', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    await expect(GET(req('Bearer s3cret'))).rejects.toThrow('Sentry test error from hoa')
  })
})
