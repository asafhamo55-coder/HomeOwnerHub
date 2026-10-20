import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@/lib/sms-consent'
import { applyPreferences, foldPreferenceRows, loadPreferenceMap, preferencesApply, prefsFor } from './preferences'
import { fakeSupabase } from '@/lib/test-utils/fake-supabase'
import { renderForSchedule, renderKnownFields } from './partial-render'

describe('resident preferences (BL-102)', () => {
  const map = foldPreferenceRows([
    { user_id: 'opted-in', email_opt_in: true, sms_opt_in: true },
    { user_id: 'no-email', email_opt_in: false, sms_opt_in: false },
    // Two rows for one user: conservative both ways.
    { user_id: 'split', email_opt_in: true, sms_opt_in: true },
    { user_id: 'split', email_opt_in: false, sms_opt_in: false },
    { user_id: null, email_opt_in: false, sms_opt_in: true },
  ])
  const PHONE = '+14045551234'
  const consentedMap = new Map(map)
  consentedMap.set('opted-in', { ...map.get('opted-in')!, smsPhones: new Set([sha256Hex(PHONE)]) })

  it('no row means email on, texts off (the 0018 defaults)', () => {
    expect(prefsFor('stranger', map)).toEqual({ email: true, sms: false })
    expect(prefsFor(null, map)).toEqual({ email: true, sms: false })
  })

  it('folds several rows for one user conservatively', () => {
    expect(prefsFor('split', map)).toEqual({ email: false, sms: false })
  })

  it('email goes unless opted out; a text only when opted in', () => {
    const policy = { map: consentedMap, officialNoticeEmail: false }
    expect(applyPreferences('opted-in', ['email', 'sms', 'portal'], policy, PHONE)).toEqual({
      keep: ['email', 'sms', 'portal'],
      optedOut: [],
      needsConsent: [],
    })
    expect(applyPreferences('no-email', ['email', 'sms', 'portal'], policy, PHONE)).toEqual({
      keep: ['portal'],
      optedOut: ['email', 'sms'],
      needsConsent: [],
    })
    expect(applyPreferences(null, ['email', 'sms'], policy, PHONE)).toEqual({
      keep: ['email'],
      optedOut: ['sms'],
      needsConsent: [],
    })
  })

  it('an official notice ignores email_opt_in but still needs a text opt-in', () => {
    expect(applyPreferences('no-email', ['email', 'sms'], { map, officialNoticeEmail: true }, PHONE)).toEqual({
      keep: ['email'],
      optedOut: ['sms'],
      needsConsent: [],
    })
  })

  it('a null map (non-resident audience) changes nothing', () => {
    expect(applyPreferences(null, ['email', 'sms'], { map: null, officialNoticeEmail: false })).toEqual({
      keep: ['email', 'sms'],
      optedOut: [],
      needsConsent: [],
    })
  })

  describe('BL-111: consent is tied to the number', () => {
    const policy = { map: consentedMap, officialNoticeEmail: false }

    it('the consented number in any format is texted', () => {
      for (const phone of [PHONE, '(404) 555-1234', '14045551234', '404.555.1234']) {
        expect(applyPreferences('opted-in', ['sms'], policy, phone).keep).toEqual(['sms'])
      }
    })

    it('a number changed since consent is skipped as needing new consent, like an opt-out', () => {
      expect(applyPreferences('opted-in', ['email', 'sms'], policy, '+14045559999')).toEqual({
        keep: ['email'],
        optedOut: ['sms'],
        needsConsent: ['sms'],
      })
    })

    it('a legacy opt-in with no consent record needs consent (conservative)', () => {
      // foldPreferenceRows alone attaches no consent set: sms_opt_in = true, no grant row.
      expect(applyPreferences('opted-in', ['sms'], { map, officialNoticeEmail: false }, PHONE)).toEqual({
        keep: [],
        optedOut: ['sms'],
        needsConsent: ['sms'],
      })
    })

    it('no phone, or one that is not a US number, never passes', () => {
      expect(applyPreferences('opted-in', ['sms'], policy, null).needsConsent).toEqual(['sms'])
      expect(applyPreferences('opted-in', ['sms'], policy, '+44 20 7946 0958').needsConsent).toEqual(['sms'])
    })
  })

  it('board and custom contacts are exempt; portal-only sends need no read', () => {
    expect(preferencesApply('board', ['email', 'sms'])).toBe(false)
    expect(preferencesApply('manual_emails', ['sms'])).toBe(false)
    expect(preferencesApply('everyone', ['portal'])).toBe(false)
    expect(preferencesApply('everyone', ['sms'])).toBe(true)
  })
})

describe('loadPreferenceMap + consent (BL-111)', () => {
  const hash = sha256Hex('+14045551234')
  const grant = (user: string, at: string, phones: string[]) => ({
    id: `g-${user}-${at}`,
    user_id: user,
    action: 'sms_consent_granted',
    metadata: { phone_sha256: phones },
    created_at: at,
  })
  const revoke = (user: string, at: string) => ({ id: `r-${user}-${at}`, user_id: user, action: 'sms_consent_revoked', metadata: {}, created_at: at })

  it('reads the org’s consent rows once and attaches each texting resident’s latest unrevoked numbers', async () => {
    const { client, queries } = fakeSupabase((q) => {
      if (q.table === 'resident_communication_preferences') {
        return {
          data: [
            { user_id: 'a', email_opt_in: true, sms_opt_in: true },
            { user_id: 'b', email_opt_in: true, sms_opt_in: true },
            { user_id: 'c', email_opt_in: true, sms_opt_in: true },
          ],
          error: null,
        }
      }
      return {
        data: [
          grant('a', '2026-10-01', [sha256Hex('+14045550000')]),
          grant('a', '2026-10-10', [hash]), // newer grant replaces the set
          grant('b', '2026-10-01', [hash]),
          revoke('b', '2026-10-05'), // revoked since
        ],
        error: null,
      }
    })
    const res = await loadPreferenceMap(client as never, 'org-1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect([...(res.map.get('a')!.smsPhones ?? [])]).toEqual([hash])
    expect(res.map.get('b')!.smsPhones?.size).toBe(0)
    expect(res.map.get('c')!.smsPhones?.size).toBe(0) // pre-BL-110: no record
    expect(queries.filter((q) => q.table === 'audit_log')).toHaveLength(1)
  })

  it('reads no consent rows when nobody has texts on', async () => {
    const { client, queries } = fakeSupabase((q) =>
      q.table === 'resident_communication_preferences'
        ? { data: [{ user_id: 'a', email_opt_in: false, sms_opt_in: false }], error: null }
        : undefined,
    )
    expect((await loadPreferenceMap(client as never, 'org-1')).ok).toBe(true)
    expect(queries.some((q) => q.table === 'audit_log')).toBe(false)
  })

  it('a failed consent read fails the whole read (the send refuses)', async () => {
    const { client } = fakeSupabase((q) =>
      q.table === 'resident_communication_preferences'
        ? { data: [{ user_id: 'a', email_opt_in: true, sms_opt_in: true }], error: null }
        : { data: null, error: { code: 'XX' } },
    )
    expect(await loadPreferenceMap(client as never, 'org-1')).toEqual({ ok: false })
  })
})

describe('schedule-time render (BL-102 A1)', () => {
  it('replaces only answered fields and leaves per-recipient ones intact', () => {
    expect(renderKnownFields('Hi {{ recipient_name }}, closes {{closing_date}} ({{ blank }})', { closing_date: 'Monday', blank: '' })).toBe(
      'Hi {{ recipient_name }}, closes Monday ({{ blank }})',
    )
  })

  it('accepts a message whose only remaining fields the delivery fills itself', () => {
    const r = renderForSchedule({
      subject: '{{ association_name }}: pool closes {{ d }}',
      bodyHtml: '<p>Hi {{recipient_name}} {{owner_name}} {{ unit_id }}</p>',
      bodyText: null,
      fields: { d: 'Monday' },
      associationName: 'Lakeside HOA',
    })
    expect(r).toEqual({
      ok: true,
      subject: '{{ association_name }}: pool closes Monday',
      bodyHtml: '<p>Hi {{recipient_name}} {{owner_name}} {{ unit_id }}</p>',
      bodyText: null,
    })
  })

  it('refuses when a question is still blank, naming every one', () => {
    expect(
      renderForSchedule({ subject: '{{ a }}', bodyHtml: '{{ b }} {{ c }}', fields: { c: 'x' }, associationName: 'X' }),
    ).toEqual({ ok: false, missing: ['a', 'b'] })
  })
})
