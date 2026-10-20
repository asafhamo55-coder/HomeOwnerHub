import { describe, it, expect, vi } from 'vitest'
import { loadDraftQuality, recordDraftMetrics } from './metrics-store'
import type { DraftMetrics } from './metrics'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { heldDb, settle } from '@/lib/supabase/held-fake-db'

const D1 = '11111111-1111-4111-8111-111111111111'
const D2 = '22222222-2222-4222-8222-222222222222'
const D3 = '33333333-3333-4333-8333-333333333333'

function metrics(draftId: string, over: Partial<DraftMetrics> = {}): DraftMetrics {
  return {
    v: 1,
    draft_id: draftId,
    thread_id: null,
    ai_run_id: null,
    edit_ratio: 0.1,
    edit_words: 2,
    draft_words: 20,
    sent_words: 20,
    subject_edited: false,
    blanks_at_draft: 1,
    citations_total: 0,
    citations_in_draft: 0,
    citations_kept: 0,
    seconds_to_approve: 120,
    truncated: false,
    ...over,
  }
}

/** Records every filter call per table so scoping can be asserted. */
function fakeDb(auditRows: Array<{ id: string; org_id: string; metadata: unknown }>, cancelledIds: string[] = []) {
  const calls: Record<string, Array<[string, ...unknown[]]>> = {}
  const inserts: unknown[] = []
  const from = vi.fn((table: string) => {
    const log = (calls[table] ??= [])
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'in', 'order']) {
      chain[m] = (...args: unknown[]) => {
        log.push([m, ...args])
        return chain
      }
    }
    chain.range = async (from: number) => ({ data: from === 0 ? auditRows : [], error: null })
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: cancelledIds.map((id) => ({ id })), error: null })
    chain.insert = async (row: unknown) => {
      inserts.push(row)
      return { error: null }
    }
    return chain
  })
  return { db: { from }, calls, inserts }
}

describe('loadDraftQuality', () => {
  it('scopes both reads to the org when orgId is given', async () => {
    const { db, calls } = fakeDb([{ id: 'a1', org_id: 'org-1', metadata: metrics(D1) }])
    await loadDraftQuality(db, { orgId: 'org-1', now: new Date('2026-10-20T00:00:00Z') })
    expect(calls.audit_log).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(calls.audit_log).toContainEqual(['eq', 'action', 'inbox_draft_metrics'])
    expect(calls.audit_log).toContainEqual(['gte', 'created_at', '2026-09-20T00:00:00.000Z'])
    expect(calls.inbox_drafts).toContainEqual(['eq', 'organization_id', 'org-1'])
  })

  it('does not add an org filter for the platform aggregate', async () => {
    const { db, calls } = fakeDb([
      { id: 'a1', org_id: 'org-1', metadata: metrics(D1) },
      { id: 'a2', org_id: 'org-2', metadata: metrics(D2) },
    ])
    const q = await loadDraftQuality(db)
    expect(calls.audit_log.some(([m, col]) => m === 'eq' && col === 'org_id')).toBe(false)
    expect(q.orgs).toBe(2)
    expect(q.summary.drafts).toBe(2)
  })

  it('drops undone (cancelled) drafts and rows that fail the shape check', async () => {
    const { db } = fakeDb(
      [
        { id: 'a1', org_id: 'org-1', metadata: metrics(D1, { seconds_to_approve: 60 }) },
        { id: 'a2', org_id: 'org-1', metadata: metrics(D2) },
        { id: 'a3', org_id: 'org-1', metadata: { ...metrics(D3), body: 'Hi Jane' } },
      ],
      [D2],
    )
    const q = await loadDraftQuality(db, { orgId: 'org-1' })
    expect(q.summary.drafts).toBe(1)
    expect(q.summary.medianSecondsToApprove).toBe(60)
  })

  it('throws on a failed read, with the code only', async () => {
    const db = {
      from: () => {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'order']) chain[m] = () => chain
        chain.range = async () => ({ data: null, error: { code: '42501', message: 'row value Jane' } })
        return chain
      },
    }
    const err = await loadDraftQuality(db, { orgId: 'org-1' }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('draft metrics read failed (42501)')
  })
})

describe('recordDraftMetrics', () => {
  it('inserts one org-scoped audit_log row of numbers and ids', async () => {
    const { db, inserts } = fakeDb([])
    const ok = await recordDraftMetrics(db, { orgId: 'org-1', userId: 'user-1', metrics: metrics(D1) })
    expect(ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ action: 'inbox_draft_metrics', org_id: 'org-1', user_id: 'user-1', entity_id: D1 })
  })

  it('reports a failed insert without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { from: () => ({ insert: async () => ({ error: { code: '42501' } }) }) }
    expect(await recordDraftMetrics(db, { orgId: 'org-1', userId: 'user-1', metrics: metrics(D1) })).toBe(false)
    expect(spy.mock.calls[0][0]).toContain('42501')
    spy.mockRestore()
  })
})

describe('loadDraftQuality — cancelled-draft chunks (BL-099)', () => {
  it('checks every id chunk at once, not one after another', async () => {
    const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const audit_log = ids.map((id, i) => ({
      id: `a${String(i).padStart(4, '0')}`,
      org_id: 'org-1',
      action: 'inbox_draft_metrics',
      created_at: '2026-10-19T00:00:00Z',
      metadata: metrics(id),
    }))
    const inbox_drafts = [{ id: ids[0], organization_id: 'org-1', status: 'cancelled' }]
    const fake = cappedFakeDb({ audit_log, inbox_drafts })
    const h = heldDb(fake.db, ['inbox_drafts'])
    const result = loadDraftQuality(h.db as never, { orgId: 'org-1', now: new Date('2026-10-20T00:00:00Z') })
    await settle()
    // 400 draft ids in chunks of 150: three reads in flight together.
    expect(h.started.filter((t) => t === 'inbox_drafts')).toHaveLength(3)
    h.release()
    await expect(result).resolves.toBeTruthy()
  })
})
