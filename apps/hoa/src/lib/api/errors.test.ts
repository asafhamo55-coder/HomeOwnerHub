import { describe, expect, it } from 'vitest'
import { API_ERROR_STATUS, ApiRouteError, apiError, isApiErrorBody } from './errors'

describe('apiError', () => {
  it('builds the one envelope with the mapped status and a default message', async () => {
    const res = apiError('forbidden')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: { code: 'forbidden', message: expect.any(String) } })
    expect(body.error.message.length).toBeGreaterThan(0)
  })

  it('uses the caller message and nests extra fields inside error', async () => {
    const res = apiError('conflict', 'You already submitted a bid.', { reason: 'already_submitted' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: { code: 'conflict', message: 'You already submitted a bid.', reason: 'already_submitted' },
    })
  })

  it('maps every code to the documented status', () => {
    expect(API_ERROR_STATUS).toEqual({
      invalid_json: 400,
      validation_failed: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      gone: 410,
      payload_too_large: 413,
      unsupported_media_type: 415,
      unprocessable: 422,
      rate_limited: 429,
      internal: 500,
      not_configured: 503,
      upstream_unavailable: 503,
    })
  })

  it('never lets a caller override the internal message with detail', async () => {
    const res = apiError('internal', 'duplicate key value violates unique constraint "bids_pkey"')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toMatch(/constraint|bids_pkey/)
  })

  it('passes response headers through (e.g. Retry-After on 429)', () => {
    const res = apiError('rate_limited', undefined, undefined, { 'Retry-After': '30' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
  })

  it('ApiRouteError carries a code, a public message and extras', () => {
    const e = new ApiRouteError('not_found', 'No such unit.', { reason: 'unit_not_found' })
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('not_found')
    expect(e.status).toBe(404)
    expect(e.publicMessage).toBe('No such unit.')
    expect(e.extra).toEqual({ reason: 'unit_not_found' })
  })

  it('isApiErrorBody recognises the envelope only', () => {
    expect(isApiErrorBody({ error: { code: 'forbidden', message: 'x' } })).toBe(true)
    expect(isApiErrorBody({ error: 'forbidden' })).toBe(false)
    expect(isApiErrorBody(null)).toBe(false)
  })
})
