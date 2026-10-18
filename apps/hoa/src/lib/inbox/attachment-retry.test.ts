import { beforeEach, describe, expect, it, vi } from 'vitest'

const order: string[] = []

const requireBoardOrAdmin = vi.fn(async () => {
  order.push('gate')
  return { role: 'board' as const, org: { id: 'org-1', name: 'Madison Park' } }
})
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: () => requireBoardOrAdmin() }))

let row: Record<string, unknown> | null = null
let readError: { code: string; message: string } | null = null
let updateError: { code: string; message: string } | null = null
let updatedRow: Record<string, unknown> | null = { id: 'x' }
const updates: Array<{ values: unknown; filters: Array<[string, unknown]> }> = []

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    order.push('db')
    return {
      from: (table: string) => {
        expect(table).toBe('inbox_attachments')
        const filters: Array<[string, unknown]> = []
        let values: unknown = null
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (v: unknown) => {
            values = v
            return chain
          },
          eq: (col: string, val: unknown) => {
            filters.push([col, val])
            return chain
          },
          maybeSingle: async () => {
            if (values) {
              updates.push({ values, filters })
              return { data: updateError ? null : updatedRow, error: updateError }
            }
            return { data: readError ? null : row, error: readError }
          },
        }
        return chain
      },
    }
  }),
}))

const inngestSend = vi.fn(async (_e: unknown) => undefined)
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: (e: unknown) => inngestSend(e) } }))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const { retryAttachment } = await import('./attachment-retry')

const ID = '3f2a8f4e-2b7d-4c1e-9b51-0d7c1a2b3c4d'
const form = (id: string = ID) => {
  const fd = new FormData()
  fd.set('attachmentId', id)
  return fd
}

let logs: string[] = []
beforeEach(() => {
  order.length = 0
  updates.length = 0
  row = { id: ID, thread_id: 'thread-1', fetch_status: 'failed', fetch_error: 'Gmail 503' }
  readError = null
  updateError = null
  updatedRow = { id: ID }
  inngestSend.mockReset()
  inngestSend.mockResolvedValue(undefined)
  revalidatePath.mockReset()
  requireBoardOrAdmin.mockClear()
  logs = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((a) => JSON.stringify(a)).join(' '))
  })
})

describe('retryAttachment', () => {
  it('is gated board-only before any database client exists', async () => {
    requireBoardOrAdmin.mockImplementationOnce(async () => {
      order.push('gate')
      throw new Error('NEXT_REDIRECT')
    })
    await expect(retryAttachment({}, form())).rejects.toThrow('NEXT_REDIRECT')
    expect(order).toEqual(['gate'])
  })

  it('resets the attempts and re-queues via the existing event', async () => {
    const result = await retryAttachment({}, form())
    expect(result).toEqual({ ok: true })
    expect(order).toEqual(['gate', 'db'])
    expect(updates).toHaveLength(1)
    expect(updates[0]!.values).toEqual({ fetch_status: 'pending', fetch_attempts: 0, fetch_error: null })
    // Org-scoped, and only flips a row that is still 'failed'.
    expect(updates[0]!.filters).toEqual([
      ['id', ID],
      ['organization_id', 'org-1'],
      ['fetch_status', 'failed'],
    ])
    expect(inngestSend).toHaveBeenCalledWith({
      name: 'mailbox/attachments.queued',
      data: { organizationId: 'org-1', attachmentId: ID },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/inbox/thread-1')
  })

  it('rejects a malformed id without touching the database', async () => {
    expect(await retryAttachment({}, form('not-a-uuid'))).toEqual({ error: 'Invalid attachment.' })
    expect(order).toEqual(['gate'])
  })

  it('another org’s attachment reads as not found', async () => {
    row = null
    expect(await retryAttachment({}, form())).toEqual({ error: 'Attachment not found.' })
    expect(updates).toHaveLength(0)
  })

  it('refuses a failure a retry cannot fix', async () => {
    row = { ...row!, fetch_error: 'Exceeds 26214400 byte limit.' }
    const result = await retryAttachment({}, form())
    expect(result.error).toMatch(/open it in Gmail/)
    expect(updates).toHaveLength(0)
    expect(inngestSend).not.toHaveBeenCalled()
  })

  it('a second click on an already re-queued attachment is a no-op success', async () => {
    row = { ...row!, fetch_status: 'pending' }
    expect(await retryAttachment({}, form())).toEqual({ ok: true })
    expect(updates).toHaveLength(0)
  })

  it('a failed update reports an error, codes only in the log', async () => {
    updateError = { code: '42501', message: 'permission denied' }
    expect(await retryAttachment({}, form())).toEqual({ error: 'Could not retry this attachment. Try again.' })
    expect(inngestSend).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('42501')
  })

  it('if the event cannot be sent it still succeeds — the 5-minute cron picks the row up', async () => {
    inngestSend.mockRejectedValueOnce(new Error('no event key'))
    expect(await retryAttachment({}, form())).toEqual({ ok: true })
    expect(logs.join('\n')).toContain('no event key')
  })
})
