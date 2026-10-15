import type { ErrorEvent } from '@sentry/nextjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { redactText, scrubEvent, sentryInitOptions } from './index'

const base = (over: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...over })

describe('scrubEvent', () => {
  it('keeps only method and query-less URL on the request', () => {
    const out = scrubEvent(
      base({
        request: {
          method: 'POST',
          url: 'https://app.example.com/residents/42?email=jane@example.com',
          headers: { cookie: 'sb-access-token=secret', authorization: 'Bearer x' },
          cookies: { 'sb-access-token': 'secret' },
          data: { full_name: 'Jane Resident', address: '1 Main St' },
          query_string: 'email=jane@example.com',
        },
      }),
    )
    expect(out.request).toEqual({ method: 'POST', url: 'https://app.example.com/residents/42' })
  })

  it('reduces the user to an opaque id', () => {
    const out = scrubEvent(
      base({ user: { id: 'u-1', email: 'jane@example.com', ip_address: '1.2.3.4', username: 'jane' } }),
    )
    expect(out.user).toEqual({ id: 'u-1' })
  })

  it('drops a user with no id entirely', () => {
    expect(scrubEvent(base({ user: { email: 'jane@example.com' } })).user).toBeUndefined()
  })

  it('drops console breadcrumbs and strips fetch bodies and query strings', () => {
    const out = scrubEvent(
      base({
        breadcrumbs: [
          { category: 'console', message: 'saving resident Jane at 1 Main St' },
          {
            category: 'fetch',
            data: {
              method: 'GET',
              url: '/api/residents?search=jane',
              status_code: 200,
              request_body: '{"name":"Jane"}',
            },
          },
        ],
      }),
    )
    expect(out.breadcrumbs).toEqual([
      { category: 'fetch', data: { method: 'GET', url: '/api/residents', status_code: 200 } },
    ])
  })

  it('redacts emails and phone numbers in exception values and messages', () => {
    const out = scrubEvent(
      base({
        message: 'call (555) 123-4567',
        exception: {
          values: [
            { type: 'PostgrestError', value: 'Key (email)=(jane@example.com) already exists' },
          ],
        },
      }),
    )
    expect(out.message).toBe('call [number]')
    expect(out.exception?.values?.[0]?.value).toBe('Key (email)=([email]) already exists')
    expect(out.exception?.values?.[0]?.type).toBe('PostgrestError')
  })
})

describe('redactText', () => {
  it('leaves ISO dates, timestamps and uuids intact', () => {
    const s = 'run 2026-10-15T12:00:00Z for org 3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    expect(redactText(s)).toBe(s)
  })

  it('redacts international and dotted phone formats', () => {
    expect(redactText('+1 555.123.4567 / 5551234567')).toBe('[number] / [number]')
  })
})

describe('sentryInitOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled when no DSN is configured', () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const opts = sentryInitOptions('hoa', 'server')
    expect(opts.enabled).toBe(false)
    expect(opts.dsn).toBeUndefined()
  })

  it('enables on the server from either DSN var, never sends default PII, and traces nothing', () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o1.ingest.sentry.io/2')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123')
    vi.stubEnv('VERCEL_ENV', 'production')
    const opts = sentryInitOptions('pm', 'server')
    expect(opts.enabled).toBe(true)
    expect(opts.sendDefaultPii).toBe(false)
    expect(opts.tracesSampleRate).toBe(0)
    expect(opts.release).toBe('abc123')
    expect(opts.environment).toBe('production')
    expect(opts.initialScope.tags.app).toBe('pm')
    expect(opts.beforeSend).toBe(scrubEvent)
  })

  it('the browser only reads the public DSN', () => {
    vi.stubEnv('SENTRY_DSN', 'https://k@o1.ingest.sentry.io/2')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    expect(sentryInitOptions('hoa', 'client').enabled).toBe(false)
  })
})
