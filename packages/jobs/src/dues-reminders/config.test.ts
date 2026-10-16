import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFSETS,
  DUES_REMINDERS_KEY,
  effectiveDuesReminderSettings,
  readDuesReminderSettings,
  signDuesReminderSettings,
  validateDuesReminderInput,
  withDuesReminderSettings,
} from './config'

/**
 * Per-org config lives in associations.compliance_settings.dues_reminders
 * (no migration). Signed like pay_by_zelle: until 0063 is applied, any org
 * member can PATCH compliance_settings, and an unsigned "enabled + note"
 * would let a resident mail every neighbour in the association's name.
 */

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 'test-secret'
const APPROVAL = { approvedAt: '2026-10-16T12:00:00.000Z', approvedBy: 'u-board' }

describe('defaults', () => {
  it('is OFF by default with offsets −3, +5, +15', () => {
    expect(DEFAULT_OFFSETS).toEqual([-3, 5, 15])
    const s = effectiveDuesReminderSettings({ state: 'not_configured' })
    expect(s).toEqual({ enabled: false, offsets: [-3, 5, 15], note: null })
  })

  it('treats an unverified (tampered) config as OFF', () => {
    expect(effectiveDuesReminderSettings({ state: 'unverified' }).enabled).toBe(false)
  })
})

describe('validateDuesReminderInput', () => {
  it('accepts, de-duplicates and sorts offsets; trims the note', () => {
    const r = validateDuesReminderInput({ enabled: true, offsets: [15, -3, 5, 5], note: '  Thanks!  ' })
    expect(r).toEqual({ ok: true, value: { enabled: true, offsets: [-3, 5, 15], note: 'Thanks!' } })
  })

  it('stores an empty note as null', () => {
    const r = validateDuesReminderInput({ enabled: false, offsets: [5], note: '   ' })
    expect(r.ok && r.value.note).toBeNull()
  })

  it('rejects no offsets, too many, non-integers and out-of-range values', () => {
    for (const offsets of [[], [1, 2, 3, 4, 5, 6], [1.5], [-31], [91], ['x']]) {
      const r = validateDuesReminderInput({ enabled: true, offsets: offsets as unknown[], note: '' })
      expect(r.ok, JSON.stringify(offsets)).toBe(false)
      if (!r.ok) expect(r.fieldErrors.offsets).toBeTruthy()
    }
  })

  it('rejects a note over 500 characters', () => {
    const r = validateDuesReminderInput({ enabled: true, offsets: [5], note: 'x'.repeat(501) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.note).toBeTruthy()
  })
})

describe('sign / read round trip', () => {
  const value = { enabled: true, offsets: [-3, 5, 15], note: 'Pay at the portal.' }

  it('reads back what the board saved', () => {
    const stored = signDuesReminderSettings(ASSOC, value, APPROVAL, SECRET)
    const cs = withDuesReminderSettings({ outbound_mode: 'sandbox' }, stored)
    const read = readDuesReminderSettings(ASSOC, cs, SECRET)
    expect(read).toEqual({
      state: 'configured',
      settings: { ...value, approvedAt: APPROVAL.approvedAt, approvedBy: APPROVAL.approvedBy },
    })
  })

  it('keeps the other compliance_settings keys (outbound_mode, pay_by_zelle)', () => {
    const stored = signDuesReminderSettings(ASSOC, value, APPROVAL, SECRET)
    const cs = withDuesReminderSettings({ outbound_mode: 'sandbox', pay_by_zelle: { a: 1 } }, stored)
    expect(cs.outbound_mode).toBe('sandbox')
    expect(cs.pay_by_zelle).toEqual({ a: 1 })
    expect(withDuesReminderSettings(cs, null)).toEqual({ outbound_mode: 'sandbox', pay_by_zelle: { a: 1 } })
  })

  it('is not_configured when the key is absent', () => {
    expect(readDuesReminderSettings(ASSOC, {}, SECRET)).toEqual({ state: 'not_configured' })
    expect(readDuesReminderSettings(ASSOC, null, SECRET)).toEqual({ state: 'not_configured' })
  })

  it('is unverified when someone flips enabled or edits the note outside the board save', () => {
    const stored = signDuesReminderSettings(ASSOC, { ...value, enabled: false }, APPROVAL, SECRET)
    const flipped = { [DUES_REMINDERS_KEY]: { ...stored, enabled: true } }
    expect(readDuesReminderSettings(ASSOC, flipped, SECRET).state).toBe('unverified')
    const edited = { [DUES_REMINDERS_KEY]: { ...stored, note: 'Pay to my Venmo' } }
    expect(readDuesReminderSettings(ASSOC, edited, SECRET).state).toBe('unverified')
  })

  it('does not verify when copied to another association', () => {
    const stored = signDuesReminderSettings(ASSOC, value, APPROVAL, SECRET)
    const cs = withDuesReminderSettings({}, stored)
    expect(readDuesReminderSettings('a0000000-0000-4000-8000-000000000002', cs, SECRET).state).toBe(
      'unverified',
    )
  })

  it('fails closed with no secret', () => {
    const stored = signDuesReminderSettings(ASSOC, value, APPROVAL, SECRET)
    expect(readDuesReminderSettings(ASSOC, withDuesReminderSettings({}, stored), null).state).toBe(
      'unverified',
    )
  })

  it('is unverified for a structurally invalid stored value', () => {
    const cs = { [DUES_REMINDERS_KEY]: { enabled: 'yes', offsets: 'all', sig: 'x' } }
    expect(readDuesReminderSettings(ASSOC, cs, SECRET).state).toBe('unverified')
  })
})
