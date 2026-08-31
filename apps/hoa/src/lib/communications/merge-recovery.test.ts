import { describe, it, expect } from 'vitest'
import { unresolvedFields, recoverFromRenderedSubject } from './merge-recovery'

/**
 * A resend re-renders from the recipient row alone, because the wizard's
 * answers were never persisted on the communication. The 2026-08-31
 * yard-upkeep blast needed deadline_date, season_context and upkeep_items,
 * so all 37 retries died at "missing merge fields".
 *
 * These two functions let the UI ask for exactly what it cannot resolve,
 * pre-filled with whatever can be reconstructed from what IS stored.
 */
const AMBIENT = {
  association_name: 'Madison Park',
  recipient_name: 'Resident',
  owner_name: 'Resident',
  unit_id: '',
}

describe('unresolvedFields', () => {
  it('lists placeholders the ambient bag cannot satisfy', () => {
    expect(
      unresolvedFields({
        subject: 'Yard upkeep in {{association_name}} before {{deadline_date}}',
        bodyHtml: '<p>Hi {{recipient_name}}, {{season_context}} — {{upkeep_items}}</p>',
        bodyText: 'Hi {{recipient_name}}, {{season_context}}',
        known: AMBIENT,
      }),
    ).toEqual(['deadline_date', 'season_context', 'upkeep_items'])
  })

  it('returns nothing when every placeholder is ambient', () => {
    expect(
      unresolvedFields({
        subject: 'Notice for {{association_name}}',
        bodyHtml: '<p>Hi {{recipient_name}}</p>',
        known: AMBIENT,
      }),
    ).toEqual([])
  })

  it('deduplicates a field used in several places', () => {
    expect(
      unresolvedFields({
        subject: '{{deadline_date}}',
        bodyHtml: '{{deadline_date}} and {{deadline_date}}',
        bodyText: '{{deadline_date}}',
        known: AMBIENT,
      }),
    ).toEqual(['deadline_date'])
  })

  it('treats an empty-string known value as satisfied', () => {
    // unit_id is legitimately '' for association-wide recipients.
    expect(unresolvedFields({ subject: '{{unit_id}}', bodyHtml: '', known: AMBIENT })).toEqual([])
  })

  it('tolerates a null body', () => {
    expect(
      unresolvedFields({ subject: '{{deadline_date}}', bodyHtml: null, bodyText: null, known: AMBIENT }),
    ).toEqual(['deadline_date'])
  })
})

describe('recoverFromRenderedSubject', () => {
  // The real case: rendered_subject IS stored, so a value that appears in
  // the subject survives even though the wizard answer did not.
  it('recovers the value that only the subject carries', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Yard upkeep in {{association_name}} before {{deadline_date}}',
        renderedSubject: 'Yard upkeep in Madison Park before Friday, September 11',
        known: AMBIENT,
      }),
    ).toEqual({ deadline_date: 'Friday, September 11' })
  })

  it('recovers a value that is not at the end of the subject', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: '{{deadline_date}} deadline for {{association_name}}',
        renderedSubject: 'September 11 deadline for Madison Park',
        known: AMBIENT,
      }),
    ).toEqual({ deadline_date: 'September 11' })
  })

  it('returns nothing when the subject has no unknown placeholder', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Notice for {{association_name}}',
        renderedSubject: 'Notice for Madison Park',
        known: AMBIENT,
      }),
    ).toEqual({})
  })

  it('returns nothing when no rendered subject was stored', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Before {{deadline_date}}',
        renderedSubject: null,
        known: AMBIENT,
      }),
    ).toEqual({})
  })

  // Regex metacharacters in the literal text must not be treated as syntax.
  it('handles punctuation in the surrounding literal text', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Action required (urgent): {{deadline_date}}?',
        renderedSubject: 'Action required (urgent): Friday?',
        known: AMBIENT,
      }),
    ).toEqual({ deadline_date: 'Friday' })
  })

  it('gives up rather than guess when the rendered subject does not match', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Yard upkeep before {{deadline_date}}',
        renderedSubject: 'Something else entirely',
        known: AMBIENT,
      }),
    ).toEqual({})
  })

  // Two unknowns separated only by a space cannot be split reliably; the
  // form is editable, so a wrong guess is worse than no guess.
  it('does not guess when two unknowns are adjacent', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: '{{a}} {{b}}',
        renderedSubject: 'one two three',
        known: AMBIENT,
      }),
    ).toEqual({})
  })

  it('never returns an empty captured value', () => {
    expect(
      recoverFromRenderedSubject({
        subjectTemplate: 'Before {{deadline_date}}',
        renderedSubject: 'Before ',
        known: AMBIENT,
      }),
    ).toEqual({})
  })
})
