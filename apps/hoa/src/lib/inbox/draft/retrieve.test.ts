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
// BL-101 A2: the disclosure gate and the account read are mocked so the
// gating decision in retrieveForThread runs for real without a database.
vi.mock('@/lib/inbox/account-context', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/inbox/account-context')>()),
  checkSenderForUnit: vi.fn(async (_db: unknown, _org: string, unitId: string | null) =>
    unitId ? { verified: false, reason: 'not_a_resident' } : { verified: false, reason: 'not_filed' },
  ),
  loadHomeAccount: vi.fn(),
}))

// BL-101 A8: the attachment reader is mocked so the gate around it runs for
// real; its own extraction is covered by attachment-context.test.ts.
vi.mock('./attachment-context', () => ({
  loadAttachmentContext: vi.fn(async () => ({
    excerpts: [{ label: 'Attachment 1 (PDF)', excerpt: 'Invoice total for fence repair.' }],
    failed: false,
  })),
}))

import { loadAttachmentContext } from './attachment-context'
import {
  collectFragments,
  fetchGoverningDocChunkTexts,
  fetchStatuteChunkTexts,
  retrieveForThread,
  type SourceResults,
} from './retrieve'
import { getThreadDetail, getPropertyContext } from '@/lib/inbox/queries'
import { queryGoverningDocs, askStateLaw } from '@homeowner-portal/workflows'
import { findSimilarReplies } from './past-replies'
import { findContactPII } from '@homeowner-portal/ai/pii'
import { WITHHELD_REASON, checkSenderForUnit, loadHomeAccount } from '@/lib/inbox/account-context'

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

// ─── BL-062: contact details the drafter does not need ──────────────────
//
// W1 / W30 get the latest inbound email as their search question, and W32
// gets the conversation and past replies. None of them needs a resident's
// email address or phone number, and every one is a third-party AI call.

describe('retrieveForThread — contact PII stays out of AI inputs (BL-062)', () => {
  function mockEmptySources() {
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      clarification: null,
      recommendation: null,
      runId: 'r1',
    })
    vi.mocked(askStateLaw).mockResolvedValue({ answer: '', confidence: 'LOW', citations: [], disclaimer: '', runId: 'r2' })
  }

  it('sends no email or phone to W1, W30, the reply embedder, or W32', async () => {
    const body = 'My fence blew down, how tall can the new one be?\n--\nPat Owner\npat@example.com\n(305) 555-0142'
    const thread = threadWithInboundMessage()
    thread.messages[0] = {
      ...thread.messages[0]!,
      fromName: null as never,
      fromEmail: 'pat@example.com' as never,
      bodyText: body,
      strippedText: body,
    }
    vi.mocked(getThreadDetail).mockResolvedValue(thread)
    mockEmptySources()
    vi.mocked(findSimilarReplies).mockResolvedValueOnce({
      replies: [{ messageId: 'x', subject: 'Re: gate', body: 'Thanks! Call Sam at 305-555-0199 or sam@example.org.' }],
      degraded: [],
    } as never)

    const result = await retrieveForThread(buildCallerDb({ state: 'GA' }) as never, 'org-1', 'thread-1')

    const sentToAi = JSON.stringify({
      w1: vi.mocked(queryGoverningDocs).mock.calls.at(-1)![0],
      w30: vi.mocked(askStateLaw).mock.calls.at(-1)![0],
      embed: vi.mocked(findSimilarReplies).mock.calls.at(-1)![2],
      // Everything retrieveForThread hands W32 (actions.ts createDraft).
      w32: { messages: result.messages, fragments: result.fragments, voiceExamples: result.voiceExamples },
    })
    expect(findContactPII(sentToAi)).toEqual([])
    // Not vacuous: the question and the tone sample still arrive.
    expect(sentToAi).toContain('how tall can the new one be')
    expect(sentToAi).toContain('Thanks! Call Sam at [phone removed]')
    expect(result.messages[0]!.from).toBe('Resident')
  })

  it('caps the W1 / W30 question at their 2000-character schema limit', async () => {
    const thread = threadWithInboundMessage()
    const long = 'Fence question. '.repeat(200)
    thread.messages[0] = { ...thread.messages[0]!, bodyText: long, strippedText: long }
    vi.mocked(getThreadDetail).mockResolvedValue(thread)
    mockEmptySources()
    await retrieveForThread(buildCallerDb({ state: 'GA' }) as never, 'org-1', 'thread-1')
    expect(vi.mocked(queryGoverningDocs).mock.calls.at(-1)![0].length).toBeLessThanOrEqual(2000)
    expect(vi.mocked(askStateLaw).mock.calls.at(-1)![0].length).toBeLessThanOrEqual(2000)
  })
})

// ─── BL-101 A2: account-grounded drafts and the disclosure gate ─────────

describe('retrieveForThread — account facts only for a verified resident of the home', () => {
  function filedThread(fromEmail: string) {
    const t = threadWithInboundMessage()
    return {
      ...t,
      unitId: 'unit-12',
      matchConfidence: 'high',
      messages: [
        {
          ...t.messages[0]!,
          fromEmail,
          bodyText: 'What do I owe for 12 Example Ct?',
          strippedText: 'What do I owe for 12 Example Ct?',
        },
      ],
    }
  }
  const propertyContext = {
    propertyId: 'prop-12',
    address: '12 Example Ct',
    unitNumber: null,
    residents: [{ id: 'res-1', name: 'Synthetic Owner', role: 'owner', email: 'owner@example.test', phone: null }],
    duesBalance: 412.5,
    duesOverdueCount: 1,
    openViolations: 1,
    openArcRequests: [],
    openTickets: [],
    lastCommunication: { subject: 'Q4 dues — $375.00', sentAt: '2026-10-01' },
    degraded: [],
  }
  const account = {
    account: {
      homes: 1,
      balanceCents: 41250,
      openChargeCount: 1,
      pastDueCount: 1,
      nextDueDate: '2026-10-01',
      openCharges: [{ type: 'Regular assessment', dueDate: '2026-10-01', amountCents: 41250, pastDue: true, home: null }],
      lastPayment: null,
      today: '2026-10-19',
      truncated: false,
    },
    plan: { visible: false as const },
    requests: { tickets: [], arcApplications: [], violationsOnMyHome: [], reportedConcerns: [] },
    degraded: [],
  }
  function mockSources() {
    vi.mocked(getPropertyContext).mockResolvedValue(propertyContext as never)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      clarification: null,
      recommendation: null,
      runId: 'r1',
    })
    vi.mocked(askStateLaw).mockResolvedValue({ answer: '', confidence: 'LOW', citations: [], disclaimer: '', runId: 'r2' })
    vi.mocked(loadHomeAccount).mockResolvedValue(account as never)
  }

  it('a verified resident gets the real figure as a citable acct: fragment, checked on the reply address', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(filedThread('Owner@Example.test') as never)
    mockSources()
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: true, residentId: 'res-1', via: 'resident_email' })

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(vi.mocked(checkSenderForUnit).mock.calls.at(-1)!.slice(2)).toEqual(['unit-12', 'owner@example.test', { threadId: 'thread-1' }])
    expect(result.accountDisclosure).toBe('included')
    expect(result.accountNote).toBeNull()
    const balance = result.fragments.find((f) => f.refId === 'acct:balance')
    expect(balance?.text).toContain('$412.50')
    // No contact details reach the model, even for a verified resident.
    expect(findContactPII(JSON.stringify(result.fragments))).toEqual([])
  })

  it('a neighbour asking about the same home gets counts only, no figure, and a withheld reason', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(filedThread('neighbour@example.test') as never)
    mockSources()

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(result.accountDisclosure).toBe('withheld')
    expect(result.accountNote).toBe(WITHHELD_REASON.not_a_resident)
    expect(loadHomeAccount).not.toHaveBeenCalled()
    expect(result.fragments.some((f) => f.refId.startsWith('acct:'))).toBe(false)
    const everything = JSON.stringify(result.fragments)
    expect(everything).not.toMatch(/\$\d/)
    expect(everything).not.toContain('Synthetic Owner')
    expect(everything).not.toContain('Q4 dues')
    // Counts still help the reply.
    expect(result.fragments.find((f) => f.refId === 'prop:context')!.text).toContain('Open violations: 1')
  })

  it('a failed gate withholds exactly like "not a resident"', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(filedThread('owner@example.test') as never)
    mockSources()
    vi.mocked(checkSenderForUnit).mockRejectedValueOnce(new Error('boom'))

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(result.accountDisclosure).toBe('withheld')
    expect(result.accountNote).toBe(WITHHELD_REASON.check_failed)
    expect(result.fragments.some((f) => f.refId.startsWith('acct:'))).toBe(false)
  })

  it('an unfiled thread carries the not-filed reason and no account read', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithInboundMessage())
    mockSources()
    vi.mocked(getPropertyContext).mockResolvedValue(null)

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(result.accountDisclosure).toBe('none')
    expect(result.accountNote).toBe(WITHHELD_REASON.not_filed)
    expect(loadHomeAccount).not.toHaveBeenCalled()
  })
})

describe('retrieveForThread — resident attachment excerpts (BL-101 A8)', () => {
  function threadWithFile(fromEmail: string, opts: { withFile?: boolean; unitId?: string | null } = {}) {
    const t = threadWithInboundMessage()
    return {
      ...t,
      unitId: opts.unitId === undefined ? 'unit-12' : opts.unitId,
      messages: [
        {
          ...t.messages[0]!,
          id: 'm-file',
          fromEmail,
          attachments:
            opts.withFile === false
              ? []
              : [{ id: 'att-1', fileName: 'invoice.pdf', sizeBytes: 1000, fetchStatus: 'stored' }],
        },
      ],
    }
  }
  function mockQuietSources() {
    vi.mocked(getPropertyContext).mockResolvedValue(null)
    vi.mocked(queryGoverningDocs).mockResolvedValue({
      answer: '',
      confidence: 'LOW',
      citations: [],
      clarification: null,
      recommendation: null,
      runId: 'r1',
    })
    vi.mocked(askStateLaw).mockResolvedValue({ answer: '', confidence: 'LOW', citations: [], disclaimer: '', runId: 'r2' })
    vi.mocked(loadHomeAccount).mockResolvedValue({
      account: null,
      plan: { visible: false },
      requests: { tickets: [], arcApplications: [], violationsOnMyHome: [], reportedConcerns: [] },
      degraded: [],
    } as never)
  }

  it('a verified sender: excerpts are included as uncitable context, never as fragments', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('Owner@Example.test') as never)
    mockQuietSources()
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: true, residentId: 'res-1', via: 'resident_email' })

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(result.attachmentDisclosure).toBe('included')
    expect(result.attachmentContext).toEqual([{ label: 'Attachment 1 (PDF)', excerpt: 'Invoice total for fence repair.' }])
    // Only the sender's own message ids are read.
    expect(vi.mocked(loadAttachmentContext).mock.calls[0]!.slice(1, 4)).toEqual(['org-1', 'thread-1', ['m-file']])
    expect(JSON.stringify(result.fragments)).not.toContain('Invoice total')
  })

  it('a sender who is not a resident: nothing is read and nothing is included', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('neighbour@example.test') as never)
    mockQuietSources()

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(loadAttachmentContext).not.toHaveBeenCalled()
    expect(result.attachmentContext).toEqual([])
    expect(result.attachmentDisclosure).toBe('withheld')
  })

  it('a sender_unauthenticated sender (BL-105): withheld, never downloaded', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('owner@example.test') as never)
    mockQuietSources()
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: false, reason: 'sender_unauthenticated' })

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(loadAttachmentContext).not.toHaveBeenCalled()
    expect(result.attachmentContext).toEqual([])
    expect(result.attachmentDisclosure).toBe('withheld')
  })

  it('a failed gate withholds the attachments too', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('owner@example.test') as never)
    mockQuietSources()
    vi.mocked(checkSenderForUnit).mockRejectedValueOnce(new Error('boom'))

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(loadAttachmentContext).not.toHaveBeenCalled()
    expect(result.attachmentContext).toEqual([])
    expect(result.attachmentDisclosure).toBe('withheld')
  })

  it('an unfiled thread (not_filed) gets no attachment text', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('owner@example.test', { unitId: null }) as never)
    mockQuietSources()

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(loadAttachmentContext).not.toHaveBeenCalled()
    expect(result.attachmentContext).toEqual([])
  })

  it('no attachment: no read, empty context, nothing marked degraded', async () => {
    vi.mocked(loadAttachmentContext).mockClear()
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('owner@example.test', { withFile: false }) as never)
    mockQuietSources()
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: true, residentId: 'res-1', via: 'resident_email' })

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(loadAttachmentContext).not.toHaveBeenCalled()
    expect(result.attachmentContext).toEqual([])
    expect(result.attachmentDisclosure).toBe('none')
    expect(result.degraded).not.toContain('resident_attachments')
  })

  it('a verified sender whose files yield no text is marked degraded, not silently empty', async () => {
    vi.mocked(loadAttachmentContext).mockResolvedValueOnce({ excerpts: [], failed: true })
    vi.mocked(getThreadDetail).mockResolvedValue(threadWithFile('owner@example.test') as never)
    mockQuietSources()
    vi.mocked(checkSenderForUnit).mockResolvedValueOnce({ verified: true, residentId: 'res-1', via: 'resident_email' })

    const result = await retrieveForThread(buildCallerDb({}) as never, 'org-1', 'thread-1')

    expect(result.attachmentContext).toEqual([])
    expect(result.degraded).toContain('resident_attachments')
  })
})
