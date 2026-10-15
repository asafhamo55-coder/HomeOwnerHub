import { describe, expect, it, vi } from 'vitest'
import { removeStorageObjects, type StorageRemover } from './storage-remove'

function client(result: { data: unknown[] | null; error: { message: string } | null }): StorageRemover {
  return { storage: { from: () => ({ remove: vi.fn().mockResolvedValue(result) }) } }
}

describe('removeStorageObjects', () => {
  it('succeeds when every requested object was deleted', async () => {
    const res = await removeStorageObjects(client({ data: [{}, {}], error: null }), 'b', ['a', 'c'], 'ctx')
    expect(res).toBeNull()
  })

  // The case this helper exists for: RLS filters the rows out, Storage
  // returns an empty list and no error, and the caller used to report success.
  it('fails when storage reports no error but deleted nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await removeStorageObjects(client({ data: [], error: null }), 'b', ['a'], 'ctx')
    expect(res).toMatch(/not removed/i)
    expect(log).toHaveBeenCalled()
  })

  it('fails when only some objects were deleted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await removeStorageObjects(client({ data: [{}], error: null }), 'b', ['a', 'c'], 'ctx')
    expect(res).not.toBeNull()
  })

  it('surfaces a storage error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await removeStorageObjects(client({ data: null, error: { message: 'boom' } }), 'b', ['a'], 'ctx')
    expect(res).toBe('boom')
  })

  it('never logs object paths (they embed user-supplied file names)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await removeStorageObjects(client({ data: [], error: null }), 'b', ['org/Jane Doe lease.pdf'], 'ctx')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Jane Doe')
  })

  it('is a no-op for an empty path list', async () => {
    const remove = vi.fn()
    const res = await removeStorageObjects({ storage: { from: () => ({ remove }) } }, 'b', [], 'ctx')
    expect(res).toBeNull()
    expect(remove).not.toHaveBeenCalled()
  })
})
