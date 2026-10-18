import { describe, expect, it, vi } from 'vitest'
import { createInspectionDraft, uploadInspectionPhoto } from './transport'

const PHOTO = { id: 'p1', blob: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), name: 'a.jpg', type: 'image/jpeg', size: 4, storagePath: null }
const DRAFT = { unitId: 'u', violationType: 'Trash / debris', description: 'Trash / debris, seen.', reporterNotes: 'x', photoPaths: ['k'] }

const KEY = 'inspect-q1-abcdef'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('uploadInspectionPhoto → POST /api/violations/photo (the existing route)', () => {
  it('posts multipart to the existing route and returns the storage key', async () => {
    const f = vi.fn(async () => json(200, { storagePath: 'org/1-a.jpg', signedUrl: null }))
    expect(await uploadInspectionPhoto(f)(PHOTO)).toEqual({ ok: true, value: 'org/1-a.jpg' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/violations/photo')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('a thrown fetch is offline', async () => {
    const r = await uploadInspectionPhoto(vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))(PHOTO)
    expect(r).toMatchObject({ ok: false, kind: 'offline' })
  })

  it('413/415 are refusals with the route’s own message', async () => {
    const r = await uploadInspectionPhoto(vi.fn(async () => json(413, { error: { code: 'payload_too_large', message: 'Photo must be under 25 MB.' } })))(PHOTO)
    expect(r).toEqual({ ok: false, kind: 'rejected', message: 'Photo must be under 25 MB.' })
  })

  it('a 503 is retried; a 200 without a key (captive portal HTML) is not a save', async () => {
    expect(await uploadInspectionPhoto(vi.fn(async () => json(503, {})))(PHOTO)).toMatchObject({ ok: false, kind: 'retry' })
    const html = vi.fn(async () => new Response('<html>Sign in to Wi-Fi</html>', { status: 200 }))
    expect(await uploadInspectionPhoto(html)(PHOTO)).toMatchObject({ ok: false, kind: 'retry' })
  })

  it('401 asks the person to sign in again', async () => {
    const r = await uploadInspectionPhoto(vi.fn(async () => json(401, { error: { code: 'unauthenticated', message: 'x' } })))(PHOTO)
    expect(r).toEqual({ ok: false, kind: 'rejected', message: 'You were signed out. Sign in again, then tap Retry.' })
  })
})

describe('createInspectionDraft → POST /api/ai/violations/draft (the existing W3 path)', () => {
  it('posts JSON and returns the run id', async () => {
    const f = vi.fn(async () => json(200, { runId: 'run-9', notice: 'Dear owner' }))
    expect(await createInspectionDraft(f)(DRAFT, KEY)).toEqual({ ok: true, value: 'run-9' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/violations/draft')
    expect(JSON.parse(init.body as string)).toEqual(DRAFT)
  })

  it('sends the item’s idempotency key as the Idempotency-Key header, not in the body', async () => {
    const f = vi.fn(async () => json(200, { runId: 'run-9' }))
    await createInspectionDraft(f)(DRAFT, KEY)
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('idempotency-key')).toBe(KEY)
    expect(JSON.parse(init.body as string)).not.toHaveProperty('idempotencyKey')
  })

  it('AI outage (503) waits; a gone unit (404) needs a person', async () => {
    expect(await createInspectionDraft(vi.fn(async () => json(503, { error: { message: 'AI down' } })))(DRAFT, KEY)).toEqual({
      ok: false,
      kind: 'retry',
      message: 'AI down',
    })
    expect(await createInspectionDraft(vi.fn(async () => json(404, { error: { message: 'We could not find that unit.' } })))(DRAFT, KEY)).toMatchObject({
      ok: false,
      kind: 'rejected',
    })
  })
})
