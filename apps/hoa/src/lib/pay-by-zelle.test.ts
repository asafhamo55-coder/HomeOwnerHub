import { describe, expect, it, vi } from 'vitest'
import { memoCodeFor, parseMemoCode } from '@homeowner-portal/workflows'
import {
  ZELLE_SETTINGS_KEY,
  payLinesFor,
  readZelleSettings,
  checksOf,
  signZelleSettings,
  validatePaymentSettingsInput,
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

  // BL-163: § 43-17A-8 order for Georgia from 2027-01-01; nothing changes before or elsewhere.
  describe('statutory order (BL-163)', () => {
    const charges = [
      { id: 'fine', assessmentType: 'fine', dueDate: '2026-12-01', amount: 50, fullAmount: 50, memoCode: null },
      { id: 'dues', assessmentType: 'regular', dueDate: '2027-01-01', amount: 325, fullAmount: 325, memoCode: null },
      { id: 'spec', assessmentType: 'special', dueDate: '2026-12-15', amount: 100, fullAmount: 100, memoCode: null },
    ]
    const ids = (order?: Parameters<typeof payLinesFor>[1]) => payLinesFor(charges, order).map((l) => l.assessmentId)

    it('Georgia on 2027-01-01 lists dues, then special, then the fine', () => {
      expect(ids({ state: 'GA', today: '2027-01-01' })).toEqual(['dues', 'spec', 'fine'])
    })
    it('the day before, outside Georgia, or with no order, keeps oldest due first', () => {
      expect(ids({ state: 'GA', today: '2026-12-31' })).toEqual(['fine', 'spec', 'dues'])
      expect(ids({ state: 'FL', today: '2027-06-01' })).toEqual(['fine', 'spec', 'dues'])
      expect(ids({ state: null, today: '2027-06-01' })).toEqual(['fine', 'spec', 'dues'])
      expect(ids()).toEqual(['fine', 'spec', 'dues'])
    })
    it('keeps every line with its own amount', () => {
      const lines = payLinesFor(charges, { state: 'GA', today: '2027-01-01' })
      expect(lines.map((l) => [l.assessmentId, l.amount])).toEqual([['dues', 325], ['spec', 100], ['fine', 50]])
    })
  })
})

describe('SEC-N7: secret fallback and rotation', () => {
  it('prefers PAY_SETTINGS_SECRET; falls back outside production; returns null (never throws) in production without it', async () => {
    const mod = await import('./pay-by-zelle')
    const { resetSigningSecretLogForTests } = await import('./signing-secret')
    resetSigningSecretLogForTests()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mod.paySettingsSecret({ PAY_SETTINGS_SECRET: 'dedicated', SUPABASE_SERVICE_ROLE_KEY: 'srk', VERCEL_ENV: 'production' })).toBe('dedicated')
    expect(err).not.toHaveBeenCalled()
    expect(mod.paySettingsSecret({ SUPABASE_SERVICE_ROLE_KEY: 'srk-value', VERCEL_ENV: 'preview' })).toBe('srk-value')
    expect(mod.paySettingsSecret({ SUPABASE_SERVICE_ROLE_KEY: 'srk-value', VERCEL_ENV: 'production' })).toBeNull()
    expect(mod.paySettingsSecret({ SUPABASE_SERVICE_ROLE_KEY: 'srk-value', VERCEL_ENV: 'production' })).toBeNull()
    expect(err).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(err.mock.calls)).not.toContain('srk-value')
    err.mockRestore()
  })

  it('a Zelle setup signed with the previous secret still verifies during a rotation; an unknown key does not', async () => {
    const { readZelleSettings, signZelleSettings, ZELLE_SETTINGS_KEY } = await import('./pay-by-zelle')
    const stored = signZelleSettings('assoc-1', { recipient: 'pay@hoa.test', recipientName: null, instructions: null }, 'old-secret')
    const cs = { [ZELLE_SETTINGS_KEY]: stored }
    expect(readZelleSettings('assoc-1', cs, 'new-secret', null).state).toBe('unverified')
    expect(readZelleSettings('assoc-1', cs, 'new-secret', 'old-secret').state).toBe('configured')
    expect(readZelleSettings('assoc-1', cs, 'new-secret', 'other').state).toBe('unverified')
  })
})

describe('How residents pay: Zelle, checks, both or neither (round 29)', () => {
  const AT = '2026-11-06T12:00:00.000Z'
  const checkInput = { checkPayableTo: 'Maple Court HOA', checkMailTo: 'PO Box 12\nMacon, GA 31201', checkDropOff: ' ' }
  const sign = (input: Parameters<typeof validatePaymentSettingsInput>[0]) => {
    const r = validatePaymentSettingsInput(input)
    if (!r.ok) throw new Error('invalid')
    return withZelleSettings({}, signZelleSettings(ASSOC, r.value, SECRET, AT))
  }

  it('saves checks only: no Zelle recipient needed', () => {
    const r = validatePaymentSettingsInput(checkInput)
    expect(r).toEqual({
      ok: true,
      value: {
        recipient: null,
        recipientName: null,
        instructions: null,
        checks: { payableTo: 'Maple Court HOA', mailTo: 'PO Box 12\nMacon, GA 31201', dropOff: null },
      },
    })
    const read = readZelleSettings(ASSOC, sign(checkInput), SECRET, null)
    expect(read.state).toBe('checks_only')
    expect(checksOf(read)).toEqual({ payableTo: 'Maple Court HOA', mailTo: 'PO Box 12\nMacon, GA 31201', dropOff: null })
  })

  it('saves Zelle only, with no check fields', () => {
    const read = readZelleSettings(ASSOC, sign({ recipient: 'pay@demo-court.example' }), SECRET, null)
    expect(read.state).toBe('configured')
    expect(checksOf(read)).toBeNull()
  })

  it('saves both', () => {
    const read = readZelleSettings(
      ASSOC,
      sign({ recipient: 'pay@demo-court.example', checkPayableTo: 'Maple Court HOA', checkMailTo: 'PO Box 12', checkDropOff: 'Clubhouse office' }),
      SECRET,
      null,
    )
    expect(read.state).toBe('configured')
    expect(checksOf(read)).toEqual({ payableTo: 'Maple Court HOA', mailTo: 'PO Box 12', dropOff: 'Clubhouse office' })
  })

  it('refuses neither, and half-filled check details, in plain words', () => {
    expect(validatePaymentSettingsInput({ instructions: 'Call us' })).toMatchObject({
      ok: false,
      fieldErrors: { recipient: expect.stringContaining('so residents know how to pay') },
    })
    expect(validatePaymentSettingsInput({ checkPayableTo: 'Maple Court HOA' })).toMatchObject({
      ok: false,
      fieldErrors: { checkMailTo: 'Enter the address residents should mail checks to.' },
    })
    expect(validatePaymentSettingsInput({ checkMailTo: 'PO Box 12' })).toMatchObject({
      ok: false,
      fieldErrors: { checkPayableTo: 'Enter who checks should be made out to.' },
    })
    expect(validatePaymentSettingsInput({ recipient: 'nope' })).toMatchObject({ ok: false })
  })

  it('rejects tampering with check fields, in both directions', () => {
    const checksOnly = sign(checkInput)
    const tamperedPayee = withZelleSettings(checksOnly, {
      ...(checksOnly[ZELLE_SETTINGS_KEY] as object),
      check_payable_to: 'Someone Else',
    } as never)
    expect(readZelleSettings(ASSOC, tamperedPayee, SECRET, null).state).toBe('unverified')

    const zelleOnly = sign({ recipient: 'pay@demo-court.example' })
    const injected = withZelleSettings(zelleOnly, {
      ...(zelleOnly[ZELLE_SETTINGS_KEY] as object),
      check_payable_to: 'Mallory',
      check_mail_to: 'PO Box 666',
    } as never)
    expect(readZelleSettings(ASSOC, injected, SECRET, null).state).toBe('unverified')

    const both = sign({ recipient: 'pay@demo-court.example', ...checkInput })
    const stripped = { ...(both[ZELLE_SETTINGS_KEY] as Record<string, unknown>) }
    delete stripped.check_payable_to
    delete stripped.check_mail_to
    expect(readZelleSettings(ASSOC, { [ZELLE_SETTINGS_KEY]: stripped }, SECRET, null).state).toBe('unverified')

    const swappedRecipient = withZelleSettings(checksOnly, {
      ...(checksOnly[ZELLE_SETTINGS_KEY] as object),
      recipient: 'mallory@example.com',
    } as never)
    expect(readZelleSettings(ASSOC, swappedRecipient, SECRET, null).state).toBe('unverified')
  })

  it('refuses a signed value copied from another association', () => {
    expect(readZelleSettings(OTHER_ASSOC, sign(checkInput), SECRET, null).state).toBe('unverified')
  })

  it('fails closed with no secret, for checks and Zelle alike', () => {
    expect(readZelleSettings(ASSOC, sign(checkInput), null, null).state).toBe('unverified')
    expect(readZelleSettings(ASSOC, sign({ recipient: 'pay@demo-court.example' }), null, null).state).toBe('unverified')
  })

  it('still verifies a Zelle setup saved before checks existed', () => {
    const legacy = signZelleSettings(
      ASSOC,
      { recipient: 'pay@demo-court.example', recipientName: 'Demo Court HOA', instructions: null },
      SECRET,
      AT,
    )
    expect(Object.keys(legacy)).not.toContain('check_payable_to')
    expect(readZelleSettings(ASSOC, { [ZELLE_SETTINGS_KEY]: legacy }, SECRET, null).state).toBe('configured')
  })
})
