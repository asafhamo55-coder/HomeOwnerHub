import { beforeEach, describe, expect, it, vi } from 'vitest'

// saveDraft / deleteDraft / loadDraft: board-only, and every write is
// limited to rows still status='draft' and not deleted, so a late autosave
// can never revive a sent draft or touch a sent message.

const U1 = '11111111-1111-4111-8111-111111111111'

type Call = { op: string; args: unknown[] }

const h = vi.hoisted(() => ({
  gate: { ok: true } as { ok: boolean; error?: string },
  calls: [] as { op: string; args: unknown[] }[],
  updateRows: [{ id: '11111111-1111-4111-8111-111111111111' }] as { id: string }[],
  insertRow: { id: '33333333-3333-4333-8333-333333333333' } as { id: string } | null,
  loadRow: null as unknown,
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    let table = ''
    let mode = ''
    const b: Record<string, unknown> = {}
    const rec = (op: string) => (...args: unknown[]) => {
      h.calls.push({ op, args })
      if (op === 'from') table = String(args[0])
      if (op === 'update' || op === 'insert') mode = op
      return b
    }
    for (const op of ['from', 'update', 'insert', 'eq', 'is', 'neq']) b[op] = rec(op)
    b.select = (...args: unknown[]) => {
      h.calls.push({ op: 'select', args })
      if (mode === 'update') return Promise.resolve({ data: h.updateRows, error: null })
      return b
    }
    b.single = async () =>
      table === 'associations'
        ? { data: { organization_id: 'org-1' }, error: null }
        : { data: h.insertRow, error: h.insertRow ? null : { message: 'x' } }
    b.maybeSingle = async () => ({ data: h.loadRow, error: null })
    return b
  },
}))

const { saveDraft, deleteDraft, loadDraft } = await import('./draft-actions')
const { DRAFT_STATE_VERSION } = await import('./drafts')

function draft(over: Record<string, unknown> = {}) {
  return {
    v: DRAFT_STATE_VERSION,
    step: 1,
    templateId: '',
    baseCategory: 'announcement',
    audience: 'everyone',
    subject: 'Pool closed',
    bodyHtml: '<p>Closed</p>',
    channels: ['email'],
    answers: {},
    ...over,
  }
}

const eqs = (calls: Call[]) => calls.filter((c) => c.op === 'eq' || c.op === 'is').map((c) => c.args)

beforeEach(() => {
  h.gate = { ok: true }
  h.calls = []
  h.updateRows = [{ id: U1 }]
  h.insertRow = { id: '33333333-3333-4333-8333-333333333333' }
  h.loadRow = null
})

describe('saveDraft', () => {
  it('board only', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await saveDraft({ id: null, state: draft() })).toEqual({ ok: false, error: 'denied' })
    expect(h.calls).toHaveLength(0)
  })

  it('inserts a new draft as status draft with no send time', async () => {
    const res = await saveDraft({ id: null, state: draft() })
    expect(res).toEqual({ ok: true, id: '33333333-3333-4333-8333-333333333333' })
    const insert = h.calls.find((c) => c.op === 'insert')?.args[0] as Record<string, unknown>
    expect(insert).toMatchObject({
      status: 'draft',
      association_id: 'assoc-1',
      organization_id: 'org-1',
      scheduled_for: null,
      related_resource: null,
    })
    expect((insert.audience_definition as { kind: string }).kind).toBe('draft')
  })

  it('does not create a row for an empty composer', async () => {
    const res = await saveDraft({ id: null, state: draft({ subject: '', bodyHtml: '' }) })
    expect(res.ok).toBe(false)
    expect(h.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('updates only a row that is still an undeleted draft', async () => {
    expect(await saveDraft({ id: U1, state: draft() })).toEqual({ ok: true, id: U1 })
    expect(eqs(h.calls)).toEqual(
      expect.arrayContaining([
        ['id', U1],
        ['association_id', 'assoc-1'],
        ['status', 'draft'],
        ['deleted_at', null],
      ]),
    )
  })

  it('reports gone when the draft was sent or deleted, and never re-inserts it', async () => {
    h.updateRows = []
    const res = await saveDraft({ id: U1, state: draft() })
    expect(res).toMatchObject({ ok: false, gone: true })
    expect(h.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('refuses an unreadable or oversized state', async () => {
    expect((await saveDraft({ id: null, state: { v: 0 } })).ok).toBe(false)
    expect((await saveDraft({ id: null, state: draft({ bodyHtml: 'x'.repeat(300 * 1024) }) })).ok).toBe(false)
    expect(h.calls).toHaveLength(0)
  })
})

describe('deleteDraft', () => {
  it('soft-deletes only a draft row', async () => {
    expect(await deleteDraft(U1)).toEqual({ ok: true })
    const update = h.calls.find((c) => c.op === 'update')?.args[0] as Record<string, unknown>
    expect(Object.keys(update)).toEqual(['deleted_at'])
    expect(eqs(h.calls)).toEqual(expect.arrayContaining([['status', 'draft'], ['deleted_at', null]]))
  })

  it('says so when nothing matched (already sent or deleted)', async () => {
    h.updateRows = []
    expect((await deleteDraft(U1)).ok).toBe(false)
  })

  it('board only', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await deleteDraft(U1)).toEqual({ ok: false, error: 'denied' })
  })
})

describe('loadDraft', () => {
  it('returns the stored composer state of a draft', async () => {
    h.loadRow = { id: U1, audience_definition: { kind: 'draft', composer: draft() } }
    const res = await loadDraft(U1)
    expect(res?.id).toBe(U1)
    expect(res?.state.subject).toBe('Pool closed')
    expect(eqs(h.calls)).toEqual(expect.arrayContaining([['status', 'draft']]))
  })

  it('null for a bad id or a row with no draft state', async () => {
    expect(await loadDraft('nope')).toBeNull()
    h.loadRow = { id: U1, audience_definition: { kind: 'everyone' } }
    expect(await loadDraft(U1)).toBeNull()
  })
})
