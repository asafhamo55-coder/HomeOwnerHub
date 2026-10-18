import { describe, expect, it } from 'vitest'
import { memoryQueueStore, openQueueStore } from './store'
import { newQueueItem } from './queue'

const ITEM = newQueueItem({ id: 'q1', unitId: 'u', homeLabel: 'h', category: 'trash', note: '', photos: [], now: 0 })

describe('openQueueStore', () => {
  it('no IndexedDB (private window, node) → an in-memory store that says it is not durable', async () => {
    const s = await openQueueStore('org-1', null)
    expect(s.durable).toBe(false)
    await s.save(ITEM)
    expect(await s.list()).toEqual([ITEM])
    await s.remove('q1')
    expect(await s.list()).toEqual([])
  })

  it('an IndexedDB that throws on open falls back instead of breaking the page', async () => {
    const throwing = {
      open() {
        throw new DOMException('SecurityError')
      },
    } as unknown as IDBFactory
    expect((await openQueueStore('org-1', throwing)).durable).toBe(false)
  })

  it('an IndexedDB whose open errors falls back too', async () => {
    const erroring = {
      open() {
        const r: Record<string, unknown> = { error: new Error('nope') }
        queueMicrotask(() => (r.onerror as () => void)())
        return r
      },
    } as unknown as IDBFactory
    expect((await openQueueStore('org-1', erroring)).durable).toBe(false)
  })
})

describe('memoryQueueStore', () => {
  it('overwrites by id', async () => {
    const s = memoryQueueStore()
    await s.save(ITEM)
    await s.save({ ...ITEM, attempts: 2 })
    expect((await s.list()).map((i) => i.attempts)).toEqual([2])
  })
})
