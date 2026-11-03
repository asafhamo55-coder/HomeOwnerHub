import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  rpcRows: [] as Array<Record<string, unknown>>,
  rpcArgs: null as Record<string, unknown> | null,
  rpcCalls: [] as Array<Record<string, unknown>>,
  rpcByAssociation: null as Record<string, Array<Record<string, unknown>>> | null,
  docs: [] as Array<Record<string, unknown>>,
  docsError: null as { code: string } | null,
  docQueries: [] as Array<[string, unknown]>,
}))

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      h.rpcArgs = args
      h.rpcCalls.push(args)
      if (h.rpcByAssociation) return { data: h.rpcByAssociation[String(args.p_association_id)] ?? [], error: null }
      return { data: h.rpcRows, error: null }
    },
    from: () => {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          h.docQueries.push([c, v])
          return q
        },
        in: async (c: string, v: unknown) => {
          h.docQueries.push([c, v])
          return { data: h.docsError ? null : h.docs, error: h.docsError }
        },
      }
      return q
    },
  }),
}))
vi.mock('@homeowner-portal/ai', () => ({ embedTexts: vi.fn(), toPgVector: vi.fn() }))

import { GoverningDocsRetrievalError, filterVisibleChunks, retrieveChunks } from './tools'

const RESIDENT = ['declaration', 'bylaws', 'rules', 'amendment', 'policy']

function chunk(id: string, documentId: string, docType: string) {
  return { id, document_id: documentId, section: null, page_number: null, text: 't', metadata: null, doc_type: docType, effective_date: null, rank: 1 }
}

beforeEach(() => {
  h.rpcRows = [chunk('c1', 'd-rules', 'rules'), chunk('c2', 'd-min', 'minutes'), chunk('c3', 'd-ai', 'policy'), chunk('c4', 'd-old', 'bylaws')]
  h.docs = [
    { id: 'd-rules', type: 'rules', ai_generated: false, superseded_at: null },
    { id: 'd-min', type: 'minutes', ai_generated: false, superseded_at: null },
    { id: 'd-ai', type: 'policy', ai_generated: true, superseded_at: null },
    { id: 'd-old', type: 'bylaws', ai_generated: null, superseded_at: '2026-01-01T00:00:00Z' },
  ]
  h.docsError = null
  h.docQueries = []
  h.rpcArgs = null
  h.rpcCalls = []
  h.rpcByAssociation = null
})

describe('W1 retrieveChunks resident visibility (F-04)', () => {
  it('without a filter returns every chunk (board / server callers)', async () => {
    const out = await retrieveChunks('pets?', { organizationId: 'org-1', limit: 8 })
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(h.rpcArgs?.p_limit).toBe(8)
  })

  it('with a filter drops minutes, AI drafts and superseded docs, org-scoped', async () => {
    const out = await retrieveChunks('pets?', { organizationId: 'org-1', limit: 8, allowedDocTypes: RESIDENT })
    expect(out.map((c) => c.id)).toEqual(['c1'])
    expect(h.docQueries).toContainEqual(['organization_id', 'org-1'])
    expect(h.rpcArgs?.p_limit).toBe(50)
  })

  it('drops a chunk whose document row is missing (default-deny)', async () => {
    h.docs = []
    const out = await retrieveChunks('pets?', { organizationId: 'org-1', allowedDocTypes: RESIDENT })
    expect(out).toEqual([])
  })

  it('fails closed when the visibility lookup errors', async () => {
    h.docsError = { code: '57014' }
    await expect(
      retrieveChunks('pets?', { organizationId: 'org-1', allowedDocTypes: RESIDENT }),
    ).rejects.toBeInstanceOf(GoverningDocsRetrievalError)
  })

  it('an empty allowlist denies everything', () => {
    expect(filterVisibleChunks([{ documentId: 'd-rules' }], h.docs as never, [])).toEqual([])
  })
})

describe('W1 retrieveChunks association list', () => {
  it('searches only the listed associations and merges by score', async () => {
    h.rpcByAssociation = {
      'a-1': [{ ...chunk('c1', 'd-rules', 'rules'), rank: 0.4 }],
      'a-2': [{ ...chunk('c2', 'd-rules', 'rules'), rank: 0.9 }],
      'a-3': [{ ...chunk('c3', 'd-rules', 'rules'), rank: 1 }],
    }
    const out = await retrieveChunks('pets?', { organizationId: 'org-1', associationIds: ['a-1', 'a-2'], limit: 8 })
    expect(out.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(h.rpcCalls.map((c) => c.p_association_id).sort()).toEqual(['a-1', 'a-2'])
  })

  it('an empty list returns nothing and never searches the whole org', async () => {
    const out = await retrieveChunks('pets?', { organizationId: 'org-1', associationIds: [], limit: 8 })
    expect(out).toEqual([])
    expect(h.rpcCalls).toEqual([])
  })
})
