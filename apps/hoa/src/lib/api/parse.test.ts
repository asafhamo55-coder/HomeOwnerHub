import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiRouteError } from './errors'
import { parseForm, parseJson, parseQuery } from './parse'

const Schema = z.object({ name: z.string().min(1).max(10), tags: z.array(z.string()).max(2).optional() })

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('http://x/api/thing', { method: 'POST', body, headers })

async function rejection(p: Promise<unknown>): Promise<ApiRouteError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiRouteError) return e
    throw e
  }
  throw new Error('expected a rejection')
}

describe('parseJson', () => {
  it('returns the parsed, validated body', async () => {
    await expect(parseJson(post(JSON.stringify({ name: 'ok' })), Schema)).resolves.toEqual({ name: 'ok' })
  })

  it('rejects malformed JSON as 400 invalid_json', async () => {
    const e = await rejection(parseJson(post('{nope'), Schema))
    expect(e.code).toBe('invalid_json')
    expect(e.status).toBe(400)
  })

  it('rejects an empty body as invalid_json', async () => {
    const e = await rejection(parseJson(post(''), Schema))
    expect(e.code).toBe('invalid_json')
  })

  it('rejects a schema miss as 400 validation_failed with field issues, not raw Zod text', async () => {
    const e = await rejection(parseJson(post(JSON.stringify({ name: '', tags: ['a', 'b', 'c'] })), Schema))
    expect(e.code).toBe('validation_failed')
    expect(e.status).toBe(400)
    const issues = (e.extra as { issues: Array<{ path: string; message: string }> }).issues
    expect(issues.map((i) => i.path).sort()).toEqual(['name', 'tags'])
    for (const i of issues) expect(Object.keys(i).sort()).toEqual(['message', 'path'])
    expect(e.publicMessage).not.toMatch(/"code"|too_small|\[/)
  })

  it('rejects a body over maxBytes as 413 by content-length, before reading it', async () => {
    const e = await rejection(parseJson(post('{}', { 'content-length': '5000' }), Schema, { maxBytes: 100 }))
    expect(e.code).toBe('payload_too_large')
    expect(e.status).toBe(413)
  })

  it('rejects a body over maxBytes as 413 even when content-length lies or is absent', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(500) })
    const e = await rejection(parseJson(post(big, { 'content-length': '10' }), Schema, { maxBytes: 100 }))
    expect(e.code).toBe('payload_too_large')
  })

  it('applies a default cap of 1 MB', async () => {
    const e = await rejection(parseJson(post(JSON.stringify({ name: 'x'.repeat(1_100_000) })), Schema))
    expect(e.code).toBe('payload_too_large')
  })
})

describe('parseForm', () => {
  it('returns FormData for a well-formed multipart body', async () => {
    const f = new FormData()
    f.append('title', 'Rules')
    const form = await parseForm(post(f))
    expect(form.get('title')).toBe('Rules')
  })

  it('rejects a malformed multipart body as 400 validation_failed, not a thrown 500', async () => {
    const e = await rejection(
      parseForm(post('garbage', { 'content-type': 'multipart/form-data; boundary=zzz' })),
    )
    expect(e.code).toBe('validation_failed')
  })

  it('rejects a declared oversize body as 413', async () => {
    const f = new FormData()
    f.append('title', 'Rules')
    const e = await rejection(parseForm(post(f, { 'content-length': '999999999' }), { maxBytes: 1000 }))
    expect(e.code).toBe('payload_too_large')
  })
})

describe('parseQuery', () => {
  it('validates search params against a schema', () => {
    const Q = z.object({ state: z.enum(['FL', 'CA']) })
    expect(parseQuery(new URL('http://x/?state=FL'), Q)).toEqual({ state: 'FL' })
    expect(() => parseQuery(new URL('http://x/?state=TX'), Q)).toThrow(ApiRouteError)
  })
})
