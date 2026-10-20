import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  COVERAGE_MAX,
  DEFAULT_VENDOR_INSURANCE_SETTINGS,
  VENDOR_INSURANCE_KEY,
  effectiveVendorInsuranceSettings,
  insuranceRequirementLines,
  minimumsDeficiencies,
  readVendorInsuranceSettings,
  rfpInsuranceRequirements,
  signVendorInsuranceSettings,
  validateVendorInsuranceInput,
  vendorInsuranceSettingsSecret,
  withVendorInsuranceSettings,
  type VendorInsuranceSettings,
} from './settings'

const ASSOC = 'assoc-1'
const SECRET = 'test-secret'
const STAMP = { updatedAt: '2026-10-18T12:00:00.000Z', updatedBy: 'user-1' }

const SAVED: VendorInsuranceSettings = {
  coiRemindersEnabled: false,
  minimums: {
    glPerOccurrenceMin: 1_000_000,
    glAggregateMin: 2_000_000,
    workersCompRequired: true,
    autoLiabilityMin: 500_000,
    umbrellaMin: null,
  },
}

function stored(settings = SAVED, assoc = ASSOC) {
  return withVendorInsuranceSettings({ outbound_mode: 'live' }, signVendorInsuranceSettings(assoc, settings, STAMP, SECRET))
}

describe('validateVendorInsuranceInput (BL-084)', () => {
  it('accepts whole-dollar minimums and blanks', () => {
    const r = validateVendorInsuranceInput({
      coiRemindersEnabled: true,
      glPerOccurrenceMin: '1,000,000',
      glAggregateMin: '',
      workersCompRequired: true,
      autoLiabilityMin: null,
    })
    expect(r).toEqual({
      ok: true,
      value: {
        coiRemindersEnabled: true,
        minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: null, workersCompRequired: true, autoLiabilityMin: null, umbrellaMin: null },
      },
    })
  })

  it('rejects zero, negatives, cents, text and amounts past the cap, per field', () => {
    const r = validateVendorInsuranceInput({
      coiRemindersEnabled: true,
      glPerOccurrenceMin: '0',
      glAggregateMin: '-5',
      workersCompRequired: false,
      autoLiabilityMin: String(COVERAGE_MAX + 1),
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['autoLiabilityMin', 'glAggregateMin', 'glPerOccurrenceMin'])
    const cents = validateVendorInsuranceInput({ coiRemindersEnabled: true, glPerOccurrenceMin: '1000.50', workersCompRequired: false })
    expect(cents.ok).toBe(false)
    const text = validateVendorInsuranceInput({ coiRemindersEnabled: true, autoLiabilityMin: 'a million', workersCompRequired: false })
    expect(text.ok).toBe(false)
  })

  it('refuses an aggregate below the per-occurrence minimum', () => {
    const r = validateVendorInsuranceInput({
      coiRemindersEnabled: true,
      glPerOccurrenceMin: 2_000_000,
      glAggregateMin: 1_000_000,
      workersCompRequired: false,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.glAggregateMin).toMatch(/at least/)
  })
})

describe('reading the setting (signed, like pay_by_zelle and dues_reminders)', () => {
  it('nothing saved: reminders on, today’s minimums (none)', () => {
    const read = readVendorInsuranceSettings(ASSOC, { outbound_mode: 'live' }, SECRET)
    expect(read).toEqual({ state: 'not_configured' })
    expect(effectiveVendorInsuranceSettings(read, { outbound_mode: 'live' })).toEqual(DEFAULT_VENDOR_INSURANCE_SETTINGS)
    expect(DEFAULT_VENDOR_INSURANCE_SETTINGS.coiRemindersEnabled).toBe(true)
  })

  it('a board save round-trips and keeps the other keys', () => {
    const cs = stored()
    expect(cs.outbound_mode).toBe('live')
    const read = readVendorInsuranceSettings(ASSOC, cs, SECRET)
    expect(read).toEqual({ state: 'configured', settings: SAVED, ...STAMP })
    expect(effectiveVendorInsuranceSettings(read, cs)).toEqual(SAVED)
  })

  it('a value edited outside the screen is unverified and falls back to defaults (reminders stay on)', () => {
    const cs = stored()
    const forged = { ...cs, [VENDOR_INSURANCE_KEY]: { ...(cs[VENDOR_INSURANCE_KEY] as object), gl_per_occurrence_min: 1 } }
    const read = readVendorInsuranceSettings(ASSOC, forged, SECRET)
    expect(read).toEqual({ state: 'unverified' })
    expect(effectiveVendorInsuranceSettings(read, forged)).toEqual(DEFAULT_VENDOR_INSURANCE_SETTINGS)
  })

  it('a value signed for another association, or with no secret, is unverified', () => {
    expect(readVendorInsuranceSettings(ASSOC, stored(SAVED, 'assoc-2'), SECRET).state).toBe('unverified')
    expect(readVendorInsuranceSettings(ASSOC, stored(), null).state).toBe('unverified')
    expect(readVendorInsuranceSettings(ASSOC, stored(), 'other-secret').state).toBe('unverified')
  })

  it('keeps honouring the legacy top-level minimums W21 read before this screen existed', () => {
    const legacy = { gl_per_occurrence_min: 1_000_000, workers_comp_required: true }
    const eff = effectiveVendorInsuranceSettings(readVendorInsuranceSettings(ASSOC, legacy, SECRET), legacy)
    expect(eff.minimums).toEqual({
      glPerOccurrenceMin: 1_000_000,
      glAggregateMin: null,
      workersCompRequired: true,
      autoLiabilityMin: null,
      umbrellaMin: null,
    })
    // A board save replaces them, and the save strips them from the blob.
    const cs = withVendorInsuranceSettings(legacy, signVendorInsuranceSettings(ASSOC, SAVED, STAMP, SECRET))
    expect(cs.gl_per_occurrence_min).toBeUndefined()
    expect(cs.workers_comp_required).toBeUndefined()
  })

  it('the secret falls back like the other signed settings', () => {
    const before = { ...process.env }
    try {
      delete process.env.PAY_SETTINGS_SECRET
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      delete process.env.SUPABASE_SECRET_KEY
      expect(vendorInsuranceSettingsSecret()).toBeNull()
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk'
      expect(vendorInsuranceSettingsSecret()).toBe('srk')
      process.env.PAY_SETTINGS_SECRET = 'pss'
      expect(vendorInsuranceSettingsSecret()).toBe('pss')
    } finally {
      process.env = before
    }
  })
})

describe('what RFPs and the compliance check use', () => {
  it('RFP requirements carry only the minimums that are set — never the rest of compliance_settings', () => {
    const cs = { ...stored(), pay_by_zelle: { recipient: 'x', sig: 'y' } }
    const req = rfpInsuranceRequirements(effectiveVendorInsuranceSettings(readVendorInsuranceSettings(ASSOC, cs, SECRET), cs))
    expect(req).toEqual({
      gl_per_occurrence_min: 1_000_000,
      gl_aggregate_min: 2_000_000,
      workers_comp_required: true,
      auto_liability_min: 500_000,
    })
    expect(rfpInsuranceRequirements(DEFAULT_VENDOR_INSURANCE_SETTINGS)).toBeNull()
  })

  const coi = {
    generalLiabilityPerOccurrence: 500_000,
    generalLiabilityAggregate: 2_000_000,
    workersComp: false,
    autoLiability: 250_000,
  }

  it('flags every coverage under a minimum, with the numbers', () => {
    const d = minimumsDeficiencies(SAVED.minimums, coi)
    expect(d.map((x) => x.code)).toEqual(['gl_below_minimum', 'wc_missing', 'auto_below_minimum'])
    expect(d.every((x) => x.severity === 'red')).toBe(true)
    expect(d[0].detail).toBe('General liability per occurrence is $500,000 but the association requires $1,000,000.')
  })

  it('says nothing when no minimum is set, a value was not entered, or the coverage meets it', () => {
    expect(minimumsDeficiencies(DEFAULT_VENDOR_INSURANCE_SETTINGS.minimums, coi)).toEqual([])
    expect(
      minimumsDeficiencies(SAVED.minimums, {
        generalLiabilityPerOccurrence: null,
        generalLiabilityAggregate: 2_000_000,
        workersComp: true,
        autoLiability: 500_000,
      }),
    ).toEqual([])
    expect(minimumsDeficiencies(SAVED.minimums, null)).toEqual([])
  })
})

describe('umbrella minimum (BL-084, 2026-10-20)', () => {
  const WITH_UMBRELLA: VendorInsuranceSettings = { ...SAVED, minimums: { ...SAVED.minimums, umbrellaMin: 2_000_000 } }

  it('validates like the other amounts', () => {
    const ok = validateVendorInsuranceInput({ coiRemindersEnabled: true, workersCompRequired: false, umbrellaMin: '$5,000,000' })
    expect(ok.ok && ok.value.minimums.umbrellaMin).toBe(5_000_000)
    const bad = validateVendorInsuranceInput({ coiRemindersEnabled: true, workersCompRequired: false, umbrellaMin: '1.5m' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.fieldErrors)).toEqual(['umbrellaMin'])
  })

  it('round-trips through the signed save', () => {
    const cs = stored(WITH_UMBRELLA)
    expect((cs[VENDOR_INSURANCE_KEY] as Record<string, unknown>).umbrella_min).toBe(2_000_000)
    const read = readVendorInsuranceSettings(ASSOC, cs, SECRET)
    expect(read).toEqual({ state: 'configured', settings: WITH_UMBRELLA, ...STAMP })
  })

  it('a row signed before umbrella existed still verifies (no umbrella minimum)', () => {
    const cs = stored()
    const old = { ...(cs[VENDOR_INSURANCE_KEY] as Record<string, unknown>) }
    delete old.umbrella_min
    // Re-sign the old shape exactly as the pre-umbrella code did.
    old.sig = createHmac('sha256', SECRET)
      .update(
        JSON.stringify([
          'vendor-insurance:v1',
          ASSOC,
          old.coi_reminders_enabled,
          old.gl_per_occurrence_min,
          old.gl_aggregate_min,
          old.workers_comp_required,
          old.auto_liability_min,
          old.updated_at,
          old.updated_by,
        ]),
      )
      .digest('hex')
    const read = readVendorInsuranceSettings(ASSOC, { [VENDOR_INSURANCE_KEY]: old }, SECRET)
    expect(read.state).toBe('configured')
    if (read.state === 'configured') expect(read.settings.minimums.umbrellaMin).toBeNull()
  })

  it('adding, changing or stripping umbrella outside the screen breaks the signature', () => {
    const cs = stored(WITH_UMBRELLA)
    const v = cs[VENDOR_INSURANCE_KEY] as Record<string, unknown>
    const stripped = { ...v }
    delete stripped.umbrella_min
    expect(readVendorInsuranceSettings(ASSOC, { [VENDOR_INSURANCE_KEY]: stripped }, SECRET).state).toBe('unverified')
    expect(readVendorInsuranceSettings(ASSOC, { [VENDOR_INSURANCE_KEY]: { ...v, umbrella_min: 1 } }, SECRET).state).toBe('unverified')
    const plain = stored() // signed with umbrella_min: null
    const added = { ...(plain[VENDOR_INSURANCE_KEY] as Record<string, unknown>), umbrella_min: 10_000_000 }
    expect(readVendorInsuranceSettings(ASSOC, { [VENDOR_INSURANCE_KEY]: added }, SECRET).state).toBe('unverified')
  })

  it('honours the legacy unsigned umbrella_min W21 used to read, until a board save replaces it', () => {
    const legacy = { umbrella_min: 3_000_000 }
    const eff = effectiveVendorInsuranceSettings(readVendorInsuranceSettings(ASSOC, legacy, SECRET), legacy)
    expect(eff.minimums.umbrellaMin).toBe(3_000_000)
    const cs = withVendorInsuranceSettings(legacy, signVendorInsuranceSettings(ASSOC, SAVED, STAMP, SECRET))
    expect(cs.umbrella_min).toBeUndefined()
  })

  it('reaches RFP requirements, the plain-language lines and the compliance check', () => {
    expect(rfpInsuranceRequirements(WITH_UMBRELLA)).toMatchObject({ umbrella_min: 2_000_000 })
    expect(insuranceRequirementLines(WITH_UMBRELLA.minimums)).toContain('Umbrella / excess liability: $2,000,000')
    const d = minimumsDeficiencies(WITH_UMBRELLA.minimums, {
      generalLiabilityPerOccurrence: 1_000_000,
      generalLiabilityAggregate: 2_000_000,
      workersComp: true,
      autoLiability: 500_000,
      umbrella: 1_000_000,
    })
    expect(d).toEqual([
      {
        code: 'umbrella_below_minimum',
        severity: 'red',
        detail: 'Umbrella coverage is $1,000,000 but the association requires $2,000,000.',
      },
    ])
  })
})
