import { describe, it, expect, vi, afterEach } from 'vitest'
import type OpenAI from 'openai'
import { processReplyDrafterResponse, generateReplyDraft, type ModelCaller } from './index'
import { buildReplyDrafterUserPrompt } from './prompt'
import { InvalidCitationError, UnsupportedQuoteError } from './tools'
import type { WorkflowExecuteApi } from '@homeowner-portal/ai'

// These test the two load-bearing, deterministic pieces of W32's wiring
// without a live model or database (root vitest harness is pure-modules
// only — see vitest.config.ts):
//
//  1. processReplyDrafterResponse — the citation gate. An invented refId
//     must fail the whole run, not be quietly filtered out.
//  2. buildReplyDrafterUserPrompt — fragments and aiContext must render in
//     physically distinguishable sections, since aiContext must never be
//     mistaken for a citable source.

describe('processReplyDrafterResponse — citation gate', () => {
  const retrieved = [
    {
      refId: 'doc:c1',
      label: 'CC&Rs Art. VII',
      text: 'The by-laws say... members must pay dues on the 1st of each month.',
    },
    {
      refId: 'prop:context',
      label: 'Property record',
      text: 'Outstanding balance: $450.00. Thanks for your patience while we looked into this — real past reply text.',
    },
  ]

  function draftJson(citations: Array<{ refId: string; quote: string; label: string }>) {
    return JSON.stringify({
      subject: 'Re: dues question',
      body: 'Thanks for reaching out.',
      citations,
      blanks: [],
      grounded: true,
      groundingNote: null,
    })
  }

  it('accepts a draft that only cites retrieved refIds with quotes actually in the fragment', () => {
    const raw = draftJson([{ refId: 'doc:c1', quote: 'the by-laws say...', label: 'Bylaws' }])
    const output = processReplyDrafterResponse(raw, retrieved)
    // Label comes from the fragment, never from the model — see the
    // authoritative-label suite below.
    expect(output.citations).toEqual([
      { refId: 'doc:c1', quote: 'the by-laws say...', label: 'CC&Rs Art. VII' },
    ])
  })

  it('FAILS the whole run on an invented refId — not a filtered-out citation', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'members must pay dues', label: 'Bylaws' },
      { refId: 'doc:invented', quote: 'fake', label: 'Nowhere' },
    ])

    // Must throw — must NOT return an output with the bad citation quietly
    // dropped and the good one kept.
    expect(() => processReplyDrafterResponse(raw, retrieved)).toThrow(InvalidCitationError)
  })

  it('names the invented refId in the thrown error', () => {
    const raw = draftJson([{ refId: 'doc:not-retrieved', quote: 'fake', label: 'Nowhere' }])
    try {
      processReplyDrafterResponse(raw, retrieved)
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCitationError)
      expect((error as InvalidCitationError).invalidRefIds).toEqual(['doc:not-retrieved'])
    }
  })

  it('FAILS the run when a citation quotes text that is not actually in the cited fragment', () => {
    const raw = draftJson([{ refId: 'doc:c1', quote: 'this sentence appears nowhere in the fragment', label: 'Bylaws' }])
    expect(() => processReplyDrafterResponse(raw, retrieved)).toThrow(UnsupportedQuoteError)
  })

  it('FAILS the run when a citation quotes text lifted from a different retrieved fragment', () => {
    // "real past reply text" only exists in reply:m1, not doc:c1.
    const raw = draftJson([{ refId: 'doc:c1', quote: 'real past reply text', label: 'Bylaws' }])
    expect(() => processReplyDrafterResponse(raw, retrieved)).toThrow(UnsupportedQuoteError)
  })

  it('rejects unparseable JSON rather than silently proceeding', () => {
    expect(() => processReplyDrafterResponse('not json', retrieved)).toThrow()
  })

  describe('parse failure logging never leaks thread content', () => {
    afterEach(() => vi.restoreAllMocks())

    it('logs only errorName + responseLength — never the SyntaxError message, which embeds a prefix of the model output', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // A JSON.parse SyntaxError message embeds a prefix of this string,
      // which here stands in for a resident's PII the model drafted.
      const leaky = 'Sorry, resident John Smith at 123 Main St owes $450, not json'

      expect(() => processReplyDrafterResponse(leaky, retrieved)).toThrow()

      expect(spy).toHaveBeenCalledTimes(1)
      const loggedArgs = spy.mock.calls[0]
      const loggedText = JSON.stringify(loggedArgs)
      expect(loggedText).not.toContain('John Smith')
      expect(loggedText).not.toContain('123 Main St')
      expect(loggedText).not.toContain('$450')
      expect(loggedArgs[1]).toMatchObject({ errorName: 'SyntaxError', responseLength: leaky.length })
    })
  })
})

// ─── C2: the citation label is not model-authored ───────────────────────
//
// `validateCitations` checks refId membership and quote fidelity. It never
// looks at `label` — and `label` is the only part of a citation a board
// member sees, because DraftPanel renders `label — "quote"` and never shows
// the refId. So a model could pair a real quote from the property record
// with `label: 'CC&Rs §4.2'`, pass every gate, and manufacture an authority
// the reviewer has no way to catch. These tests pin the fix: the label is
// taken from the retrieved fragment and the model's is discarded outright.

describe('processReplyDrafterResponse — authoritative citation labels', () => {
  const retrieved = [
    { refId: 'doc:c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' },
    {
      refId: 'prop:context',
      label: 'Property record',
      text: 'Address: 12 Oak Ln\nOutstanding balance: $450.00\nOpen violations: 1',
    },
  ]

  function draftJson(citations: Array<{ refId: string; quote: string; label: string }>) {
    return JSON.stringify({
      subject: 'Re: your question',
      body: 'Thanks for reaching out.',
      citations,
      blanks: [],
      grounded: true,
      groundingNote: null,
    })
  }

  it('overwrites a model label that contradicts its fragment — the exact attack', () => {
    // A real, verbatim line from the PROPERTY RECORD, labelled as if it came
    // from the CC&Rs. Both existing gates pass: the refId was retrieved, and
    // the quote genuinely occurs in that fragment.
    const raw = draftJson([
      { refId: 'prop:context', quote: 'Outstanding balance: $450.00', label: 'CC&Rs §4.2' },
    ])

    const output = processReplyDrafterResponse(raw, retrieved)

    expect(output.citations).toHaveLength(1)
    expect(output.citations[0]!.label).toBe('Property record')
    expect(output.citations[0]!.label).not.toBe('CC&Rs §4.2')
    // The quote and refId are untouched — only the attribution is replaced.
    expect(output.citations[0]!.quote).toBe('Outstanding balance: $450.00')
    expect(output.citations[0]!.refId).toBe('prop:context')
  })

  it('yields the fragment label for a valid refId even when the model supplied a plausible one', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'Fences may not exceed six feet.', label: 'Bylaws Article 9' },
    ])

    const output = processReplyDrafterResponse(raw, retrieved)

    expect(output.citations[0]!.label).toBe('CC&Rs §4.2')
  })

  it('discards the model label rather than comparing it — an empty label still resolves', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'Fences may not exceed six feet.', label: '' },
    ])

    const output = processReplyDrafterResponse(raw, retrieved)

    expect(output.citations[0]!.label).toBe('CC&Rs §4.2')
  })

  it('labels every citation from its own fragment, not from the first one', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'Fences may not exceed six feet.', label: 'wrong' },
      { refId: 'prop:context', quote: 'Open violations: 1', label: 'also wrong' },
    ])

    const output = processReplyDrafterResponse(raw, retrieved)

    expect(output.citations.map((c) => c.label)).toEqual(['CC&Rs §4.2', 'Property record'])
  })

  it('never returns a label the model authored, for any citation', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'Fences may not exceed six feet.', label: 'FABRICATED' },
      { refId: 'prop:context', quote: 'Address: 12 Oak Ln', label: 'FABRICATED' },
    ])

    const output = processReplyDrafterResponse(raw, retrieved)

    const authoritative = new Set(retrieved.map((f) => f.label))
    for (const citation of output.citations) {
      expect(citation.label).not.toBe('FABRICATED')
      expect(authoritative.has(citation.label)).toBe(true)
    }
  })
})

describe('buildReplyDrafterUserPrompt — fragments vs aiContext separation', () => {
  const base = {
    threadSubject: 'Question about my fence',
    messages: [{ direction: 'inbound' as const, from: 'resident@example.com', text: 'Can I build a fence?' }],
    fragments: [{ refId: 'doc:c1', label: 'CC&Rs Art. IV', text: 'Fences require ARC approval.' }],
    voiceExamples: [],
    degraded: [],
    aiContext: { governingDocs: 'Fences generally need ARC sign-off.', stateLaw: null },
  }

  it('places fragment text under SOURCES, tagged with its refId', () => {
    const prompt = buildReplyDrafterUserPrompt(base)
    expect(prompt).toContain('SOURCES:')
    expect(prompt).toContain('refId: doc:c1')
    expect(prompt).toContain('Fences require ARC approval.')
  })

  it('places aiContext under a separate BACKGROUND section, never tagged with a refId', () => {
    const prompt = buildReplyDrafterUserPrompt(base)
    expect(prompt).toContain('BACKGROUND')
    expect(prompt).toContain('Fences generally need ARC sign-off.')

    // The two sections must be distinguishable: aiContext text must not
    // appear inside the SOURCES block, and must carry no refId.
    const sourcesBlock = prompt.slice(prompt.indexOf('SOURCES:'), prompt.indexOf('BACKGROUND'))
    expect(sourcesBlock).not.toContain('Fences generally need ARC sign-off.')

    const backgroundBlock = prompt.slice(prompt.indexOf('BACKGROUND'))
    expect(backgroundBlock).not.toContain('refId:')
  })

  it('omits the BACKGROUND section entirely when aiContext is empty', () => {
    const prompt = buildReplyDrafterUserPrompt({
      ...base,
      aiContext: { governingDocs: null, stateLaw: null },
    })
    expect(prompt).not.toContain('BACKGROUND')
  })
})

// ─── I1: past replies are voice samples, not citable sources ────────────
//
// The HOA's whole sent folder syncs, so the past-reply corpus contains
// correspondence about other households, with attorneys and with vendors.
// `search_reply_embeddings` returns the top 5 with no similarity floor, so
// five of them land in every draft regardless of relevance. While they were
// fragments each carried a refId, which made a verbatim quote from one
// resident's correspondence into a citation that passed every gate.

describe('buildReplyDrafterUserPrompt — voice examples are not citable', () => {
  const base = {
    threadSubject: 'Question about my fence',
    messages: [
      { direction: 'inbound' as const, from: 'resident@example.com', text: 'Can I build a fence?' },
    ],
    fragments: [{ refId: 'doc:c1', label: 'CC&Rs Art. IV', text: 'Fences require ARC approval.' }],
    voiceExamples: [
      {
        subject: 'Re: your balance',
        body: 'Hi Dana — thanks for writing. The Hendersons at 14 Oak settled their $2,300 lien last week.',
      },
    ],
    degraded: [],
    aiContext: { governingDocs: null, stateLaw: null },
  }

  it('renders voice examples in their own section, never inside SOURCES', () => {
    const prompt = buildReplyDrafterUserPrompt(base)

    expect(prompt).toContain('VOICE EXAMPLES')

    const sourcesBlock = prompt.slice(prompt.indexOf('SOURCES:'), prompt.indexOf('VOICE EXAMPLES'))
    expect(sourcesBlock).not.toContain('Hendersons')
  })

  it('gives a voice example no refId — nothing a citation could resolve against', () => {
    const prompt = buildReplyDrafterUserPrompt(base)

    const voiceBlock = prompt.slice(prompt.indexOf('VOICE EXAMPLES'))
    expect(voiceBlock).not.toContain('refId:')
    expect(voiceBlock).not.toContain('reply:')
  })

  it('omits the section entirely when there are no past replies', () => {
    const prompt = buildReplyDrafterUserPrompt({ ...base, voiceExamples: [] })
    expect(prompt).not.toContain('VOICE EXAMPLES')
  })

  it('tells the model the section is style-only and must not be quoted', () => {
    const prompt = buildReplyDrafterUserPrompt(base)
    const header = prompt.slice(prompt.indexOf('VOICE EXAMPLES'), prompt.indexOf('Subject:'))
    expect(header).toMatch(/NOT sources/)
    expect(header).toMatch(/no refId/)
  })
})

describe('processReplyDrafterResponse — a past reply can no longer be cited', () => {
  it('rejects a citation pointing at a past reply, because none is a fragment any more', () => {
    // Retrieval no longer mints `reply:<id>` refIds at all, so a model that
    // tries to cite one is citing something that does not exist.
    const retrieved = [
      { refId: 'doc:c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' },
    ]
    const raw = JSON.stringify({
      subject: 'Re: your question',
      body: 'Thanks for reaching out.',
      citations: [
        {
          refId: 'reply:m1',
          quote: 'The Hendersons at 14 Oak settled their $2,300 lien last week.',
          label: 'Past reply',
        },
      ],
      blanks: [],
      grounded: true,
      groundingNote: null,
    })

    expect(() => processReplyDrafterResponse(raw, retrieved)).toThrow(InvalidCitationError)
  })
})

// ─── generateReplyDraft — the corrective retry ──────────────────────────
//
// A real HOA hit this in production: retrieval found exactly the right
// CC&R clause, but the model's citation `quote` was not a verbatim
// substring of it, so `validateCitations` correctly discarded the whole
// draft — and the board member got nothing, with no idea why. These tests
// pin the fix: one, and only one, corrective retry naming exactly what
// failed, through the SAME validation gate, before giving up for real.

describe('generateReplyDraft — corrective retry on citation failure', () => {
  const fragments = [
    {
      refId: 'doc:1e2a16d4-example',
      sourceType: 'document' as const,
      label: 'CC&Rs — Stormwater Retention',
      text: 'The Association controls plant growth in and around stormwater retention ponds.',
    },
  ]

  const input = {
    threadSubject: 'Overgrown retention pond',
    messages: [{ direction: 'inbound' as const, from: 'resident@example.com', text: 'The pond is overgrown.' }],
    fragments,
    voiceExamples: [],
    degraded: [],
    aiContext: { governingDocs: null, stateLaw: null },
  }

  function fakeApi(): WorkflowExecuteApi {
    return {
      requireHumanApproval: vi.fn(),
      addCitations: vi.fn(),
      setConfidence: vi.fn(),
      setReasoning: vi.fn(),
      setTokens: vi.fn(),
      setModel: vi.fn(),
    }
  }

  function fakeCompletion(raw: string): { completion: OpenAI.Chat.ChatCompletion; raw: string } {
    return {
      completion: {
        model: 'test-model',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      } as unknown as OpenAI.Chat.ChatCompletion,
      raw,
    }
  }

  const goodDraft = JSON.stringify({
    subject: 'Re: pond',
    body: 'Thanks for flagging this.',
    citations: [
      {
        refId: 'doc:1e2a16d4-example',
        quote: 'The Association controls plant growth in and around stormwater retention ponds.',
        label: 'anything — overwritten',
      },
    ],
    blanks: [],
    grounded: true,
    groundingNote: null,
  })

  const badQuoteDraft = JSON.stringify({
    subject: 'Re: pond',
    body: 'Thanks for flagging this.',
    citations: [
      {
        refId: 'doc:1e2a16d4-example',
        quote: 'the association controls the plant growth around ponds', // paraphrased, not verbatim
        label: 'anything',
      },
    ],
    blanks: [],
    grounded: true,
    groundingNote: null,
  })

  it('recovers when the first attempt fails validation but the retry is a valid, verbatim quote', async () => {
    const calls: unknown[][] = []
    const callModel: ModelCaller = vi.fn(async (messages) => {
      calls.push(messages)
      return calls.length === 1 ? fakeCompletion(badQuoteDraft) : fakeCompletion(goodDraft)
    })
    const api = fakeApi()

    const output = await generateReplyDraft(input, api, callModel)

    expect(output.citations).toHaveLength(1)
    expect(output.citations[0]!.quote).toBe(
      'The Association controls plant growth in and around stormwater retention ponds.',
    )
    expect(callModel).toHaveBeenCalledTimes(2)
    // The retry must tell the model exactly which refId failed and that the
    // quote must be an exact substring — not a vague "try again".
    const retryUserMessage = calls[1]!.at(-1) as { role: string; content: string }
    expect(retryUserMessage.role).toBe('user')
    expect(retryUserMessage.content).toContain('doc:1e2a16d4-example')
    expect(retryUserMessage.content.toLowerCase()).toContain('exact substring')
    // The audit row must show a retry happened.
    expect(api.setReasoning).toHaveBeenCalledWith(expect.stringMatching(/retr/i))
  })

  it('throws when both attempts fail validation, and calls the model exactly twice — never a loop', async () => {
    const callModel: ModelCaller = vi.fn(async () => fakeCompletion(badQuoteDraft))
    const api = fakeApi()

    await expect(generateReplyDraft(input, api, callModel)).rejects.toThrow(UnsupportedQuoteError)
    expect(callModel).toHaveBeenCalledTimes(2)
  })

  it('makes clear in the thrown error that BOTH attempts failed, not just the second', async () => {
    const callModel: ModelCaller = vi.fn(async () => fakeCompletion(badQuoteDraft))
    const api = fakeApi()

    await expect(generateReplyDraft(input, api, callModel)).rejects.toThrow(/retry/i)
  })

  it('does not retry at all when the first attempt succeeds', async () => {
    const callModel: ModelCaller = vi.fn(async () => fakeCompletion(goodDraft))
    const api = fakeApi()

    const output = await generateReplyDraft(input, api, callModel)

    expect(output.citations).toHaveLength(1)
    expect(callModel).toHaveBeenCalledTimes(1)
    expect(api.setReasoning).not.toHaveBeenCalled()
  })

  it('never retries a non-citation failure (e.g. unparseable JSON) — that is not what the retry exists for', async () => {
    const callModel: ModelCaller = vi.fn(async () => fakeCompletion('not json'))
    const api = fakeApi()

    await expect(generateReplyDraft(input, api, callModel)).rejects.toThrow()
    expect(callModel).toHaveBeenCalledTimes(1)
  })

  it('sums token usage across both attempts rather than reporting only the retry', async () => {
    const callModel: ModelCaller = vi
      .fn()
      .mockResolvedValueOnce(fakeCompletion(badQuoteDraft))
      .mockResolvedValueOnce(fakeCompletion(goodDraft))
    const api = fakeApi()

    await generateReplyDraft(input, api, callModel)

    // Two attempts of 10 prompt / 5 completion tokens each.
    expect(api.setTokens).toHaveBeenLastCalledWith(20, 10)
  })
})
