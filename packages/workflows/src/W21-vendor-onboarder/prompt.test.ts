import { describe, expect, it } from 'vitest'
import { findContactPII } from '@homeowner-portal/ai/pii'
import { userPromptFor } from './prompt'

// BL-062: grading needs to know the W-9 fields are present, not who the
// vendor is. A sole proprietor's W-9 carries a person's name and home
// address, and this prompt goes to the third-party model.

const requirements = {
  glPerOccurrenceMin: 1_000_000,
  glAggregateMin: null,
  workersCompRequired: true,
  autoLiabilityMin: null,
  additionalInsuredRequired: false,
  umbrellaMin: null,
  licenseRequiredFor: [],
}

describe('W21 userPromptFor', () => {
  it('sends W-9 presence, not the legal name, address or EIN', () => {
    const prompt = userPromptFor({
      vendorTrades: ['landscaping'],
      requirements,
      coi: null,
      w9: {
        legalName: 'Pat Owner',
        einMasked: '***-**-6789',
        address: '829 Pistace Ct, Miami FL 33101',
        classification: 'individual',
        extractionConfidence: 'HIGH',
      },
      license: null,
    })
    expect(prompt).not.toContain('Pat Owner')
    expect(prompt).not.toContain('829 Pistace')
    expect(prompt).not.toContain('6789')
    expect(findContactPII(prompt)).toEqual([])
    // Still gradeable: presence and the non-identifying fields arrive.
    expect(prompt).toContain('"legalName": "[on file]"')
    expect(prompt).toContain('"address": "[on file]"')
    expect(prompt).toContain('"classification": "individual"')
  })

  it('keeps a missing W-9 field missing, so the model can flag it', () => {
    const prompt = userPromptFor({
      vendorTrades: [],
      requirements,
      coi: null,
      w9: { legalName: null, einMasked: '  ', address: null, classification: null, extractionConfidence: 'LOW' },
      license: null,
    })
    expect(prompt).toContain('"legalName": null')
    expect(prompt).toContain('"einMasked": null')
  })
})
