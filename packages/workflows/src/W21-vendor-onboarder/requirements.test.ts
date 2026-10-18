import { describe, expect, it } from 'vitest'
import { signVendorInsuranceSettings, withVendorInsuranceSettings } from '../vendor-insurance/settings'
import { applyMinimums, requirementsFor } from './requirements'

const ASSOC = 'assoc-1'
const SECRET = 's'

describe('W21 requirementsFor (BL-084: read path)', () => {
  it('reads the board’s saved minimums from compliance_settings', () => {
    const cs = withVendorInsuranceSettings(
      { additional_insured_required: true, license_required_for: ['roofing'] },
      signVendorInsuranceSettings(
        ASSOC,
        {
          coiRemindersEnabled: true,
          minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: 2_000_000, workersCompRequired: true, autoLiabilityMin: 500_000 },
        },
        { updatedAt: '2026-10-18T00:00:00Z', updatedBy: null },
        SECRET,
      ),
    )
    expect(requirementsFor(ASSOC, cs, SECRET)).toEqual({
      glPerOccurrenceMin: 1_000_000,
      glAggregateMin: 2_000_000,
      workersCompRequired: true,
      autoLiabilityMin: 500_000,
      additionalInsuredRequired: true,
      umbrellaMin: null,
      licenseRequiredFor: ['roofing'],
    })
  })

  it('defaults to today’s behaviour: the legacy keys if present, else no minimums', () => {
    expect(requirementsFor(ASSOC, null, SECRET)).toEqual({
      glPerOccurrenceMin: null,
      glAggregateMin: null,
      workersCompRequired: false,
      autoLiabilityMin: null,
      additionalInsuredRequired: false,
      umbrellaMin: null,
      licenseRequiredFor: [],
    })
    expect(requirementsFor(ASSOC, { gl_per_occurrence_min: 750_000 }, SECRET).glPerOccurrenceMin).toBe(750_000)
  })

  it('ignores a vendor_insurance value it cannot verify', () => {
    const forged = { vendor_insurance: { coi_reminders_enabled: true, gl_per_occurrence_min: 1, sig: 'x' } }
    expect(requirementsFor(ASSOC, forged, SECRET).glPerOccurrenceMin).toBeNull()
  })
})

describe('W21 applyMinimums', () => {
  const min = { glPerOccurrenceMin: 1_000_000, glAggregateMin: null, workersCompRequired: true, autoLiabilityMin: null }
  const coi = { generalLiabilityPerOccurrence: 500_000, generalLiabilityAggregate: null, workersComp: true, autoLiability: null }

  it('turns a green grade red when the certificate is under a minimum, whatever the model said', () => {
    const r = applyMinimums({ complianceStatus: 'green', deficiencies: [] }, min, coi)
    expect(r.complianceStatus).toBe('red')
    expect(r.deficiencies.map((d) => d.code)).toEqual(['gl_below_minimum'])
  })

  it('does not duplicate a deficiency the model already raised, and keeps its other findings', () => {
    const r = applyMinimums(
      {
        complianceStatus: 'red',
        deficiencies: [
          { code: 'gl_below_minimum', severity: 'red', detail: 'model wording' },
          { code: 'additional_insured_missing', severity: 'yellow', detail: 'x' },
        ],
      },
      min,
      coi,
    )
    expect(r.deficiencies.map((d) => d.code)).toEqual(['gl_below_minimum', 'additional_insured_missing'])
    expect(r.deficiencies[0].detail).toMatch(/\$500,000/)
  })

  it('leaves "missing" and a passing certificate alone', () => {
    expect(applyMinimums({ complianceStatus: 'missing', deficiencies: [] }, min, coi).complianceStatus).toBe('missing')
    const ok = applyMinimums({ complianceStatus: 'green', deficiencies: [] }, min, { ...coi, generalLiabilityPerOccurrence: 1_000_000 })
    expect(ok).toEqual({ complianceStatus: 'green', deficiencies: [] })
  })
})
