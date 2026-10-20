import { describe, expect, it } from 'vitest'
import {
  DRAFT_STATE_VERSION,
  UNTITLED_DRAFT,
  draftHref,
  draftRowFields,
  draftStateFromRow,
  draftTitle,
  isDraftEmpty,
  parseDraftState,
  type ComposerDraftState,
} from './drafts'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

function state(over: Partial<ComposerDraftState> = {}): ComposerDraftState {
  return {
    v: DRAFT_STATE_VERSION,
    step: 1,
    templateId: '',
    baseCategory: 'announcement',
    audience: 'everyone',
    selectedPropertyId: '',
    checkedResidentIds: [],
    checkedBoardIds: [],
    manualContacts: [],
    selectedStreetKey: '',
    streetOwnersOnly: false,
    answers: {},
    subject: 'Pool closed Friday',
    bodyHtml: '<p>The pool is closed.</p>',
    channels: ['email', 'portal'],
    urgency: 'routine',
    channelsTouched: false,
    scheduledFor: '',
    spanish: null,
    officialNotice: false,
    followUp: null,
    ...over,
  }
}

describe('parseDraftState', () => {
  it('round-trips a full state through JSON', () => {
    const s = state({
      audience: 'specific_property',
      selectedPropertyId: U1,
      checkedResidentIds: [U2],
      answers: { due_date: 'Nov 1', items: ['a', 'b'] },
      spanish: { subject: 'Piscina', bodyHtml: '<p>Cerrada</p>', viewed: true, sourceKey: 'k' },
      urgency: 'urgent',
    })
    expect(parseDraftState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('rejects non-objects and other versions', () => {
    expect(parseDraftState(null)).toBeNull()
    expect(parseDraftState('x')).toBeNull()
    expect(parseDraftState({ ...state(), v: 99 })).toBeNull()
  })

  it('drops malformed fields instead of trusting them', () => {
    const parsed = parseDraftState({
      ...state(),
      audience: 'everyone_in_the_world',
      baseCategory: 'spam',
      channels: ['email', 'fax'],
      checkedResidentIds: ['not-a-uuid', U1],
      selectedPropertyId: 'nope',
      step: 7,
      manualContacts: [{ email: 'a@example.test' }, { name: 'only a name' }, 5],
    })
    expect(parsed).toMatchObject({
      audience: 'everyone',
      baseCategory: 'announcement',
      channels: ['email'],
      checkedResidentIds: [U1],
      selectedPropertyId: '',
      step: 2,
      manualContacts: [{ email: 'a@example.test', phone: '', name: '' }],
    })
  })

  it('a follow-up audience without its homes falls back to everyone', () => {
    expect(parseDraftState({ ...state(), audience: 'follow_up', followUp: null })?.audience).toBe('everyone')
    const followUp = {
      originalId: U1,
      originalSubject: 'Water off',
      via: 'email' as const,
      subject: 'Reminder: Water off',
      bodyHtml: '<p>x</p>',
      unitIds: [U2],
      ownersOnly: true,
      spanishDropped: false,
      missing: [],
    }
    const parsed = parseDraftState({ ...state(), audience: 'follow_up', followUp })
    expect(parsed?.audience).toBe('follow_up')
    expect(parsed?.followUp).toEqual(followUp)
  })
})

describe('isDraftEmpty', () => {
  it('is empty with no subject, no body text and no answers', () => {
    expect(isDraftEmpty({ subject: ' ', bodyHtml: '<p>&nbsp;</p>', answers: {} })).toBe(true)
  })
  it('anything typed makes it worth keeping', () => {
    expect(isDraftEmpty({ subject: 'Hi', bodyHtml: '', answers: {} })).toBe(false)
    expect(isDraftEmpty({ subject: '', bodyHtml: '<p>x</p>', answers: {} })).toBe(false)
    expect(isDraftEmpty({ subject: '', bodyHtml: '', answers: { due: 'Nov 1' } })).toBe(false)
    expect(isDraftEmpty({ subject: '', bodyHtml: '', answers: { picks: [] } })).toBe(true)
  })
})

describe('draftRowFields', () => {
  it('stores the composer state under a draft marker and links, schedules and templates nothing', () => {
    const s = state({ scheduledFor: '2026-11-01T09:00', templateId: U1 })
    const f = draftRowFields(s)
    expect(f.audience_definition).toEqual({ kind: 'draft', composer: s })
    expect(f.related_resource).toBeNull()
    expect(f.scheduled_for).toBeNull()
    expect(f.template_id).toBeNull()
    expect(f.subject).toBe('Pool closed Friday')
    expect(f.category).toBe('announcement')
  })

  it('never stores an empty channel list', () => {
    expect(draftRowFields(state({ channels: [] })).channels).toEqual(['email'])
  })

  it('caps the subject at the column limit', () => {
    expect(draftRowFields(state({ subject: 'x'.repeat(400) })).subject).toHaveLength(255)
  })
})

describe('draftStateFromRow', () => {
  it('reads the composer state back from a draft row', () => {
    const s = state()
    expect(draftStateFromRow(draftRowFields(s).audience_definition)).toEqual(s)
  })
  it('ignores a real audience definition', () => {
    expect(draftStateFromRow({ kind: 'everyone' })).toBeNull()
    expect(draftStateFromRow(null)).toBeNull()
  })
})

describe('labels', () => {
  it('names an untitled draft', () => {
    expect(draftTitle('  ')).toBe(UNTITLED_DRAFT)
    expect(draftTitle(' Pool ')).toBe('Pool')
  })
  it('resumes in the composer', () => {
    expect(draftHref(U1)).toBe(`/communications/new?draft=${U1}`)
  })
})
