import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const update = vi.fn()
const checkOrgOwned = vi.fn()
vi.mock('@/lib/org-owned', () => ({ checkOrgOwned: (...a: unknown[]) => checkOrgOwned(...a) }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        update: vi.fn((v: unknown) => {
          update(v)
          return chain
        }),
        is: vi.fn(async () => ({ error: null })),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'draft-1', thread_id: 'thread-1', mailbox_account_id: 'acct-1' },
          error: null,
        })),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: table === 'inbox_draft_attachments' ? [] : null, error: null }),
      }
      return chain
    }),
  })),
}))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveDraft } from './actions'

const input = { subject: 'Re: x', body: 'Hello.', to: ['a@example.com'], cc: [] as string[] }

describe('approveDraft — tenant isolation of linked rows', () => {
  beforeEach(() => {
    update.mockClear()
    checkOrgOwned.mockReset()
  })

  it('refuses and queues nothing when the mailbox account is outside the org', async () => {
    checkOrgOwned.mockImplementation(async (table: string) =>
      table === 'mailbox_accounts' ? 'not_found' : 'owned',
    )
    const result = await approveDraft('draft-1', input)
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses and queues nothing when the thread is outside the org', async () => {
    checkOrgOwned.mockImplementation(async (table: string) =>
      table === 'inbox_threads' ? 'not_found' : 'owned',
    )
    const result = await approveDraft('draft-1', input)
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('queues when both belong to the org', async () => {
    checkOrgOwned.mockResolvedValue('owned')
    const result = await approveDraft('draft-1', input)
    expect('ok' in result).toBe(true)
    expect(checkOrgOwned).toHaveBeenCalledWith('inbox_threads', 'thread-1', 'org-1')
    expect(checkOrgOwned).toHaveBeenCalledWith('mailbox_accounts', 'acct-1', 'org-1')
  })
})
