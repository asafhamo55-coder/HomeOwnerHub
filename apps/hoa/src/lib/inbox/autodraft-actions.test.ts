import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-101 A3 — the server half of draft-on-open. The model is never called
 * here: `createDraft` (which owns the W32 call) is mocked, so these pin
 * only the gates in front of it — the server-side re-decision and the AI
 * rate limit.
 */

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'board' as const, org: { id: 'org-1', name: 'Madison Park' } })),
}))

const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } as { id: string } | null } }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const decision = vi.fn()
vi.mock('./autodraft', () => ({ loadAutoDraftDecision: (...args: unknown[]) => decision(...args) }))

const createDraft = vi.fn(async () => ({ ok: true as const, draftId: 'draft-9' }))
// BL-112: draft-on-open calls the unmetered core (createDraft, the button,
// now draws on board_ai itself — calling it here would charge twice).
vi.mock('@/lib/inbox/draft/generate-reply', () => ({
  generateReplyDraft: (...args: unknown[]) => createDraft(...(args as [])),
}))
vi.mock('@/lib/inbox/draft/actions', () => ({
  createDraft: () => {
    throw new Error('autoDraftOnOpen must not call the metered createDraft action')
  },
}))

const checkAndRecordAiUsage = vi.fn(async () => ({ usageId: 'usage-1' }))
vi.mock('@/lib/api/rate-limit', () => ({
  checkAndRecordAiUsage: (...args: unknown[]) => checkAndRecordAiUsage(...(args as [])),
}))

import { ApiRouteError } from '@/lib/api/errors'
import { autoDraftOnOpen } from './autodraft-actions'

const THREAD = '11111111-1111-4111-8111-111111111111'

describe('autoDraftOnOpen', () => {
  beforeEach(() => {
    decision.mockReset()
    createDraft.mockClear()
    checkAndRecordAiUsage.mockClear()
    checkAndRecordAiUsage.mockImplementation(async () => ({ usageId: 'usage-1' }))
  })

  it('re-decides on the server and spends nothing when the thread is not eligible', async () => {
    decision.mockResolvedValue({ draft: false, reason: 'already_drafted' })
    const result = await autoDraftOnOpen(THREAD)
    expect(result).toEqual({ skipped: 'already_drafted' })
    expect(decision).toHaveBeenCalledWith(expect.anything(), 'org-1', THREAD)
    expect(checkAndRecordAiUsage).not.toHaveBeenCalled()
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('draws on the inbox_autodraft bucket, then calls the existing createDraft unchanged', async () => {
    decision.mockResolvedValue({ draft: true, version: 'msg-2' })
    const result = await autoDraftOnOpen(THREAD)
    expect(checkAndRecordAiUsage).toHaveBeenCalledWith('inbox_autodraft', { orgId: 'org-1', userId: 'user-1' })
    expect(createDraft).toHaveBeenCalledWith(THREAD)
    expect(result).toEqual({ ok: true, draftId: 'draft-9' })
  })

  it('stops at the rate limit with the limiter message and no model call', async () => {
    decision.mockResolvedValue({ draft: true, version: 'msg-2' })
    checkAndRecordAiUsage.mockImplementation(async () => {
      throw new ApiRouteError('rate_limited', 'You’ve reached the limit of 60 automatic drafts an hour.')
    })
    const result = await autoDraftOnOpen(THREAD)
    expect(result).toEqual({ error: 'You’ve reached the limit of 60 automatic drafts an hour.', rateLimited: true })
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('refuses without a signed-in user', async () => {
    decision.mockResolvedValue({ draft: true, version: 'msg-2' })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await autoDraftOnOpen(THREAD)
    expect('error' in result).toBe(true)
    expect(createDraft).not.toHaveBeenCalled()
  })
})
