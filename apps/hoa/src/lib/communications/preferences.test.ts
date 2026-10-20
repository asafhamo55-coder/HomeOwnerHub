import { describe, expect, it } from 'vitest'
import { applyPreferences, foldPreferenceRows, preferencesApply, prefsFor } from './preferences'
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

  it('no row means email on, texts off (the 0018 defaults)', () => {
    expect(prefsFor('stranger', map)).toEqual({ email: true, sms: false })
    expect(prefsFor(null, map)).toEqual({ email: true, sms: false })
  })

  it('folds several rows for one user conservatively', () => {
    expect(prefsFor('split', map)).toEqual({ email: false, sms: false })
  })

  it('email goes unless opted out; a text only when opted in', () => {
    const policy = { map, officialNoticeEmail: false }
    expect(applyPreferences('opted-in', ['email', 'sms', 'portal'], policy)).toEqual({
      keep: ['email', 'sms', 'portal'],
      optedOut: [],
    })
    expect(applyPreferences('no-email', ['email', 'sms', 'portal'], policy)).toEqual({
      keep: ['portal'],
      optedOut: ['email', 'sms'],
    })
    expect(applyPreferences(null, ['email', 'sms'], policy)).toEqual({ keep: ['email'], optedOut: ['sms'] })
  })

  it('an official notice ignores email_opt_in but still needs a text opt-in', () => {
    expect(applyPreferences('no-email', ['email', 'sms'], { map, officialNoticeEmail: true })).toEqual({
      keep: ['email'],
      optedOut: ['sms'],
    })
  })

  it('a null map (non-resident audience) changes nothing', () => {
    expect(applyPreferences(null, ['email', 'sms'], { map: null, officialNoticeEmail: false })).toEqual({
      keep: ['email', 'sms'],
      optedOut: [],
    })
  })

  it('board and custom contacts are exempt; portal-only sends need no read', () => {
    expect(preferencesApply('board', ['email', 'sms'])).toBe(false)
    expect(preferencesApply('manual_emails', ['sms'])).toBe(false)
    expect(preferencesApply('everyone', ['portal'])).toBe(false)
    expect(preferencesApply('everyone', ['sms'])).toBe(true)
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
