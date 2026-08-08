import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  processVendorRequestResponse,
  buildVendorRequestUserPrompt,
  VENDOR_REQUEST_BLANK_KINDS,
  type VendorRequestComposerOutput,
} from './index'
import type { VendorRequestPromptContext } from './prompt'

// ─── Fixtures ────────────────────────────────────────────────────────

function contextWith(
  overrides: Partial<VendorRequestPromptContext> = {},
): VendorRequestPromptContext {
  return {
    intent: 'inspect_quote',
    freeTextInstruction: null,
    neededBy: '2026-08-15',
    threadSubject: 'water coming through my ceiling',
    messages: [
      { direction: 'inbound', from: 'owner@example.com', text: 'There is a stain on my ceiling.' },
    ],
    property: { addressLine1: '412 Madison Park Dr', unitNumber: '8B' },
    vendor: { legalName: "Mike's Roofing LLC", dba: null, trades: ['roofing'] },
    attachmentText: null,
    photoFindings: [],
    degraded: [],
    ...overrides,
  }
}

const VALID_OUTPUT: VendorRequestComposerOutput = {
  subject: 'Roof leak — 412 Madison Park Dr, unit 8B',
  greeting: 'Hi Mike,',
  situation: 'The owner reports water intrusion in a second-floor bedroom.',
  asks: [{ text: 'Inspect the affected area.' }],
  accessNotes: null,
  attachmentDigest: [],
  blanks: [],
  confidence: 'HIGH',
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Prompt rendering ────────────────────────────────────────────────

describe('buildVendorRequestUserPrompt', () => {
  it('states the intent and its brief', () => {
    const prompt = buildVendorRequestUserPrompt(contextWith({ intent: 'emergency' }))

    expect(prompt).toContain('INTENT: emergency')
    expect(prompt).toContain('respond urgently')
  })

  it('renders the property as the job site, with the unit', () => {
    expect(buildVendorRequestUserPrompt(contextWith())).toContain(
      'PROPERTY (the job site): 412 Madison Park Dr, unit 8B',
    )
  })

  it('tells the model not to state an address when the property is unknown', () => {
    const prompt = buildVendorRequestUserPrompt(contextWith({ property: null }))

    expect(prompt).toContain('do not state an address')
  })

  // Rule 6 forbids naming the resident. Handing the model their email address
  // in a `from` field it is then told not to use is a trap worth not setting.
  it('labels messages by role and never leaks the sender address', () => {
    const prompt = buildVendorRequestUserPrompt(contextWith())

    expect(prompt).toContain('[OWNER]')
    expect(prompt).not.toContain('owner@example.com')
  })

  it('labels board messages distinctly from owner messages', () => {
    const prompt = buildVendorRequestUserPrompt(
      contextWith({
        messages: [{ direction: 'outbound', from: 'board@hoa.org', text: 'We will look into it.' }],
      }),
    )

    expect(prompt).toContain('[BOARD]')
    expect(prompt).not.toContain('[OWNER]')
  })

  it('renders the UNAVAILABLE section only when something degraded', () => {
    expect(buildVendorRequestUserPrompt(contextWith())).not.toContain('UNAVAILABLE')
    expect(buildVendorRequestUserPrompt(contextWith({ degraded: ['property'] }))).toContain(
      'UNAVAILABLE',
    )
  })

  it('renders DOCUMENTS only when attachment text was extracted', () => {
    expect(buildVendorRequestUserPrompt(contextWith())).not.toContain('DOCUMENTS')
    expect(
      buildVendorRequestUserPrompt(contextWith({ attachmentText: '--- w9.pdf ---\nAcme Inc' })),
    ).toContain('DOCUMENTS')
  })

  // The vision producer does not exist yet (spec D9); the empty case is the
  // normal one and must not show the model a heading to populate.
  it('renders no PHOTO FINDINGS section when there are none', () => {
    expect(buildVendorRequestUserPrompt(contextWith())).not.toContain('PHOTO FINDINGS')
  })

  it('renders PHOTO FINDINGS when a producer supplies them', () => {
    const prompt = buildVendorRequestUserPrompt(
      contextWith({ photoFindings: [{ fileName: 'ceiling.jpg', finding: 'brown staining' }] }),
    )

    expect(prompt).toContain('PHOTO FINDINGS')
    expect(prompt).toContain('ceiling.jpg: brown staining')
  })

  it('includes the free-text instruction only for intent=other', () => {
    const instruction = 'find out if it is the roof or their own plumbing'

    expect(
      buildVendorRequestUserPrompt(
        contextWith({ intent: 'inspect_quote', freeTextInstruction: instruction }),
      ),
    ).not.toContain('INSTRUCTION')

    expect(
      buildVendorRequestUserPrompt(contextWith({ intent: 'other', freeTextInstruction: instruction })),
    ).toContain(instruction)
  })

  it('flags a missing deadline rather than omitting the field', () => {
    expect(buildVendorRequestUserPrompt(contextWith({ neededBy: null }))).toContain(
      'NEEDED BY: (not given',
    )
  })
})

// ─── Response processing ─────────────────────────────────────────────

describe('processVendorRequestResponse', () => {
  it('parses and validates a well-formed response', () => {
    expect(processVendorRequestResponse(JSON.stringify(VALID_OUTPUT))).toEqual(VALID_OUTPUT)
  })

  it('throws a non-leaking error on unparseable JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => processVendorRequestResponse('not json at all')).toThrow(
      'The model returned an unparseable response',
    )
  })

  // The parse error message embeds a prefix of the offending input, which is
  // the model's rendering of a resident's complaint and address.
  it('never logs the raw response body', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => processVendorRequestResponse('{ "situation": "412 Madison Park')).toThrow()

    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('Madison')
    expect(logged).toContain('responseLength')
  })

  it('rejects a response missing a required field', () => {
    const { subject: _dropped, ...withoutSubject } = VALID_OUTPUT

    expect(() => processVendorRequestResponse(JSON.stringify(withoutSubject))).toThrow()
  })

  // An empty asks array is the one output that makes the feature pointless:
  // a vendor email with no request in it.
  it('rejects an empty asks array', () => {
    expect(() =>
      processVendorRequestResponse(JSON.stringify({ ...VALID_OUTPUT, asks: [] })),
    ).toThrow()
  })

  it('rejects more than six asks', () => {
    expect(() =>
      processVendorRequestResponse(
        JSON.stringify({
          ...VALID_OUTPUT,
          asks: Array.from({ length: 7 }, (_, i) => ({ text: `ask ${i}` })),
        }),
      ),
    ).toThrow()
  })

  it('accepts every declared blank kind', () => {
    for (const kind of VENDOR_REQUEST_BLANK_KINDS) {
      const parsed = processVendorRequestResponse(
        JSON.stringify({ ...VALID_OUTPUT, blanks: [{ kind, prompt: 'fill this' }] }),
      )
      expect(parsed.blanks[0].kind).toBe(kind)
    }
  })

  it('rejects a blank kind it does not declare', () => {
    expect(() =>
      processVendorRequestResponse(
        JSON.stringify({ ...VALID_OUTPUT, blanks: [{ kind: 'enforcement', prompt: 'x' }] }),
      ),
    ).toThrow()
  })

  // Deliberate non-behavior, documented on the function: reconciling `blanks`
  // against the markers in the text would fail closed on the model's most
  // common formatting slip and throw away a usable work order.
  it('does not require blanks[] to agree with the markers in the text', () => {
    const parsed = processVendorRequestResponse(
      JSON.stringify({
        ...VALID_OUTPUT,
        situation: 'Cap the spend at [[BLANK: money]].',
        blanks: [],
      }),
    )

    expect(parsed.situation).toContain('[[BLANK: money]]')
    expect(parsed.blanks).toEqual([])
  })
})
