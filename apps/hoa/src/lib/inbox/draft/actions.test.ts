import { describe, it, expect, vi } from 'vitest'

/**
 * Regression guard for Fix 1 of the "Could not draft a reply right now"
 * incident.
 *
 * `createDraft` (actions.ts) branches on `error instanceof
 * InvalidCitationError || error instanceof UnsupportedQuoteError` to show a
 * specific, actionable message instead of the generic fallback. But
 * `draftReply` -> `replyDrafter.execute` goes through `defineWorkflow`
 * (packages/ai/src/workflow.ts), which used to catch whatever W32's run()
 * threw and re-throw a bare `new Error(...)`  — losing the original error
 * class entirely, so that `instanceof` check could never match and every
 * citation failure fell through to "Could not draft a reply right now,"
 * with no indication of what actually happened or that retrying might help.
 *
 * The fix: `defineWorkflow` now re-throws with `{ cause: originalError }`,
 * and `createDraft` checks `error.cause instanceof ...` too. This test
 * exercises that exact shape — a wrapped `Error` carrying the real
 * `UnsupportedQuoteError` as `.cause`, mirroring what the real wrapper now
 * produces — and asserts `createDraft` recognises it and returns the
 * specific, non-technical message rather than the generic one.
 *
 * Mutation check (see task report): reverting the `createDraft` branch to
 * the bare `error instanceof ...` check (no `.cause` check) makes this test
 * fail, confirming it actually guards the fix rather than passing vacuously.
 */

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(),
  })),
}))

vi.mock('./retrieve', () => ({
  retrieveForThread: vi.fn(async () => ({
    threadSubject: 'Overgrown retention pond',
    messages: [],
    fragments: [],
    voiceExamples: [],
    degraded: [],
    aiContext: { governingDocs: null, stateLaw: null },
  })),
}))

vi.mock('@homeowner-portal/jobs', () => ({
  inngest: { send: vi.fn() },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Keep the REAL InvalidCitationError/UnsupportedQuoteError classes (this is
// exactly what production wiring uses) and only override `draftReply` per
// test, so the `instanceof` checks under test are against the real classes,
// not a test double.
vi.mock('@homeowner-portal/workflows', async () => {
  const actual = await vi.importActual<typeof import('@homeowner-portal/workflows')>(
    '@homeowner-portal/workflows',
  )
  return {
    ...actual,
    draftReply: vi.fn(),
  }
})

import { createDraft } from './actions'
import { draftReply, UnsupportedQuoteError, InvalidCitationError } from '@homeowner-portal/workflows'

describe('createDraft — citation-failure branch survives defineWorkflow\'s error wrapping', () => {
  it('recognises an UnsupportedQuoteError wrapped as `.cause` and returns the specific message', async () => {
    const wrapped = new Error('workflow_W32_failed: UnsupportedQuoteError: Draft cited 1 source(s)...', {
      cause: new UnsupportedQuoteError(['doc:1e2a16d4-example']),
    })
    vi.mocked(draftReply).mockRejectedValueOnce(wrapped)

    const result = await createDraft('thread-1')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).not.toBe('Could not draft a reply right now.')
      expect(result.error).toMatch(/could not be verified/i)
      expect(result.error).toMatch(/trying again/i)
      // Non-technical: no refIds, class names, or model-output leakage.
      expect(result.error).not.toMatch(/UnsupportedQuoteError/)
      expect(result.error).not.toMatch(/doc:1e2a16d4/)
    }
  })

  it('recognises an InvalidCitationError wrapped as `.cause` the same way', async () => {
    const wrapped = new Error('workflow_W32_failed: InvalidCitationError: Draft cited 1 source(s)...', {
      cause: new InvalidCitationError(['doc:invented']),
    })
    vi.mocked(draftReply).mockRejectedValueOnce(wrapped)

    const result = await createDraft('thread-1')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).not.toBe('Could not draft a reply right now.')
      expect(result.error).toMatch(/could not be verified/i)
    }
  })

  it('still falls back to the generic message for an unrelated workflow failure', async () => {
    vi.mocked(draftReply).mockRejectedValueOnce(new Error('workflow_W32_failed: Error: boom'))

    const result = await createDraft('thread-1')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('Could not draft a reply right now.')
    }
  })
})
