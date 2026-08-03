import { describe, it, expect, vi } from 'vitest'

// Mocked so `retrieveForThread` (below) can be exercised end-to-end without
// a database or network calls, while still running the REAL drop-decision
// loops in retrieve.ts around the governing-docs and statute citations.
// `fetchStatuteCitations` is internal/unexported, so this is the only way
// to reach that loop from a test — its counterpart on the docs side is
// inlined directly in `retrieveForThread` and is reachable the same way.
vi.mock('@/lib/inbox/queries', () => ({
  getThreadDetail: vi.fn(),
  getPropertyContext: vi.fn(),
}))
vi.mock('@homeowner-portal/workflows', () => ({
  queryGoverningDocs: vi.fn(),
  askStateLaw: vi.fn(),
}))
vi.mock('./past-replies', () => ({
  findSimilarReplies: vi.fn(async () => ({ replies: [], degraded: [] })),
}))

import {
  collectFragments,
  fetchGoverningDocChunkTexts,
  fetchStatuteChunkTexts,
  retrieveForThread,
  type SourceResults,
} from './retrieve'
import { getThreadDetail, getPropertyContext } from '@/lib/inbox/queries'
import { queryGoverningDocs, askStateLaw } from '@homeowner-portal/workflows'

/**
 * Minimal chainable `.from().select().eq().in()` stand-in. Both fetch
 * helpers await the result of `.in(...)`, so the chain only needs to be
 * thenable-compatible there — `await nonPromise` resolves immediately to
 * the value, so a plain return works without wrapping in a real Promise.
 */
function dbWithChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => result),
  }
  return { from: vi.fn(() => chain), _chain: chain }
}

describe('collectFragments', () => {
  const base: SourceResults = {
    docs: { citations: [{ chunkId: 'c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' }] },
    statutes: { citations: [] },
    property: null,
    pastReplies: [],
    degraded: [],
  }

  it('gives every fragment a refId that is unique across sources', () => {
    const withOverlap: SourceResults = {
      ...base,
      statutes: { citations: [{ chunkId: 'c1', label: 'O.C.G.A. §44-3-76', text: 'Statutory text.' }] },
    }
    const { fragments } = collectFragments(withOverlap)
    const ids = fragments.map((f) => f.refId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries degraded sources through rather than hiding them', () => {
    const { degraded } = collectFragments({ ...base, degraded: ['dues', 'past_replies'] })
    expect(degraded).toEqual(['dues', 'past_replies'])
  })

  it('produces no fragments when every source is empty', () => {
    const { fragments } = collectFragments({
      docs: { citations: [] },
      statutes: { citations: [] },
      property: null,
      pastReplies: [],
      degraded: [],
    })
    expect(fragments).toEqual([])
  })

  // ─── I1 ───────────────────────────────────────────────────────────────
  // `fragments` is exactly the set `validateCitations` resolves a citation
  // against. Past replies are other residents' (and attorneys', and
  // vendors') correspondence, pulled in with no similarity floor, so keeping
  // them out of that set is what makes quoting them impossible rather than
  // merely forbidden.
  const withPastReply: SourceResults = {
    docs: { citations: [] },
    statutes: { citations: [] },
    property: null,
    pastReplies: [
      {
        messageId: 'm1',
        subject: 'Re: your balance',
        body: 'The Hendersons at 14 Oak settled their $2,300 lien last week.',
      },
    ],
    degraded: [],
  }

  it('never turns a past reply into a citable fragment', () => {
    const { fragments } = collectFragments(withPastReply)

    expect(fragments).toEqual([])
    expect(fragments.some((f) => f.refId.startsWith('reply:'))).toBe(false)
  })

  it('returns past replies as voice examples instead, with no refId or message id', () => {
    const { voiceExamples } = collectFragments(withPastReply)

    expect(voiceExamples).toEqual([
      {
        subject: 'Re: your balance',
        body: 'The Hendersons at 14 Oak settled their $2,300 lien last week.',
      },
    ])
    // No handle anything downstream could turn back into a citable ref.
    expect(Object.keys(voiceExamples[0]!)).toEqual(['subject', 'body'])
  })

  it('keeps real sources citable while past replies are not', () => {
    const { fragments, voiceExamples } = collectFragments({
      ...withPastReply,
      docs: {
        citations: [{ chunkId: 'c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' }],
      },
    })

    expect(fragments.map((f) => f.refId)).toEqual(['doc:c1'])
    expect(voiceExamples).toHaveLength(1)
  })
})

describe('fetchGoverningDocChunkTexts', () => {
  it('returns the chunk\'s own text, not a synthesized answer', async () => {
    const db = dbWithChain({
      data: [{ id: 'c1', text: 'Fences may not exceed six feet in height.' }],
      error: null,
    })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(failed).toBe(false)
    expect(texts.get('c1')).toBe('Fences may not exceed six feet in height.')
  })

  it('scopes the lookup to the organization', async () => {
    const db = dbWithChain({ data: [], error: null })

    await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(db._chain.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(db._chain.in).toHaveBeenCalledWith('id', ['c1'])
  })

  it('omits a chunk id that returns no row, rather than inventing text for it', async () => {
    // c1 was cited but the query only found c2 — e.g. the chunk was deleted
    // after W1 retrieved it.
    const db = dbWithChain({ data: [{ id: 'c2', text: 'Some other section.' }], error: null })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1', 'c2'])

    expect(failed).toBe(false)
    expect(texts.has('c1')).toBe(false)
    expect(texts.get('c2')).toBe('Some other section.')
  })

  it('checks the read error and degrades instead of throwing', async () => {
    const db = dbWithChain({
      data: null,
      error: { code: '08006', message: 'connection reset' },
    })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', ['c1'])

    expect(failed).toBe(true)
    expect(texts.size).toBe(0)
  })

  it('does not query when there are no chunk ids', async () => {
    const db = dbWithChain({ data: [], error: null })

    const { texts, failed } = await fetchGoverningDocChunkTexts(db as never, 'org-1', [])

    expect(failed).toBe(false)
    expect(texts.size).toBe(0)
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('fetchStatuteChunkTexts', () => {
  it("returns the chunk's own text from the `content` column, and does not filter by org", async () => {
    const db = dbWithChain({
      data: [{ id: 's1', content: 'A board must give 30 days notice before a special assessment.' }],
      error: null,
    })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(false)
    expect(texts.get('s1')).toBe(
      'A board must give 30 days notice before a special assessment.',
    )
    expect(db._chain.eq).not.toHaveBeenCalled()
    expect(db._chain.in).toHaveBeenCalledWith('id', ['s1'])
  })

  it('omits a chunk id that returns no row', async () => {
    const db = dbWithChain({ data: [], error: null })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(false)
    expect(texts.has('s1')).toBe(false)
  })

  it('checks the read error and degrades instead of throwing', async () => {
    const db = dbWithChain({
      data: null,
      error: { code: '08006', message: 'connection reset' },
    })

    const { texts, failed } = await fetchStatuteChunkTexts(db as never, ['s1'])

    expect(failed).toBe(true)
    expect(texts.size).toBe(0)
  })
})

// ─── Caller-path drop decision ──────────────────────────────────────────
//
// The tests above only prove `fetchGoverningDocChunkTexts` /
// `fetchStatuteChunkTexts` correctly report which chunk ids are missing.
// Nothing above proves the CALLER acts on that report. The drop decision
// itself lives in two loops inside `retrieveForThread` (one for governing
// docs, one — inside the unexported `fetchStatuteCitations` — for
// statutes), both of the shape `if (!text) { missing = true; continue }`.
// A regression changing either to `text: texts.get(id) ?? ''` would still
// pass every test above while emitting a citation with an empty quote.
// These tests run `retrieveForThread` end-to-end (with the network/DB
// edges mocked) specifically to exercise those two loops for real.

/**
 * Builds a `db` stand-in that dispatches by table name, covering every
 * `.from(...)` call `retrieveForThread` makes directly (i.e. not through
 * `getThreadDetail`/`getPropertyContext`, which are mocked out above):
 * the association-state lookup, and both chunk-text lookups.
 */
function buildCallerDb(opts: {
  state?: string | null
  docChunks?: Array<{ id: string; text: string }>
  statuteChunks?: Array<{ id: string; content: string }>
}) {
  const associations = {
    select: vi.fn(() => associations),
    eq: vi.fn(() => associations),
    order: vi.fn(() => associations),
    limit: vi.fn(() => associations),
    maybeSingle: vi.fn(async () => ({
      data: opts.state ? { state: opts.state } : null,
      error: null,
    })),
  }
  const governingDocChunks = {
    select: vi.fn(() => governingDocChunks),
    eq: vi.fn(() => governingDocChunks),
    in: vi.fn(async () => ({ data: opts.docChunks ?? [], error: null })),
  }
  const statuteChunks = {
    select: vi.fn(() => statuteChunks),
    in: vi.fn(async () => ({ data: opts.statuteChunks ?? [], error: null })),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'associations') return associations
      if (table === 'governing_document_chunks') return governingDocChunks
      if (table === 'state_statute_chunks') return statuteChunks
      throw new Error(`buildCallerDb: unexpected table "${table}"`)
    }),
  }
}

/** A thread with one inbound message, so retrieval proceeds past the
 * early-return for an empty thread. No unit attached, so the property rail
 * is skipped — irrelevant to the citation drop decision under test. */
function threadWithInboundMessage() {
  return {
    id: 'thread-1',
    subject: 'Synthetic test subject — fence question',
    status: 'open',
    unitId: null,
    vendorId: null,
    matchConfidence: 'none',
    matchReason: null,
    matchSource: 'unmatched',
    messages: [
      {
        id: 'm1',
        direction: 'inbound' as const,
        fromName: 'Synthetic Resident',
        fromEmail: null,
        toEmails: [],
        subject: 'Synthetic test subject — fence question',
        bodyText: 'How tall can my fence be?',
        strippedText: 'How tall can my fence be?',
        sentAt: '2026-01-01T00:00:00Z',
        attachments: [],
        forwardedTo: null,
      },
    ],
  }
}

describe('retrieveForThread — governing-doc citation drop decision', () => {
  it('drops a citation whose chunk text could not be resolved, keeps one that could, and records the loss in degraded', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithInboundMessage())
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: 'Fences may be up to six feet under the CC&Rs.',
      confidence: 'HIGH',
      citations: [
        { chunkId: 'c1', documentId: 'd1', docType: 'CC&Rs', section: '4.2' },
        { chunkId: 'c2', documentId: 'd1', docType: 'CC&Rs', section: '4.3' },
      ],
      clarification: null,
      recommendation: null,
      runId: 'run-docs-1',
    })
    vi.mocked(askStateLaw).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      disclaimer: 'Not legal advice.',
      runId: 'run-law-1',
    })

    // Only c1's row comes back — c2 was cited by W1 but its chunk is gone.
    const db = buildCallerDb({ docChunks: [{ id: 'c1', text: 'Fences may not exceed six feet.' }] })

    const result = await retrieveForThread(db as never, 'org-1', 'thread-1')

    const docFragments = result.fragments.filter((f) => f.sourceType === 'document')
    expect(docFragments.map((f) => f.refId)).toEqual(['doc:c1'])
    expect(docFragments[0]!.text).toBe('Fences may not exceed six feet.')
    expect(result.fragments.some((f) => f.refId === 'doc:c2')).toBe(false)
    expect(result.degraded).toContain('governing_documents_chunk_text')
  })

  it('never emits a fragment with empty-string text', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithInboundMessage())
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: 'Fences may be up to six feet under the CC&Rs.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'CC&Rs', section: '4.2' }],
      clarification: null,
      recommendation: null,
      runId: 'run-docs-2',
    })
    vi.mocked(askStateLaw).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      disclaimer: 'Not legal advice.',
      runId: 'run-law-2',
    })

    // No rows at all come back for the cited chunk.
    const db = buildCallerDb({ docChunks: [] })

    const result = await retrieveForThread(db as never, 'org-1', 'thread-1')

    expect(result.fragments.every((f) => f.text !== '')).toBe(true)
    expect(result.fragments.some((f) => f.refId === 'doc:c1')).toBe(false)
    expect(result.degraded).toContain('governing_documents_chunk_text')
  })
})

describe('retrieveForThread — statute citation drop decision', () => {
  it('drops a citation whose chunk text could not be resolved, keeps one that could, and records the loss in degraded', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithInboundMessage())
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      clarification: null,
      recommendation: null,
      runId: 'run-docs-3',
    })
    vi.mocked(askStateLaw).mockResolvedValue({
      answer: 'Georgia law requires 30 days notice before a special assessment.',
      confidence: 'HIGH',
      citations: [
        { chunkId: 's1', statuteId: 'st1', codeCitation: 'O.C.G.A. §44-3-76', title: 'Notice', category: null },
        { chunkId: 's2', statuteId: 'st1', codeCitation: 'O.C.G.A. §44-3-77', title: 'Notice two', category: null },
      ],
      disclaimer: 'Not legal advice.',
      runId: 'run-law-3',
    })

    // Association resolves to a supported state so askStateLaw is reached.
    // Only s1's row comes back — s2 was cited but its chunk is gone.
    const db = buildCallerDb({
      state: 'GA',
      statuteChunks: [{ id: 's1', content: 'A board must give 30 days notice before a special assessment.' }],
    })

    const result = await retrieveForThread(db as never, 'org-1', 'thread-1')

    const statuteFragments = result.fragments.filter((f) => f.sourceType === 'statute')
    expect(statuteFragments.map((f) => f.refId)).toEqual(['law:s1'])
    expect(statuteFragments[0]!.text).toBe(
      'A board must give 30 days notice before a special assessment.',
    )
    expect(result.fragments.some((f) => f.refId === 'law:s2')).toBe(false)
    expect(result.degraded).toContain('state_law_chunk_text')
  })

  it('never emits a fragment with empty-string text', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithInboundMessage())
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      clarification: null,
      recommendation: null,
      runId: 'run-docs-4',
    })
    vi.mocked(askStateLaw).mockResolvedValue({
      answer: 'Georgia law requires 30 days notice before a special assessment.',
      confidence: 'HIGH',
      citations: [
        { chunkId: 's1', statuteId: 'st1', codeCitation: 'O.C.G.A. §44-3-76', title: 'Notice', category: null },
      ],
      disclaimer: 'Not legal advice.',
      runId: 'run-law-4',
    })

    // No rows at all come back for the cited chunk.
    const db = buildCallerDb({ state: 'GA', statuteChunks: [] })

    const result = await retrieveForThread(db as never, 'org-1', 'thread-1')

    expect(result.fragments.every((f) => f.text !== '')).toBe(true)
    expect(result.fragments.some((f) => f.refId === 'law:s1')).toBe(false)
    expect(result.degraded).toContain('state_law_chunk_text')
  })
})
