import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/inbox/queries', () => ({
  listThreadsForUnit: vi.fn(async () => [
    { id: 'thread-1', subject: 'This one', status: 'open', lastMessageAt: '2026-10-19' },
    { id: 'thread-home', subject: 'Earlier', status: 'closed', lastMessageAt: '2026-09-01' },
  ]),
}))

import { docFragmentsOf, readLinkedRecords, readPastThreads, readRelevantDocs } from './thread-context'

/** Thenable chain that ignores filters and returns the table's canned rows. */
function fakeDb(tables: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  return {
    calls,
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null }
      const chain: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
        maybeSingle: () => Promise.resolve(result),
      }
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'not', 'neq', 'ilike', 'limit']) {
        chain[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args })
          return chain
        }
      }
      return chain
    },
  }
}

describe('readLinkedRecords — every link is re-checked against its table and org', () => {
  it('drops a link to a missing row or another org’s row; links the rest', async () => {
    const db = fakeDb({
      inbox_thread_links: {
        data: [
          { resource_type: 'ticket', resource_id: 't1' },
          { resource_type: 'ticket', resource_id: 't-gone' },
          { resource_type: 'violation', resource_id: 'v-other-org' },
          { resource_type: 'arc_request', resource_id: 'a1' },
        ],
        error: null,
      },
      tickets: { data: [{ id: 't1', subject: 'Streetlight', status: 'open', organization_id: 'org-1' }], error: null },
      hoa_violations: { data: [{ id: 'v-other-org', violation_type: 'trailer', status: 'open', org_id: 'org-2' }], error: null },
      arc_requests: { data: [{ id: 'a1', summary: 'Fence', status: 'submitted', organization_id: 'org-1' }], error: null },
    })
    const out = await readLinkedRecords(db as never, 'org-1', 'thread-1')
    expect(out.failed).toBe(false)
    expect(out.items).toEqual([
      { type: 'ticket', id: 't1', label: 'Streetlight', status: 'open', href: '/tickets/t1' },
      { type: 'arc_request', id: 'a1', label: 'Fence', status: 'submitted', href: '/arc/a1' },
    ])
    // Org filter is on every per-type read, with hoa_violations' own column name.
    expect(db.calls).toContainEqual({ table: 'hoa_violations', method: 'eq', args: ['org_id', 'org-1'] })
    expect(db.calls).toContainEqual({ table: 'tickets', method: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('says it failed rather than showing an empty list', async () => {
    const db = fakeDb({ inbox_thread_links: { data: null, error: { code: '42501', message: 'denied' } } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await readLinkedRecords(db as never, 'org-1', 'thread-1')).toEqual({ items: [], failed: true })
  })
})

describe('readPastThreads', () => {
  it('merges this home’s threads with the sender’s, excluding the open thread', async () => {
    const db = fakeDb({
      inbox_messages: { data: [{ thread_id: 'thread-home' }, { thread_id: 'thread-sender' }], error: null },
      inbox_threads: {
        data: [
          { id: 'thread-home', subject: 'Earlier', status: 'closed', last_message_at: '2026-09-01' },
          { id: 'thread-sender', subject: 'Other home', status: 'open', last_message_at: '2026-10-01' },
        ],
        error: null,
      },
    })
    const out = await readPastThreads(db as never, 'org-1', 'thread-1', 'unit-12', 'w@example.test')
    expect(out.items.map((t) => [t.id, t.via])).toEqual([
      ['thread-sender', 'sender'],
      ['thread-home', 'both'],
    ])
    expect(db.calls).toContainEqual({ table: 'inbox_messages', method: 'neq', args: ['thread_id', 'thread-1'] })
  })
})

describe('readRelevantDocs — the last draft’s W1 hits, no model call', () => {
  it('lists retrieved doc sections, marks the cited ones, drops chunks not in this org', async () => {
    const db = fakeDb({
      inbox_drafts: { data: { ai_run_id: 'run-1', citations: [{ refId: 'doc:c2', quote: 'q', label: 'l' }] }, error: null },
      ai_runs: {
        data: {
          input: {
            fragments: [
              { refId: 'doc:c1', sourceType: 'document', label: 'CC&Rs 4.1', text: '…' },
              { refId: 'doc:c2', sourceType: 'document', label: 'CC&Rs 4.2', text: '…' },
              { refId: 'doc:c-gone', sourceType: 'document', label: 'Rules 9', text: '…' },
              { refId: 'acct:balance', sourceType: 'property', label: 'Account — balance', text: '…' },
            ],
          },
        },
        error: null,
      },
      governing_document_chunks: {
        data: [
          { id: 'c1', document_id: 'd1' },
          { id: 'c2', document_id: 'd1' },
        ],
        error: null,
      },
      governing_documents: { data: [{ id: 'd1', title: 'Declaration' }], error: null },
    })
    const out = await readRelevantDocs(db as never, 'org-1', 'thread-1')
    expect(out).toEqual({
      failed: false,
      drafted: true,
      items: [
        { refId: 'doc:c2', label: 'CC&Rs 4.2', documentTitle: 'Declaration', cited: true },
        { refId: 'doc:c1', label: 'CC&Rs 4.1', documentTitle: 'Declaration', cited: false },
      ],
    })
  })

  it('reports "not drafted yet" when there is no reply draft', async () => {
    const db = fakeDb({ inbox_drafts: { data: null, error: null } })
    expect(await readRelevantDocs(db as never, 'org-1', 'thread-1')).toEqual({ items: [], failed: false, drafted: false })
  })
})

describe('docFragmentsOf', () => {
  it('ignores malformed input and non-document fragments', () => {
    expect(docFragmentsOf(null)).toEqual([])
    expect(docFragmentsOf({ fragments: 'nope' })).toEqual([])
    expect(
      docFragmentsOf({
        fragments: [
          { refId: 'law:s1', sourceType: 'statute', label: 'x' },
          { refId: 'doc:c1', sourceType: 'document' },
          { refId: 'doc:c1', sourceType: 'document', label: 'dup' },
        ],
      }),
    ).toEqual([{ refId: 'doc:c1', label: 'Governing document' }])
  })
})
