import { describe, expect, it } from 'vitest'
import {
  filedDocumentName,
  filedStoragePath,
  inboxAttachmentPathOk,
  isAlreadyExistsError,
  suggestedDocumentName,
} from './attachment-file-rules'

// Synthetic ids only.
const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const THREAD = 't-1'
const ATT = 'a-1'
const ok = `${ORG}/inbox/${THREAD}/m-1/${ATT}/quote.pdf`
const expected = { orgId: ORG, threadId: THREAD, attachmentId: ATT }

describe('inboxAttachmentPathOk', () => {
  it('accepts exactly the shape the attachments job mints', () => {
    expect(inboxAttachmentPathOk(ok, expected)).toBe(true)
  })

  it.each([
    ['another org', `${OTHER}/inbox/${THREAD}/m-1/${ATT}/quote.pdf`],
    ['another thread', `${ORG}/inbox/t-2/m-1/${ATT}/quote.pdf`],
    ['another attachment', `${ORG}/inbox/${THREAD}/m-1/a-2/quote.pdf`],
    ['not the inbox prefix', `${ORG}/docs/${THREAD}/m-1/${ATT}/quote.pdf`],
    ['dot segment', `${ORG}/inbox/${THREAD}/../${ATT}/quote.pdf`],
    ['percent-encoded traversal', `${ORG}/inbox/${THREAD}/m-1/${ATT}/%2e%2e`],
    ['truncating #', `${ORG}/inbox/${THREAD}/m-1/${ATT}/a#b.pdf`],
    ['backslash', `${ORG}/inbox/${THREAD}/m-1/${ATT}/a\\b.pdf`],
    ['extra segment', `${ORG}/inbox/${THREAD}/m-1/${ATT}/x/quote.pdf`],
    ['empty segment', `${ORG}/inbox/${THREAD}//${ATT}/quote.pdf`],
  ])('refuses %s', (_label, path) => {
    expect(inboxAttachmentPathOk(path, expected)).toBe(false)
  })
})

describe('filing names and paths', () => {
  it('copies to one path per attachment, so a second filing collides', () => {
    expect(filedStoragePath(ORG, ATT, ok)).toBe(`${ORG}/from-inbox/${ATT}/quote.pdf`)
  })

  it('puts provenance in the name (no column until migration 0065)', () => {
    expect(filedDocumentName('Insurance certificate', '2026-10-20T14:03:00Z')).toBe(
      'Insurance certificate (from email, 2026-10-20)',
    )
    expect(filedDocumentName('  Plan ', null)).toBe('Plan (from email)')
    expect(filedDocumentName('x'.repeat(300), null).length).toBeLessThanOrEqual(200)
  })

  it('suggests the file name without its extension', () => {
    expect(suggestedDocumentName('COI 2026.pdf')).toBe('COI 2026')
    expect(suggestedDocumentName('README')).toBe('README')
  })

  it('recognises storage’s already-exists answer', () => {
    expect(isAlreadyExistsError({ message: 'The resource already exists', statusCode: '409' })).toBe(true)
    expect(isAlreadyExistsError({ message: 'Duplicate' })).toBe(true)
    expect(isAlreadyExistsError({ message: 'Bucket not found', statusCode: '404' })).toBe(false)
    expect(isAlreadyExistsError(null)).toBe(false)
  })
})
