import { describe, expect, it } from 'vitest'
import {
  RESIDENT_NOTIFY_KEY,
  readResidentNotifySettings,
  residentNotificationsOn,
  signResidentNotifySettings,
  withResidentNotifySettings,
} from './settings'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SECRET = 'test-secret'
const STAMP = { updatedAt: '2026-10-18T14:00:00.000Z', updatedBy: 'u1' }

describe('resident notification setting', () => {
  it('is OFF when nothing is saved', () => {
    expect(readResidentNotifySettings(A, {}, SECRET)).toEqual({ state: 'not_configured' })
    expect(residentNotificationsOn(A, {}, SECRET)).toBe(false)
    expect(residentNotificationsOn(A, null, SECRET)).toBe(false)
  })

  it('a signed ON value turns it on, with when it was saved', () => {
    const cs = { [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(A, { decisionsAndReplies: true }, STAMP, SECRET) }
    expect(readResidentNotifySettings(A, cs, SECRET)).toEqual({
      state: 'configured',
      settings: { decisionsAndReplies: true },
      updatedAt: STAMP.updatedAt,
      updatedBy: 'u1',
    })
    expect(residentNotificationsOn(A, cs, SECRET)).toBe(true)
  })

  it('a signed OFF value stays off', () => {
    const cs = { [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(A, { decisionsAndReplies: false }, STAMP, SECRET) }
    expect(residentNotificationsOn(A, cs, SECRET)).toBe(false)
  })

  it('an unsigned or forged value is ignored, so nothing is sent', () => {
    const forged = {
      [RESIDENT_NOTIFY_KEY]: { decisions_and_replies: true, updated_at: STAMP.updatedAt, updated_by: null, sig: 'nope' },
    }
    expect(readResidentNotifySettings(A, forged, SECRET)).toEqual({ state: 'unverified' })
    expect(residentNotificationsOn(A, forged, SECRET)).toBe(false)
    expect(residentNotificationsOn(A, { [RESIDENT_NOTIFY_KEY]: true }, SECRET)).toBe(false)
  })

  it('a value signed for another association does not carry over', () => {
    const cs = { [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(B, { decisionsAndReplies: true }, STAMP, SECRET) }
    expect(residentNotificationsOn(A, cs, SECRET)).toBe(false)
  })

  it('a flipped flag breaks the signature', () => {
    const stored = signResidentNotifySettings(A, { decisionsAndReplies: false }, STAMP, SECRET)
    const cs = { [RESIDENT_NOTIFY_KEY]: { ...stored, decisions_and_replies: true } }
    expect(residentNotificationsOn(A, cs, SECRET)).toBe(false)
  })

  it('no secret on the server: never on', () => {
    const cs = { [RESIDENT_NOTIFY_KEY]: signResidentNotifySettings(A, { decisionsAndReplies: true }, STAMP, SECRET) }
    expect(residentNotificationsOn(A, cs, null)).toBe(false)
  })

  it('writing keeps every other compliance key', () => {
    const stored = signResidentNotifySettings(A, { decisionsAndReplies: true }, STAMP, SECRET)
    const next = withResidentNotifySettings({ outbound_mode: 'sandbox', pay_by_zelle: { x: 1 } }, stored)
    expect(next).toEqual({ outbound_mode: 'sandbox', pay_by_zelle: { x: 1 }, [RESIDENT_NOTIFY_KEY]: stored })
    expect(withResidentNotifySettings(null, stored)).toEqual({ [RESIDENT_NOTIFY_KEY]: stored })
  })
})
