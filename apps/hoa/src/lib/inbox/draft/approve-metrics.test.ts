import { describe, it, expect, vi, beforeEach } from 'vitest'

// BL-101 A10: approving an AI reply records one numbers-only audit_log row.

const DRAFT_ID = '11111111-1111-4111-8111-111111111111'
const THREAD_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

let snapshot: Record<string, unknown> | null = null
const auditInserts: unknown[] = []
const draftEqs: Array<[string, unknown]> = []

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          insert: vi.fn(async (row: unknown) => {
            auditInserts.push(row)
            return { error: null }
          }),
        }
      }
      if (table === 'inbox_draft_attachments') {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
        }
        return c
      }
      let mode: 'read' | 'update' = 'read'
      const chain: Record<string, unknown> = {
        update: vi.fn(() => {
          mode = 'update'
          return chain
        }),
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => {
          if (table === 'inbox_drafts') draftEqs.push([col, val])
          return chain
        }),
        is: vi.fn(async () => ({ error: null })),
        maybeSingle: vi.fn(async () =>
          mode === 'read'
            ? { data: snapshot, error: null }
            : { data: { id: DRAFT_ID, thread_id: THREAD_ID }, error: null },
        ),
      }
      return chain
    }),
  })),
}))

vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveDraft } from './actions'

const sent = {
  subject: 'Re: Fence height',
  body: 'Hi Jane, fences may not exceed six feet. The fee is $25.',
  to: ['jane@example.com'],
  cc: [] as string[],
}

describe('approveDraft — draft quality metrics', () => {
  beforeEach(() => {
    auditInserts.length = 0
    draftEqs.length = 0
    snapshot = {
      kind: 'reply',
      status: 'draft',
      subject: 'Re: Fence height',
      body_text: 'Hi Jane, fences may not exceed six feet. The fee is [[BLANK: money]].',
      citations: [{ refId: 'doc:1', quote: 'fences may not exceed six feet', label: 'CC&Rs' }],
      created_at: new Date(Date.now() - 180_000).toISOString(),
      ai_run_id: RUN_ID,
    }
  })

  it('records one org-scoped row of ids and numbers, no text', async () => {
    const result = await approveDraft(DRAFT_ID, sent)
    expect('ok' in result).toBe(true)
    expect(auditInserts).toHaveLength(1)
    const row = auditInserts[0] as { org_id: string; user_id: string; metadata: Record<string, unknown> }
    expect(row).toMatchObject({ action: 'inbox_draft_metrics', org_id: 'org-1', user_id: 'user-1', entity_id: DRAFT_ID })
    expect(row.metadata).toMatchObject({ blanks_at_draft: 1, citations_in_draft: 1, citations_kept: 1, ai_run_id: RUN_ID })
    expect(row.metadata.seconds_to_approve as number).toBeGreaterThanOrEqual(179)
    const json = JSON.stringify(row)
    for (const text of ['Jane', 'jane@', 'Fence', 'six feet', '$25', 'BLANK', 'CC&Rs']) expect(json).not.toContain(text)
    // The snapshot read is scoped to the org too.
    expect(draftEqs).toContainEqual(['organization_id', 'org-1'])
  })

  it('records nothing for a forward or a draft with no AI run', async () => {
    snapshot = { ...snapshot!, kind: 'forward' }
    await approveDraft(DRAFT_ID, sent)
    snapshot = { ...snapshot!, kind: 'reply', ai_run_id: null }
    await approveDraft(DRAFT_ID, sent)
    expect(auditInserts).toHaveLength(0)
  })

  it('still approves when the snapshot read fails', async () => {
    snapshot = null
    const result = await approveDraft(DRAFT_ID, sent)
    expect('ok' in result).toBe(true)
    expect(auditInserts).toHaveLength(0)
  })
})
