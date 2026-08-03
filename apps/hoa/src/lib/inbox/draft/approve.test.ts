import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const update = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {
        update: vi.fn((values: unknown) => {
          update(values)
          return chain
        }),
        eq: vi.fn(() => chain),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'draft-1', thread_id: 'thread-1' },
          error: null,
        })),
      }
      return chain
    }),
  })),
}))

vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveDraft } from './actions'

const valid = {
  subject: 'Re: Fence',
  body: 'Thanks for writing.',
  to: ['resident@example.com'],
  cc: [] as string[],
}

describe('approveDraft — recipient validation', () => {
  beforeEach(() => update.mockClear())

  it('queues the reply and writes both recipient lists in the same update', async () => {
    const result = await approveDraft('draft-1', { ...valid, cc: ['pm@example.com'] })
    expect('ok' in result).toBe(true)
    const values = update.mock.calls[0][0] as Record<string, unknown>
    expect(values.status).toBe('queued')
    expect(values.to_emails).toEqual(['resident@example.com'])
    expect(values.cc_emails).toEqual(['pm@example.com'])
    // The audit stamp must land in the SAME statement as the status change.
    expect(values.approved_by).toBe('user-1')
    expect(values.approved_at).toBeTruthy()
  })

  it('refuses an empty To and writes nothing', async () => {
    const result = await approveDraft('draft-1', { ...valid, to: [] })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a malformed recipient and writes nothing', async () => {
    const result = await approveDraft('draft-1', { ...valid, to: ['nope'] })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a CR/LF injection attempt in a Cc address', async () => {
    const result = await approveDraft('draft-1', {
      ...valid,
      cc: ['ok@example.com\r\nBcc: attacker@evil.com'],
    })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('still blocks on an unfilled blank in the body', async () => {
    const result = await approveDraft('draft-1', { ...valid, body: 'We will waive [[BLANK: money]].' })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('still blocks on an unfilled blank in the subject', async () => {
    const result = await approveDraft('draft-1', { ...valid, subject: 'Re: [[BLANK: money]]' })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})
