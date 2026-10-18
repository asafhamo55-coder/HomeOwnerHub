'use client'

// BL-028 inspection mode: state, the offline queue and its effects. The
// screen is InspectView; the retry policy is lib/inspect/queue.ts.
//
// Save writes the home to this phone first (IndexedDB) and only then
// uploads, so a save with no signal is never lost: it waits, visibly, and
// retries when the phone comes back online, on a timer, or on "Retry now".
// No addresses, notes or photo names are logged anywhere here.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirm, useToast } from '@homeowner-portal/ui'
import type { ViolationCategory } from '@/lib/resident-submissions'
import { propertyOptionLabel, type PropertyOption } from '@/lib/properties/picker-search'
import {
  MAX_PHOTOS_PER_HOME,
  drainQueue,
  newQueueItem,
  retryNow,
  validatePhoto,
  type QueueDeps,
  type QueueItem,
} from '@/lib/inspect/queue'
import { memoryQueueStore, openQueueStore, type QueueStore } from '@/lib/inspect/store'
import { createInspectionDraft, uploadInspectionPhoto } from '@/lib/inspect/transport'
import { InspectView, type InspectSavedView } from './InspectView'

interface DraftPhoto {
  id: string
  file: File
  previewUrl: string
}

const TICK_MS = 15_000

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function InspectMode({ orgId, homes, unlinked }: { orgId: string; homes: PropertyOption[]; unlinked: number }) {
  const toast = useToast()
  const confirm = useConfirm()

  const [homeId, setHomeId] = useState('')
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [category, setCategory] = useState<ViolationCategory | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [saved, setSaved] = useState<InspectSavedView[]>([])
  const [online, setOnline] = useState(true)
  const [durable, setDurable] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const storeRef = useRef<QueueStore | null>(null)
  const queueRef = useRef<QueueItem[]>([])
  const draining = useRef(false)
  /** A save or retry arrived mid-drain: run again once this one ends. */
  const rerun = useRef(false)

  const setQueueBoth = useCallback((items: QueueItem[]) => {
    queueRef.current = items
    setQueue(items)
  }, [])

  const drain = useCallback(
    async (force = false) => {
      const store = storeRef.current
      if (!store || queueRef.current.length === 0) return
      if (draining.current) {
        if (force) rerun.current = true
        return
      }
      draining.current = true
      setSyncing(true)
      const deps: QueueDeps = {
        uploadPhoto: uploadInspectionPhoto(),
        createDraft: createInspectionDraft(),
        save: async (item) => {
          await store.save(item)
          setQueueBoth(queueRef.current.map((i) => (i.id === item.id ? item : i)))
        },
        remove: (id) => store.remove(id),
        now: () => Date.now(),
      }
      try {
        const result = await drainQueue(queueRef.current, deps, { force })
        // Items saved while this ran are kept: merge by id, newest state wins.
        const finished = new Set(result.done.map((d) => d.id))
        const updated = new Map(result.items.map((i) => [i.id, i]))
        const before = queueRef.current
        setQueueBoth(before.filter((i) => !finished.has(i.id)).map((i) => updated.get(i.id) ?? i))
        if (result.done.length > 0) {
          const doneItems = before.filter((i) => finished.has(i.id))
          setSaved((prev) => [...doneItems.map((i) => ({ id: i.id, homeLabel: i.homeLabel, category: i.category })), ...prev])
        }
      } finally {
        draining.current = false
        setSyncing(false)
        if (rerun.current) {
          rerun.current = false
          void drainRef.current(true)
        }
      }
    },
    [setQueueBoth],
  )

  const drainRef = useRef(drain)
  drainRef.current = drain

  // Open this org's queue and pick up anything left from an earlier visit.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const store = await openQueueStore(orgId).catch(() => memoryQueueStore())
      if (cancelled) return
      storeRef.current = store
      setDurable(store.durable)
      const items = await store.list().catch(() => [] as QueueItem[])
      if (cancelled) return
      setQueueBoth([...items, ...queueRef.current.filter((q) => !items.some((i) => i.id === q.id))])
      void drain(true)
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, drain, setQueueBoth])

  // Online / offline, and a periodic retry for anything waiting.
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
    const up = () => {
      setOnline(true)
      void drain(true)
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    const timer = window.setInterval(() => void drain(false), TICK_MS)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.clearInterval(timer)
    }
  }, [drain])

  // Photos that exist only in this tab: warn before the page closes.
  useEffect(() => {
    const stranded = !durable && queue.length > 0
    if (!stranded) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [durable, queue.length])

  // Thumbnails are object URLs; free them when the page goes.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => photosRef.current.forEach((ph) => URL.revokeObjectURL(ph.previewUrl)), [])

  function addPhotos(files: File[]) {
    setPhotoError(null)
    const room = MAX_PHOTOS_PER_HOME - photos.length
    const accepted: DraftPhoto[] = []
    let refused: string | null = null
    for (const file of files) {
      const reason = validatePhoto(file)
      if (reason) {
        refused = reason
        continue
      }
      if (accepted.length >= room) {
        refused = `Up to ${MAX_PHOTOS_PER_HOME} photos per home.`
        break
      }
      accepted.push({ id: newId(), file, previewUrl: URL.createObjectURL(file) })
    }
    if (accepted.length > 0) setPhotos((prev) => [...prev, ...accepted])
    if (refused) setPhotoError(refused)
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((ph) => ph.id === id)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((ph) => ph.id !== id)
    })
    setPhotoError(null)
  }

  async function save() {
    const home = homes.find((h) => h.id === homeId)
    if (!home || !category || photos.length === 0) return
    setSaving(true)
    setSaveError(null)
    const item = newQueueItem({
      id: newId(),
      unitId: home.id,
      homeLabel: propertyOptionLabel(home),
      category,
      note,
      photos: photos.map((ph) => ({ id: ph.id, blob: ph.file, name: ph.file.name, type: ph.file.type, size: ph.file.size })),
      now: Date.now(),
    })
    try {
      const store = storeRef.current ?? memoryQueueStore()
      try {
        await store.save(item)
      } catch {
        // The phone refused to store it (full, or private mode). Keep it in
        // this tab and say so; it still uploads from here.
        setDurable(false)
      }
      setQueueBoth([...queueRef.current, item])
      photos.forEach((ph) => URL.revokeObjectURL(ph.previewUrl))
      setPhotos([])
      setHomeId('')
      setCategory(null)
      setNote('')
      toast({ tone: 'success', message: 'Saved. On to the next home.' })
      void drain(true)
    } catch {
      setSaveError('Couldn’t save this home. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function retryItem(id: string) {
    const store = storeRef.current
    const items = queueRef.current.map((i) => (i.id === id ? retryNow(i) : i))
    const item = items.find((i) => i.id === id)
    if (item && store) await store.save(item).catch(() => {})
    setQueueBoth(items)
    void drain(true)
  }

  async function removeItem(id: string) {
    const ok = await confirm({
      title: 'Remove this home from the queue?',
      description: 'Its photos are deleted from this phone and no draft is made. This cannot be undone.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    await storeRef.current?.remove(id).catch(() => {})
    setQueueBoth(queueRef.current.filter((i) => i.id !== id))
  }

  return (
    <InspectView
      homes={homes}
      unlinked={unlinked}
      homeId={homeId}
      onHomeChange={setHomeId}
      photos={photos.map((ph) => ({ id: ph.id, previewUrl: ph.previewUrl }))}
      onAddPhotos={addPhotos}
      onRemovePhoto={removePhoto}
      photoError={photoError}
      category={category}
      onCategoryChange={setCategory}
      note={note}
      onNoteChange={setNote}
      saving={saving}
      onSave={() => void save()}
      saveError={saveError}
      queue={queue}
      saved={saved}
      online={online}
      durable={durable}
      syncing={syncing}
      onRetryAll={() => void drain(true)}
      onRetryItem={(id) => void retryItem(id)}
      onRemoveItem={(id) => void removeItem(id)}
    />
  )
}
