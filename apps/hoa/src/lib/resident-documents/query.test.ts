import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { fetchResidentDocumentFile, fetchResidentDocuments, isUuid, parseDocSource } from './query'

const ID = '0b6f4a7e-6a43-4c1e-9f55-1d1e3c1c0a01'
const ORG = '9a1b2c3d-0000-4000-8000-000000000001'

type Resp = { data: unknown; error: { code?: string } | null }

/** A chainable stand-in for the Supabase query builder. Records every filter. */
function fakeClient(byTable: Record<string, Resp>) {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const client = {
    from(table: string) {
      const resp = byTable[table] ?? { data: null, error: null }
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'in', 'or']) {
        b[op] = (...args: unknown[]) => {
          calls.push({ table, op, args })
          return b
        }
      }
      b.maybeSingle = () => Promise.resolve(resp)
      b.then = (ok: (r: Resp) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resp).then(ok, bad)
      return b
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

describe('input parsing', () => {
  it('accepts only the two sources', () => {
    expect(parseDocSource('hoa')).toBe('hoa')
    expect(parseDocSource('governing')).toBe('governing')
    expect(parseDocSource('vendors')).toBeNull()
    expect(parseDocSource('')).toBeNull()
  })
  it('accepts only uuids', () => {
    expect(isUuid(ID)).toBe(true)
    expect(isUuid('../../etc')).toBe(false)
  })
})

describe('fetchResidentDocumentFile', () => {
  it('opens an allowlisted document with a file, scoped to the org', async () => {
    const { client, calls } = fakeClient({
      hoa_documents: { data: { type: 'bylaws', storage_path: `${ORG}/bylaws.pdf` }, error: null },
    })
    await expect(fetchResidentDocumentFile(client, ORG, 'hoa', ID)).resolves.toEqual({
      bucket: 'hoa-documents',
      path: `${ORG}/bylaws.pdf`,
    })
    expect(calls).toContainEqual({ table: 'hoa_documents', op: 'eq', args: ['org_id', ORG] })
  })

  it('never opens an internal type, even when the row is readable', async () => {
    const { client } = fakeClient({
      hoa_documents: { data: { type: 'other', storage_path: `${ORG}/letter.pdf` }, error: null },
    })
    await expect(fetchResidentDocumentFile(client, ORG, 'hoa', ID)).resolves.toBeNull()
  })

  it('refuses superseded, AI-generated and file-less governing documents', async () => {
    for (const row of [
      { type: 'rules', storage_path: 'x', ai_generated: false, superseded_at: '2026-01-01' },
      { type: 'policy', storage_path: 'x', ai_generated: true, superseded_at: null },
      { type: 'rules', storage_path: null, ai_generated: false, superseded_at: null },
      { type: 'minutes', storage_path: 'x', ai_generated: false, superseded_at: null },
    ]) {
      const { client } = fakeClient({ governing_documents: { data: row, error: null } })
      await expect(fetchResidentDocumentFile(client, ORG, 'governing', ID), JSON.stringify(row)).resolves.toBeNull()
    }
    const { client } = fakeClient({
      governing_documents: {
        data: { type: 'declaration', storage_path: `${ORG}/a/decl.pdf`, ai_generated: null, superseded_at: null },
        error: null,
      },
    })
    await expect(fetchResidentDocumentFile(client, ORG, 'governing', ID)).resolves.toEqual({
      bucket: 'governing-docs',
      path: `${ORG}/a/decl.pdf`,
    })
  })

  it('a missing row and a bad id both read as not found', async () => {
    const { client, calls } = fakeClient({ hoa_documents: { data: null, error: null } })
    await expect(fetchResidentDocumentFile(client, ORG, 'hoa', ID)).resolves.toBeNull()
    await expect(fetchResidentDocumentFile(client, ORG, 'hoa', 'nope')).resolves.toBeNull()
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(1)
  })

  it('throws on a failed read instead of reporting not found', async () => {
    const { client } = fakeClient({ hoa_documents: { data: null, error: { code: '42501' } } })
    await expect(fetchResidentDocumentFile(client, ORG, 'hoa', ID)).rejects.toThrow('hoa_documents: 42501')
  })
})

describe('fetchResidentDocuments', () => {
  it('filters to the allowlist in the query and again on the rows', async () => {
    const { client, calls } = fakeClient({
      hoa_documents: {
        data: [
          { id: 'h1', name: 'CC&Rs', type: 'ccr', storage_path: 'p', created_at: '2025-01-01T00:00:00Z' },
          // Should never come back given .in(), but if it does it is dropped.
          { id: 'h2', name: 'Demand letter', type: 'other', storage_path: 'p', created_at: '2025-01-01T00:00:00Z' },
        ],
        error: null,
      },
      hoa_document_versions: {
        data: [
          { document_id: 'h1', created_at: '2026-02-01T00:00:00Z' },
          { document_id: 'h1', created_at: '2026-04-01T00:00:00Z' },
        ],
        error: null,
      },
      governing_documents: {
        data: [
          { id: 'g1', title: 'Rules', type: 'rules', effective_date: '2026-03-01', storage_path: null, ai_generated: false, created_at: 'x', updated_at: 'x' },
          { id: 'g2', title: 'Draft', type: 'policy', effective_date: null, storage_path: 'p', ai_generated: true, created_at: 'x', updated_at: 'x' },
        ],
        error: null,
      },
    })
    const docs = await fetchResidentDocuments(client, ORG)
    expect(docs.map((d) => d.id)).toEqual(['h1', 'g1'])
    expect(docs[0]).toMatchObject({ updatedAt: '2026-04-01T00:00:00Z', hasFile: true })
    expect(docs[1]).toMatchObject({ effectiveDate: '2026-03-01', hasFile: false })
    expect(calls).toContainEqual({ table: 'hoa_documents', op: 'in', args: ['type', ['ccr', 'bylaws', 'rules']] })
    expect(calls).toContainEqual({ table: 'governing_documents', op: 'is', args: ['superseded_at', null] })
    expect(calls).toContainEqual({ table: 'governing_documents', op: 'eq', args: ['organization_id', ORG] })
  })

  it('throws when either table fails', async () => {
    const { client } = fakeClient({
      hoa_documents: { data: [], error: null },
      governing_documents: { data: null, error: { code: 'PGRST301' } },
    })
    await expect(fetchResidentDocuments(client, ORG)).rejects.toThrow('governing_documents: PGRST301')
  })
})

describe('M1 (BL-052): the board-set visible_to_owners flag', () => {
  const hoaRows = [
    { id: 'h1', name: 'CC&Rs', type: 'ccr', storage_path: 'p', created_at: 'x', visible_to_owners: false },
    { id: 'h2', name: 'Budget 2027', type: 'other', storage_path: 'p', created_at: 'x', visible_to_owners: true },
    { id: 'h3', name: 'Demand letter', type: 'other', storage_path: 'p', created_at: 'x', visible_to_owners: false },
  ]
  const govRows = [
    { id: 'g1', title: 'Insurance', type: 'other', effective_date: null, storage_path: 'p', ai_generated: false, created_at: 'x', updated_at: 'x', visible_to_owners: true },
    { id: 'g2', title: 'AI draft', type: 'other', effective_date: null, storage_path: 'p', ai_generated: true, created_at: 'x', updated_at: 'x', visible_to_owners: true },
  ]

  it('flag off: names no M1 column, filters by type, ignores a stray flag on the row', async () => {
    const { client, calls } = fakeClient({
      hoa_documents: { data: hoaRows, error: null },
      hoa_document_versions: { data: [], error: null },
      governing_documents: { data: govRows, error: null },
    })
    const docs = await fetchResidentDocuments(client, ORG, { m1: false })
    expect(docs.map((d) => d.id)).toEqual(['h1'])
    for (const c of calls.filter((c) => c.op === 'select')) expect(String(c.args[0])).not.toContain('visible_to_owners')
    expect(calls.some((c) => c.op === 'or')).toBe(false)
  })

  it('flag on: selects the flag, ORs it into the filter, and posts flagged documents', async () => {
    const { client, calls } = fakeClient({
      hoa_documents: { data: hoaRows, error: null },
      hoa_document_versions: { data: [], error: null },
      governing_documents: { data: govRows, error: null },
    })
    const docs = await fetchResidentDocuments(client, ORG, { m1: true })
    // AI-generated stays hidden even when flagged.
    expect(docs.map((d) => d.id)).toEqual(['h1', 'h2', 'g1'])
    expect(calls).toContainEqual({ table: 'hoa_documents', op: 'or', args: ['type.in.(ccr,bylaws,rules),visible_to_owners.is.true'] })
    expect(calls).toContainEqual({
      table: 'governing_documents',
      op: 'or',
      args: ['type.in.(declaration,bylaws,rules,amendment,policy),visible_to_owners.is.true'],
    })
    expect(calls.some((c) => c.op === 'in' && c.table !== 'hoa_document_versions')).toBe(false)
  })

  it('opens a flagged "other" file only with the flag on', async () => {
    const row = { data: { type: 'other', storage_path: `${ORG}/budget.pdf`, visible_to_owners: true }, error: null }
    const off = fakeClient({ hoa_documents: row })
    await expect(fetchResidentDocumentFile(off.client, ORG, 'hoa', ID, { m1: false })).resolves.toBeNull()
    expect(String(off.calls.find((c) => c.op === 'select')?.args[0])).toBe('type, storage_path')
    const on = fakeClient({ hoa_documents: row })
    await expect(fetchResidentDocumentFile(on.client, ORG, 'hoa', ID, { m1: true })).resolves.toEqual({
      bucket: 'hoa-documents',
      path: `${ORG}/budget.pdf`,
    })
  })
})
