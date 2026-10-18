// BL-028 inspection mode: the upload queue. Pure. No fetch, no IndexedDB,
// no React. Transport and storage come in as deps so this file is the
// whole retry policy and is unit-tested on its own.
//
// Every save goes through the queue, online or not. The item is written to
// local storage first, then sent:
//   1. each photo without a storage key → POST /api/violations/photo
//      (the existing upload route and its limits). The key is saved as soon
//      as it lands and the photo's bytes are dropped, so a retry never
//      uploads a photo twice;
//   2. then POST /api/ai/violations/draft, the existing W3 draft path, with
//      the keys. The draft lands in /approvals and /violations/approval-queue.
//      Every attempt carries the item's stable Idempotency-Key, so a retry
//      after a lost response gets the draft that already exists back instead
//      of a second one (and a second model call).
// The item is removed only after the draft exists. A failure never drops
// it: no signal or a server error → 'waiting' (retried with backoff); a
// request the server refuses → 'needs_attention' (shown with the reason
// until someone retries or removes it).

import type { ViolationCategory } from '@/lib/resident-submissions'
import { violationCategoryLabel } from '@/lib/violation-categories'

/** The upload route's limits (POST /api/violations/photo), checked before queueing. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic'])

export const MAX_PHOTOS_PER_HOME = 10
export const MAX_NOTE_CHARS = 2000

export interface QueuePhoto {
  id: string
  /** The bytes until uploaded; null once `storagePath` is set. */
  blob: Blob | null
  name: string
  type: string
  size: number
  storagePath: string | null
}

export type QueueStatus = 'waiting' | 'needs_attention'

export interface QueueItem {
  id: string
  createdAt: string
  unitId: string
  /** Shown in the queue list on this device only. Never logged or sent. */
  homeLabel: string
  category: ViolationCategory
  note: string
  photos: QueuePhoto[]
  status: QueueStatus
  attempts: number
  lastError: string | null
  /** Epoch ms; null means "as soon as possible". */
  nextAttemptAt: number | null
}

/** Why a request failed: no network, a transient server answer, or a refusal. */
export type FailureKind = 'offline' | 'retry' | 'rejected'
export type SendResult<T> = { ok: true; value: T } | { ok: false; kind: FailureKind; message: string }

export interface DraftRequest {
  unitId: string
  violationType: string
  description: string
  reporterNotes: string
  photoPaths: string[]
}

export interface QueueDeps {
  uploadPhoto(photo: QueuePhoto & { blob: Blob }): Promise<SendResult<string>>
  createDraft(body: DraftRequest, idempotencyKey: string): Promise<SendResult<string>>
  save(item: QueueItem): Promise<void>
  remove(id: string): Promise<void>
  now(): number
}

export function newQueueItem(args: {
  id: string
  unitId: string
  homeLabel: string
  category: ViolationCategory
  note: string
  photos: Array<Omit<QueuePhoto, 'storagePath'>>
  now: number
}): QueueItem {
  return {
    id: args.id,
    createdAt: new Date(args.now).toISOString(),
    unitId: args.unitId,
    homeLabel: args.homeLabel,
    category: args.category,
    note: args.note.slice(0, MAX_NOTE_CHARS),
    photos: args.photos.map((p) => ({ ...p, storagePath: null })),
    status: 'waiting',
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
  }
}

/** null when the upload route would accept the file, else the reason. */
export function validatePhoto(file: { type: string; size: number; name: string }): string | null {
  if (file.size <= 0) return 'That photo is empty. Take it again.'
  if (file.size > MAX_PHOTO_BYTES) return 'Photo must be under 25 MB.'
  const declared = file.type.split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') {
    return PHOTO_TYPES.has(declared) ? null : 'Photo must be JPG, PNG, WebP, or HEIC.'
  }
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  return file.name.includes('.') && PHOTO_EXTENSIONS.has(ext) ? null : 'Photo must be JPG, PNG, WebP, or HEIC.'
}

/** The body for POST /api/ai/violations/draft (W3's input bounds). */
export function draftRequestFor(item: QueueItem): DraftRequest {
  const label = violationCategoryLabel(item.category) ?? 'Other'
  const note = item.note.trim()
  const photoPaths = item.photos.flatMap((p) => (p.storagePath ? [p.storagePath] : []))
  const count = item.photos.length
  return {
    unitId: item.unitId,
    violationType: label,
    // The violation keeps the description on approval, so the note goes here.
    description: note ? `${label}: ${note}` : `${label}, seen during a board inspection.`,
    reporterNotes: `Logged in inspection mode with ${count} photo${count === 1 ? '' : 's'}.`,
    photoPaths,
  }
}

/**
 * The Idempotency-Key for an item's draft request. Derived from the item id
 * alone, so it is the same on every attempt (and after a reload, since the
 * id is stored with the item) and different for every item.
 */
export function idempotencyKeyFor(item: Pick<QueueItem, 'id'>): string {
  const safe = item.id.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100)
  return `inspect-${safe || 'item'}`
}

/** HTTP status → failure kind. 0 = the request never got an answer. */
export function classifyStatus(status: number): FailureKind {
  if (status === 0) return 'offline'
  if (status === 408 || status === 429 || status >= 500) return 'retry'
  return 'rejected'
}

const BASE_DELAY_MS = 5_000
const MAX_DELAY_MS = 5 * 60_000

export function retryDelayMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1))
}

/** A waiting item whose time has come (or any waiting item, when forced). */
export function isDue(item: QueueItem, now: number, opts: { force?: boolean } = {}): boolean {
  if (item.status !== 'waiting') return false
  return opts.force === true || item.nextAttemptAt === null || item.nextAttemptAt <= now
}

export type ProcessResult =
  | { outcome: 'done'; runId: string }
  | { outcome: 'waiting'; item: QueueItem; offline: boolean }
  | { outcome: 'needs_attention'; item: QueueItem }

async function attempt<T>(fn: () => Promise<SendResult<T>>): Promise<SendResult<T>> {
  try {
    return await fn()
  } catch {
    return { ok: false, kind: 'offline', message: 'No connection. It will upload when you have signal.' }
  }
}

async function failed(item: QueueItem, deps: QueueDeps, failure: { kind: FailureKind; message: string }): Promise<ProcessResult> {
  const attempts = item.attempts + 1
  if (failure.kind === 'rejected') {
    const next: QueueItem = { ...item, attempts, status: 'needs_attention', lastError: failure.message, nextAttemptAt: null }
    await deps.save(next).catch(() => {})
    return { outcome: 'needs_attention', item: next }
  }
  const next: QueueItem = {
    ...item,
    attempts,
    status: 'waiting',
    lastError: failure.message,
    nextAttemptAt: deps.now() + retryDelayMs(attempts),
  }
  await deps.save(next).catch(() => {})
  return { outcome: 'waiting', item: next, offline: failure.kind === 'offline' }
}

/** One attempt at one item: photos still to go, then the draft. */
export async function processItem(start: QueueItem, deps: QueueDeps): Promise<ProcessResult> {
  let item = start
  for (let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i]!
    if (photo.storagePath) continue
    if (!photo.blob) {
      return failed(item, deps, { kind: 'rejected', message: 'A photo was lost on this device. Remove this home and take it again.' })
    }
    const blob = photo.blob
    const up = await attempt(() => deps.uploadPhoto({ ...photo, blob }))
    if (!up.ok) return failed(item, deps, up)
    const photos = item.photos.slice()
    photos[i] = { ...photo, storagePath: up.value, blob: null }
    item = { ...item, photos }
    // Saved straight away: a retry must not upload this photo again.
    await deps.save(item).catch(() => {})
  }

  const draft = await attempt(() => deps.createDraft(draftRequestFor(item), idempotencyKeyFor(item)))
  if (!draft.ok) return failed(item, deps, draft)
  await deps.remove(item.id).catch(() => {})
  return { outcome: 'done', runId: draft.value }
}

export interface DrainResult {
  /** Everything still queued, oldest first. */
  items: QueueItem[]
  done: Array<{ id: string; runId: string }>
  offline: boolean
}

/**
 * Sends every due item, oldest first, one at a time. Stops at the first
 * "no connection" so a phone without signal is not hammered.
 */
export async function drainQueue(
  items: readonly QueueItem[],
  deps: QueueDeps,
  opts: { force?: boolean } = {},
): Promise<DrainResult> {
  const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const remaining = new Map(ordered.map((i) => [i.id, i]))
  const done: DrainResult['done'] = []
  let offline = false
  for (const item of ordered) {
    if (!isDue(item, deps.now(), opts)) continue
    const r = await processItem(item, deps)
    if (r.outcome === 'done') {
      remaining.delete(item.id)
      done.push({ id: item.id, runId: r.runId })
      continue
    }
    remaining.set(item.id, r.item)
    if (r.outcome === 'waiting' && r.offline) {
      offline = true
      break
    }
  }
  return { items: [...remaining.values()], done, offline }
}

export function queueSummary(items: readonly QueueItem[]): { waiting: number; needsAttention: number; label: string | null } {
  const waiting = items.filter((i) => i.status === 'waiting').length
  const needsAttention = items.length - waiting
  const parts: string[] = []
  if (waiting > 0) parts.push(`${waiting} waiting to upload`)
  if (needsAttention > 0) parts.push(`${needsAttention} need${needsAttention === 1 ? 's' : ''} attention`)
  return { waiting, needsAttention, label: parts.length > 0 ? parts.join(' · ') : null }
}

/** Manual retry: back to waiting, due now. */
export function retryNow(item: QueueItem): QueueItem {
  return { ...item, status: 'waiting', nextAttemptAt: null }
}
