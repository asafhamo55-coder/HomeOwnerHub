// BL-028 inspection mode: the queue's transport. Calls the EXISTING routes,
// POST /api/violations/photo and POST /api/ai/violations/draft, and turns
// every answer into a SendResult the queue can act on. Never throws.
// Client-safe; `fetchImpl` is injectable for tests.

import { apiErrorMessage } from '@/lib/api/client'
import { classifyStatus, type DraftRequest, type QueuePhoto, type SendResult } from './queue'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const OFFLINE = 'No connection. It will upload when you have signal.'

async function send<T>(fetchImpl: Fetch, url: string, init: RequestInit, read: (body: unknown) => T | null, fallback: string): Promise<SendResult<T>> {
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch {
    return { ok: false, kind: 'offline', message: OFFLINE }
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const kind = classifyStatus(res.status)
    const message =
      res.status === 401 ? 'You were signed out. Sign in again, then tap Retry.' : apiErrorMessage(body, fallback)
    return { ok: false, kind, message }
  }
  const value = read(body)
  // A 200 with an unusable body (a captive-portal page, say) is not a save.
  return value === null ? { ok: false, kind: 'retry', message: fallback } : { ok: true, value }
}

export function uploadInspectionPhoto(fetchImpl: Fetch = fetch) {
  return (photo: QueuePhoto & { blob: Blob }): Promise<SendResult<string>> => {
    const fd = new FormData()
    // The route keys the stored object itself; the name only helps it read a typeless HEIC.
    fd.append('file', new File([photo.blob], photo.name || 'photo.jpg', { type: photo.type }))
    return send(
      fetchImpl,
      '/api/violations/photo',
      { method: 'POST', body: fd },
      (b) => {
        const p = (b as { storagePath?: unknown } | null)?.storagePath
        return typeof p === 'string' && p ? p : null
      },
      'The photo did not upload. It will try again.',
    )
  }
}

export function createInspectionDraft(fetchImpl: Fetch = fetch) {
  return (body: DraftRequest): Promise<SendResult<string>> =>
    send(
      fetchImpl,
      '/api/ai/violations/draft',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      (b) => {
        const id = (b as { runId?: unknown } | null)?.runId
        return typeof id === 'string' && id ? id : null
      },
      'The draft did not save. It will try again.',
    )
}
