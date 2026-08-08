import { describe, it, expect } from 'vitest'
import type { VendorRequestComposerOutput } from '@homeowner-portal/workflows'
import { buildVendorRequestBody } from './vendor-request-body'
import { hasUnfilledBlanks } from './blanks'

function outputWith(
  overrides: Partial<VendorRequestComposerOutput> = {},
): VendorRequestComposerOutput {
  return {
    subject: 'Roof leak — 412 Madison Park Dr, unit 8B',
    greeting: 'Hi Mike,',
    situation: 'The owner reports water intrusion in a second-floor bedroom.',
    asks: [{ text: 'Inspect the affected area.' }, { text: 'Send a written quote.' }],
    accessNotes: null,
    attachmentDigest: [],
    blanks: [],
    confidence: 'HIGH',
    ...overrides,
  }
}

const SIGNATURE = '— Madison Park HOA Board'

describe('buildVendorRequestBody', () => {
  it('numbers the asks from 1 under a "What we need:" heading', () => {
    const body = buildVendorRequestBody(outputWith(), SIGNATURE)

    expect(body).toContain('What we need:')
    expect(body).toContain('  1. Inspect the affected area.')
    expect(body).toContain('  2. Send a written quote.')
  })

  it('renders greeting, situation and signature in order', () => {
    const body = buildVendorRequestBody(outputWith(), SIGNATURE)

    expect(body.indexOf('Hi Mike,')).toBeLessThan(body.indexOf('The owner reports'))
    expect(body.indexOf('The owner reports')).toBeLessThan(body.indexOf('What we need:'))
    expect(body.indexOf('What we need:')).toBeLessThan(body.indexOf(SIGNATURE))
  })

  // A heading with nothing under it reads to the vendor as a drafting bug.
  it('omits the Access heading entirely when accessNotes is null', () => {
    const body = buildVendorRequestBody(outputWith({ accessNotes: null }), SIGNATURE)

    expect(body).not.toContain('Access:')
  })

  it('renders the Access heading when accessNotes is present', () => {
    const body = buildVendorRequestBody(
      outputWith({ accessNotes: 'The owner will meet you on site.' }),
      SIGNATURE,
    )

    expect(body).toContain('Access: The owner will meet you on site.')
  })

  it('omits the Attached block when the digest is empty', () => {
    const body = buildVendorRequestBody(outputWith({ attachmentDigest: [] }), SIGNATURE)

    expect(body).not.toContain('Attached:')
  })

  it('names the source file beside each attachment finding', () => {
    const body = buildVendorRequestBody(
      outputWith({
        attachmentDigest: [
          { fileName: 'estimate-2024.pdf', finding: 'prior roof work in March 2024' },
        ],
      }),
      SIGNATURE,
    )

    expect(body).toContain('Attached:')
    expect(body).toContain('  - estimate-2024.pdf — prior roof work in March 2024')
  })

  // The guardrail that makes D8 real: a blank the model placed must still be
  // a blank in the finished body, and must still block approve.
  it('carries a blank marker through verbatim, and hasUnfilledBlanks still catches it', () => {
    const body = buildVendorRequestBody(
      outputWith({
        asks: [{ text: 'Do not exceed [[BLANK: money]] without board approval.' }],
        blanks: [{ kind: 'money', prompt: 'What spending cap should the vendor be given?' }],
      }),
      SIGNATURE,
    )

    expect(body).toContain('[[BLANK: money]]')
    expect(hasUnfilledBlanks(body)).toBe(true)
  })

  it('leaves a body with no markers passing the blanks gate', () => {
    expect(hasUnfilledBlanks(buildVendorRequestBody(outputWith(), SIGNATURE))).toBe(false)
  })
})
