import { describe, it, expect } from 'vitest'
import { processReplyDrafterResponse } from './index'
import { buildReplyDrafterUserPrompt } from './prompt'
import { InvalidCitationError } from './tools'

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
  const retrieved = ['doc:c1', 'reply:m1']

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

  it('accepts a draft that only cites retrieved refIds', () => {
    const raw = draftJson([{ refId: 'doc:c1', quote: 'the by-laws say...', label: 'Bylaws' }])
    const output = processReplyDrafterResponse(raw, retrieved)
    expect(output.citations).toEqual([{ refId: 'doc:c1', quote: 'the by-laws say...', label: 'Bylaws' }])
  })

  it('FAILS the whole run on an invented refId — not a filtered-out citation', () => {
    const raw = draftJson([
      { refId: 'doc:c1', quote: 'real', label: 'Bylaws' },
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

  it('rejects unparseable JSON rather than silently proceeding', () => {
    expect(() => processReplyDrafterResponse('not json', retrieved)).toThrow()
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
