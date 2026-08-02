import { describe, it, expect, vi, afterEach } from 'vitest'
import { processReplyDrafterResponse } from './index'
import { buildReplyDrafterUserPrompt } from './prompt'
import { InvalidCitationError, UnsupportedQuoteError } from './tools'

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
    { refId: 'doc:c1', text: 'The by-laws say... members must pay dues on the 1st of each month.' },
    { refId: 'reply:m1', text: 'Thanks for your patience while we looked into this — real past reply text.' },
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
    expect(output.citations).toEqual([{ refId: 'doc:c1', quote: 'the by-laws say...', label: 'Bylaws' }])
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

describe('buildReplyDrafterUserPrompt — fragments vs aiContext separation', () => {
  const base = {
    threadSubject: 'Question about my fence',
    messages: [{ direction: 'inbound' as const, from: 'resident@example.com', text: 'Can I build a fence?' }],
    fragments: [{ refId: 'doc:c1', label: 'CC&Rs Art. IV', text: 'Fences require ARC approval.' }],
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
