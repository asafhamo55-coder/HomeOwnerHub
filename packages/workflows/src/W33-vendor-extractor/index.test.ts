import { describe, it, expect } from 'vitest'
import { processVendorExtractorResponse } from './index'

describe('processVendorExtractorResponse', () => {
  it('returns nulls for a signature-free email rather than inventing fields', () => {
    const raw = JSON.stringify({
      legalName: null,
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
    })

    const out = processVendorExtractorResponse(raw, { attachmentsProvided: false })

    expect(out.legalName).toBeNull()
    expect(out.primaryPhone).toBeNull()
    expect(out.trade).toBeNull()
    expect(out.address).toBeNull()
  })

  it('extracts the fields a signature block does state', () => {
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: 'ABC Lawn',
      primaryPhone: '(555) 201-4417',
      trade: 'landscaping',
      address: { line1: '18 Mill Rd', city: 'Durham', state: 'NC', postal_code: '27703' },
    })

    const out = processVendorExtractorResponse(raw, { attachmentsProvided: false })

    expect(out.legalName).toBe('ABC Landscaping LLC')
    expect(out.dba).toBe('ABC Lawn')
    expect(out.trade).toBe('landscaping')
    expect(out.address?.city).toBe('Durham')
  })

  it('drops an ein when no attachment was supplied — prose is not evidence', () => {
    // The original absolute rule existed because an EIN inferred from an
    // email body is a guess, and a wrong tax id corrupts 1099 reporting.
    // That reasoning still holds whenever there is no document behind it.
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
      ein: '12-3456789',
    })

    const out = processVendorExtractorResponse(raw, { attachmentsProvided: false })

    expect(out.ein).toBeNull()
  })

  it('keeps an ein from an attachment, normalised to nine digits', () => {
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
      ein: '12-3456789',
    })

    const out = processVendorExtractorResponse(raw, { attachmentsProvided: true })

    expect(out.ein).toBe('123456789')
  })

  it('drops a malformed ein even when an attachment was supplied', () => {
    // A W-9 is evidence, but a value that cannot be an EIN is a parse
    // artefact. Better blank than a wrong tax id nobody re-checks.
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
      ein: 'see attached',
    })

    const out = processVendorExtractorResponse(raw, { attachmentsProvided: true })

    expect(out.ein).toBeNull()
  })

  it('throws a non-technical error on unparseable JSON', () => {
    expect(() => processVendorExtractorResponse('not json at all', { attachmentsProvided: false })).toThrow(/unparseable/i)
  })

  it('throws rather than returning a partial object when a field has the wrong type', () => {
    const raw = JSON.stringify({
      legalName: 42,
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
    })

    expect(() =>
      processVendorExtractorResponse(raw, { attachmentsProvided: false }),
    ).toThrow()
  })
})
