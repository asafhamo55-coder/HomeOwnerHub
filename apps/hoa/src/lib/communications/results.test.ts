import { describe, expect, it } from 'vitest'
import { followUpAudience, reminderSubject, resultsHeadline, rollupByHome, type ResultRow } from './results'
import { buildFollowUpDraft } from './follow-up'
import { composeBilingualHtml } from './bilingual'

// BL-102 A8: results per home, and the follow-up that only fills the composer.

const ROWS: ResultRow[] = [
  // u1: email opened, plus a portal row.
  { unit_id: 'u1', channel: 'email', delivery_status: 'opened' },
  { unit_id: 'u1', channel: 'portal', delivery_status: 'sent' },
  // u2: emailed and texted, email not opened. Texts never "open".
  { unit_id: 'u2', channel: 'email', delivery_status: 'delivered' },
  { unit_id: 'u2', channel: 'sms', delivery_status: 'sent' },
  // u3: only in the portal.
  { unit_id: 'u3', channel: 'portal', delivery_status: 'sent' },
  // u4: the email bounced.
  { unit_id: 'u4', channel: 'email', delivery_status: 'bounced' },
  // u5: only texted.
  { unit_id: 'u5', channel: 'sms', delivery_status: 'sent' },
]

describe('rollupByHome', () => {
  it('counts homes, not rows, and only email opens', () => {
    expect(rollupByHome(ROWS)).toEqual({
      homes: 5,
      reached: 3,
      portalOnly: 1,
      emailed: 2,
      opened: 1,
      notOpenedUnitIds: ['u2'],
      failed: 1,
    })
  })

  it('a texted-only home is never "not opened"', () => {
    expect(rollupByHome(ROWS).notOpenedUnitIds).not.toContain('u5')
  })

  it('rows without a home count but can never be followed up', () => {
    const r = rollupByHome([
      { unit_id: null, channel: 'email', delivery_status: 'sent', id: 'r1' },
      { unit_id: null, channel: 'email', delivery_status: 'sent', id: 'r2' },
    ])
    expect(r.homes).toBe(2)
    expect(r.emailed).toBe(2)
    expect(r.notOpenedUnitIds).toEqual([])
  })
})

describe('resultsHeadline', () => {
  it('answers "did people get it?" in one go', () => {
    expect(resultsHeadline(rollupByHome(ROWS))).toBe(
      'Reached 3 of 5 homes by email or text. 1 more home has it only in the portal. 1 of 2 emailed homes opened it (approximate). 1 home couldn’t be reached.',
    )
  })
})

describe('followUpAudience', () => {
  const rollup = rollupByHome(ROWS)
  it('follows up the same people for unit-based audiences', () => {
    expect(followUpAudience({ kind: 'everyone' }, rollup)).toEqual({ unitIds: ['u2'], ownersOnly: false })
    expect(followUpAudience({ kind: 'owners_only' }, rollup)).toEqual({ unitIds: ['u2'], ownersOnly: true })
    expect(followUpAudience({ kind: 'specific_units', ownersOnly: true }, rollup)?.ownersOnly).toBe(true)
  })

  it('offers nothing where a unit list would reach different people', () => {
    for (const kind of ['tenants_only', 'specific_residents', 'board', 'manual_emails', 'precomputed']) {
      expect(followUpAudience({ kind }, rollup), kind).toBeNull()
    }
    expect(followUpAudience(null, rollup)).toBeNull()
  })

  it('offers nothing when everyone opened', () => {
    expect(followUpAudience({ kind: 'everyone' }, rollupByHome([{ unit_id: 'u1', channel: 'email', delivery_status: 'opened' }]))).toBeNull()
  })
})

describe('reminderSubject', () => {
  it('prefixes once', () => {
    expect(reminderSubject('Water off Thursday')).toBe('Reminder: Water off Thursday')
    expect(reminderSubject('Reminder: Water off Thursday')).toBe('Reminder: Water off Thursday')
  })
})

describe('buildFollowUpDraft', () => {
  const base = {
    id: '11111111-1111-1111-1111-111111111111',
    status: 'sent',
    subject: 'Dues due {{due_date}}',
    body_html: '<p>Hi {{ recipient_name }}, dues are due {{ due_date }} at {{ place }}.</p>',
    body_text: null,
    audience_definition: { kind: 'everyone' },
    recipients: [
      { unit_id: 'u1', channel: 'email', delivery_status: 'opened', rendered_subject: 'Dues due Nov 1' },
      { unit_id: 'u2', channel: 'email', delivery_status: 'delivered', rendered_subject: 'Dues due Nov 1' },
    ],
  }

  it('fills the composer for the non-openers, recovering what it can', () => {
    const d = buildFollowUpDraft(base, { associationName: 'Lakeside HOA', via: 'email' })
    expect(d).toMatchObject({
      originalId: base.id,
      via: 'email',
      subject: 'Reminder: Dues due Nov 1',
      unitIds: ['u2'],
      ownersOnly: false,
      spanishDropped: false,
      missing: ['place'],
    })
    // Recovered into the body; ambient fields left for the per-recipient render.
    expect(d?.bodyHtml).toBe('<p>Hi {{ recipient_name }}, dues are due Nov 1 at {{ place }}.</p>')
  })

  it('keeps the English only and says so', () => {
    const d = buildFollowUpDraft(
      {
        ...base,
        subject: 'Pool closed',
        body_html: composeBilingualHtml({ englishHtml: '<p>Closed.</p>', spanishSubject: 'Piscina', spanishHtml: '<p>Cerrada.</p>' }),
      },
      { associationName: 'Lakeside HOA', via: 'text' },
    )
    expect(d?.bodyHtml).toBe('<p>Closed.</p>')
    expect(d?.spanishDropped).toBe(true)
  })

  it('nothing for a message that has not been sent', () => {
    expect(buildFollowUpDraft({ ...base, status: 'scheduled' }, { associationName: 'x', via: 'email' })).toBeNull()
  })
})
