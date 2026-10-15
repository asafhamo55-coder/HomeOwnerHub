import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError }))

import { redirect } from 'next/navigation'
import { loadOrFail, tryLoad } from './load-or-fail'

describe('loadOrFail', () => {
  beforeEach(() => reportError.mockReset())

  it('returns the rows and count on success, without reporting', async () => {
    const res = await loadOrFail('violations', Promise.resolve({ data: [{ id: 'a' }], error: null, count: 7 }))
    expect(res).toEqual({ ok: true, data: [{ id: 'a' }], count: 7 })
    expect(reportError).not.toHaveBeenCalled()
  })

  it('keeps an empty success distinct from a failure', async () => {
    const res = await loadOrFail('violations', Promise.resolve({ data: [], error: null }))
    expect(res).toEqual({ ok: true, data: [], count: null })
  })

  it('treats a resolved { error } as a failure — the case `data ?? []` turned into "none"', async () => {
    const res = await loadOrFail(
      'dues',
      Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied for table assessments' } }),
    )
    expect(res).toEqual({ ok: false })
    expect(reportError).toHaveBeenCalledTimes(1)
    const [err, where, context] = reportError.mock.calls[0]
    expect(where).toBe('load-or-fail')
    expect(context).toEqual({ what: 'dues', code: '42501' })
    expect((err as Error).message).toContain('42501')
  })

  it('carries no error detail on the failure branch for a page to render', async () => {
    const res = await loadOrFail('dues', Promise.resolve({ data: null, error: { code: 'x', message: 'secret' } }))
    expect(Object.keys(res)).toEqual(['ok'])
  })

  it('redacts emails and phone numbers from the reported message', async () => {
    await loadOrFail(
      'residents',
      Promise.resolve({
        data: null,
        error: { code: '23505', message: 'Key (email)=(jane@example.com) phone 555-123-4567 already exists' },
      }),
    )
    const message = (reportError.mock.calls[0][0] as Error).message
    expect(message).not.toContain('jane@example.com')
    expect(message).not.toContain('555-123-4567')
    expect(message).toContain('[email]')
  })

  it('treats a rejected query as a failure', async () => {
    const res = await loadOrFail('meetings', Promise.reject(new Error('fetch failed')))
    expect(res).toEqual({ ok: false })
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][2]).toEqual({ what: 'meetings', code: 'thrown' })
  })

  it('rethrows Next control flow (redirect) instead of reporting a failure', async () => {
    const redirecting = new Promise<never>(() => redirect('/login'))
    await expect(loadOrFail('tickets', redirecting)).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(reportError).not.toHaveBeenCalled()
  })
})

describe('tryLoad', () => {
  beforeEach(() => reportError.mockReset())

  it('wraps a helper that resolves', async () => {
    expect(await tryLoad('threads', async () => [1, 2])).toEqual({ ok: true, data: [1, 2], count: null })
  })

  it('turns a throwing helper into ok:false and reports it', async () => {
    const res = await tryLoad('threads', async () => {
      throw new Error('listThreads: failed to load threads')
    })
    expect(res).toEqual({ ok: false })
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('rethrows redirect() from inside the helper', async () => {
    await expect(
      tryLoad('tickets', async () => {
        redirect('/')
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
    expect(reportError).not.toHaveBeenCalled()
  })
})
