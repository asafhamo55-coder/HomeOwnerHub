import { describe, expect, it } from 'vitest'
import { memoCodeFor, parseMemoCode } from '@homeowner-portal/workflows'
import {
  ZELLE_SETTINGS_KEY,
  payLinesFor,
  readZelleSettings,
  signZelleSettings,
  usableMemoCode,
  validateZelleInput,
  withZelleSettings,
} from './pay-by-zelle'

const ASSOC = '11111111-1111-4111-8111-111111111111'
const OTHER_ASSOC = '22222222-2222-4222-8222-222222222222'
const SECRET = 'test-secret-not-a-real-key'

describe('validateZelleInput', () => {
  it('accepts an email recipient and trims everything', () => {
    const r = validateZelleInput({
      recipient: '  pay@demo-court.example ',
      recipientName: ' Demo Court HOA ',
      instructions: '  ',
    })
    expect(r).toEqual({
      ok: true,
      value: { recipient: 'pay@demo-court.example', recipientName: 'Demo Court HOA', instructions: null },
    })
  })

  it('accepts a US mobile number in common formats', () => {
    for (const phone of ['(555) 010-0100', '555-010-0100', '+1 555 010 0100', '5550100100']) {
      expect(validateZelleInput({ recipient: phone }).ok, phone).toBe(true)
    }
  })

  it('rejects an empty recipient, a malformed one, and overlong text with per-field errors', () => {
    expect(validateZelleInput({ recipient: '' })).toMatchObject({ ok: false, fieldErrors: { recipient: expect.any(String) } })
    expect(validateZelleInput({ recipient: 'not an address' })).toMatchObject({
      ok: false,
      fieldErrors: { recipient: expect.any(String) },
    })
    expect(validateZelleInput({ recipient: '555-0100' })).toMatchObject({ ok: false })
    expect(
      validateZelleInput({ recipient: 'pay@x.example', recipientName: 'x'.repeat(81), instructions: 'y'.repeat(501) }),
    ).toMatchObject({ ok: false, fieldErrors: { recipientName: expect.any(String), instructions: expect.any(String) } })
  })
})

describe('signed Zelle settings', () => {
  const settings = { recipient: 'pay@demo-court.example', recipientName: 'Demo Court HOA', instructions: null }

  it('round-trips through compliance_settings and keeps the other keys', () => {
    const stored = signZelleSettings(ASSOC, settings, SECRET, '2026-10-15T12:00:00.000Z')
    const compliance = withZelleSettings({ gl_aggregate_min: 2000000 }, stored)
    expect(compliance.gl_aggregate_min).toBe(2000000)
    expect(compliance[ZELLE_SETTINGS_KEY]).toBeDefined()

    const read = readZelleSettings(ASSOC, compliance, SECRET)
    expect(read).toEqual({
      state: 'configured',
      settings: { ...settings, updatedAt: '2026-10-15T12:00:00.000Z' },
    })
  })

  it('is not configured when the key is absent or the column is not an object', () => {
    expect(readZelleSettings(ASSOC, { gl_aggregate_min: 1 }, SECRET)).toEqual({ state: 'not_configured' })
    expect(readZelleSettings(ASSOC, null, SECRET)).toEqual({ state: 'not_configured' })
    expect(readZelleSettings(ASSOC, [], SECRET)).toEqual({ state: 'not_configured' })
  })

  it('removes the settings when cleared', () => {
    const stored = signZelleSettings(ASSOC, settings, SECRET, '2026-10-15T12:00:00.000Z')
    const cleared = withZelleSettings(withZelleSettings({ a: 1 }, stored), null)
    expect(cleared).toEqual({ a: 1 })
  })

  // associations still has 0004's FOR ALL org_access policy, so any org
  // member can write compliance_settings through the REST API. A recipient
  // that was not written by the board's server action must never be shown.
  it('refuses a recipient edited outside the signed save', () => {
    const stored = signZelleSettings(ASSOC, settings, SECRET, '2026-10-15T12:00:00.000Z')
    const forged = { ...stored, recipient: 'attacker@evil.example' }
    expect(readZelleSettings(ASSOC, withZelleSettings({}, forged), SECRET)).toEqual({ state: 'unverified' })
  })

  it('refuses a signed value copied from another association', () => {
    const stored = signZelleSettings(OTHER_ASSOC, settings, SECRET, '2026-10-15T12:00:00.000Z')
    expect(readZelleSettings(ASSOC, withZelleSettings({}, stored), SECRET)).toEqual({ state: 'unverified' })
  })

  it('fails closed with no secret or a missing signature', () => {
    const stored = signZelleSettings(ASSOC, settings, SECRET, '2026-10-15T12:00:00.000Z')
    expect(readZelleSettings(ASSOC, withZelleSettings({}, stored), null)).toEqual({ state: 'unverified' })
    const { sig: _sig, ...unsigned } = stored
    expect(readZelleSettings(ASSOC, { [ZELLE_SETTINGS_KEY]: unsigned }, SECRET)).toEqual({ state: 'unverified' })
  })
})

describe('memo codes on the Pay screen', () => {
  // Backlog BL-006 acceptance: the code the resident is told to type must be
  // the one W18's parser reads back, or the payment arrives unmatched.
  it('round-trips every code memoCodeFor generates through W18 parseMemoCode', () => {
    const cases = [
      { associationSlug: 'DEMO', unitNumber: '1247', unitId: 'a1b2c3d4-0000-4000-8000-00000000abcd', assessmentType: 'regular' },
      { associationSlug: 'MadisonPark', unitNumber: null, unitId: 'a1b2c3d4-0000-4000-8000-0000000fffff', assessmentType: 'late_fee' },
      { associationSlug: 'mp', unitNumber: 'Unit 12', unitId: 'a1b2c3d4-0000-4000-8000-000000001234', assessmentType: 'fine' },
      { associationSlug: 'TESTASSOC9F', unitNumber: '00042', unitId: 'a1b2c3d4-0000-4000-8000-000000000042', assessmentType: 'special' },
    ]
    for (const c of cases) {
      const generated = memoCodeFor(c)
      expect(generated, JSON.stringify(c)).not.toBeNull()
      const shown = usableMemoCode(generated)
      expect(shown).toBe(generated)
      // A bank memo usually carries noise around the code.
      expect(parseMemoCode(`ZELLE FROM J SMITH MEMO: ${shown}`)?.canonical).toBe(shown)
    }
  })

  it('withholds a stored code W18 could not match by equality', () => {
    expect(usableMemoCode(null)).toBeNull()
    expect(usableMemoCode('')).toBeNull()
    expect(usableMemoCode('dues for unit 12')).toBeNull()
    // Parses, but W18 looks the assessment up by memo_code = canonical, so a
    // lower-case or padded stored value would never be found.
    expect(usableMemoCode('demo-1247-dues')).toBeNull()
    expect(usableMemoCode(' DEMO-1247-DUES')).toBeNull()
  })
})

describe('payLinesFor', () => {
  it('builds one line per charge with its own amount and memo code, oldest due first', () => {
    const lines = payLinesFor([
      { id: 'b', assessmentType: 'late_fee', dueDate: '2026-10-20', amount: 25, fullAmount: 25, memoCode: 'DEMO-1247-FEE' },
      { id: 'a', assessmentType: 'regular', dueDate: '2026-10-01', amount: 325, fullAmount: 325, memoCode: 'DEMO-1247-DUES' },
    ])
    expect(lines.map((l) => l.assessmentId)).toEqual(['a', 'b'])
    expect(lines[0]).toEqual({
      assessmentId: 'a',
      label: 'Regular dues',
      dueDate: '2026-10-01',
      amount: 325,
      memoCode: 'DEMO-1247-DUES',
      autoMatch: true,
    })
  })

  it('marks lines W18 cannot auto-match: no usable memo code, or a partly paid charge', () => {
    const [noMemo, partial] = payLinesFor([
      { id: 'a', assessmentType: 'regular', dueDate: '2026-09-01', amount: 325, fullAmount: 325, memoCode: null },
      // W18 compares the deposit to the assessment's FULL amount (±$0.50).
      { id: 'b', assessmentType: 'regular', dueDate: '2026-10-01', amount: 125, fullAmount: 325, memoCode: 'DEMO-1247-DUES' },
    ])
    expect(noMemo).toMatchObject({ memoCode: null, autoMatch: false })
    expect(partial).toMatchObject({ memoCode: 'DEMO-1247-DUES', autoMatch: false, amount: 125 })
  })
})
