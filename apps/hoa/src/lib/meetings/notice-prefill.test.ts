import { describe, expect, it } from 'vitest'
import { BUILT_IN_TEMPLATES } from '@/lib/communications/built-in-templates'
import { parseDraftState, DRAFT_STATE_VERSION } from '@/lib/communications/drafts'
import {
  MAX_CALENDAR_WHERE,
  MAX_PREFILL_AGENDA,
  MEETING_NOTICE_TEMPLATE_ID,
  TEMPLATE_MEETING_TYPE,
  buildMeetingNoticePrefill,
  calendarLinkParams,
  calendarLinkPath,
  calendarParagraphHtml,
  parseMeetingParam,
} from './notice-prefill'

const ID = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const template = BUILT_IN_TEMPLATES.find((t) => t.id === MEETING_NOTICE_TEMPLATE_ID)!

describe('the built-in Meeting notice template is the one prefilled', () => {
  it('exists, is a meeting template, and asks type, date, time, place, agenda', () => {
    expect(template).toBeDefined()
    expect(template.category).toBe('meeting')
    expect(template.questions.map((q) => q.id)).toEqual(['meeting_type', 'meeting_date', 'meeting_time', 'meeting_location', 'agenda'])
  })

  it('every meeting type maps to one of the template’s options', () => {
    const options = template.questions.find((q) => q.id === 'meeting_type')!.options!
    for (const v of Object.values(TEMPLATE_MEETING_TYPE)) expect(options).toContain(v)
  })
})

describe('buildMeetingNoticePrefill', () => {
  it('maps type, date and agenda; all owners; category meeting; time and place left blank', () => {
    const p = buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'annual', agenda: '  1. Budget\n2. Election ' })
    expect(p).toEqual({
      meetingId: ID,
      meetingDate: '2026-11-04',
      templateId: MEETING_NOTICE_TEMPLATE_ID,
      baseCategory: 'meeting',
      audience: 'owners_only',
      answers: { meeting_type: 'Annual members’ meeting', meeting_date: '2026-11-04', agenda: '1. Budget\n2. Election' },
    })
    expect(p.answers).not.toHaveProperty('meeting_time')
    expect(p.answers).not.toHaveProperty('meeting_location')
  })

  it('regular/emergency/null → Board meeting; special → Special members’ meeting', () => {
    expect(buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'regular', agenda: null }).answers.meeting_type).toBe('Board meeting')
    expect(buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'emergency', agenda: null }).answers.meeting_type).toBe('Board meeting')
    expect(buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: null, agenda: null }).answers.meeting_type).toBe('Board meeting')
    expect(buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'special', agenda: null }).answers.meeting_type).toBe('Special members’ meeting')
  })

  it('no agenda → the template’s fallback applies (no answer); a long one is capped', () => {
    expect(buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'regular', agenda: '   ' }).answers).not.toHaveProperty('agenda')
    const long = buildMeetingNoticePrefill({ id: ID, meetingDate: '2026-11-04', meetingType: 'regular', agenda: 'x'.repeat(9000) })
    expect(long.answers.agenda).toHaveLength(MAX_PREFILL_AGENDA)
  })
})

describe('parseMeetingParam', () => {
  it('only a uuid', () => {
    expect(parseMeetingParam(ID)).toBe(ID)
    expect(parseMeetingParam('1; drop table')).toBeNull()
    expect(parseMeetingParam(undefined)).toBeNull()
  })
})

describe('calendar link', () => {
  const SIG = 'a'.repeat(64)
  it('carries start and place, bounded, with the signature; drops a malformed time', () => {
    expect(calendarLinkPath(ID, { time: '19:30', where: 'Clubhouse, 100 Elm St' }, SIG)).toBe(
      `/resident/meetings/${ID}/calendar?start=19%3A30&where=Clubhouse%2C+100+Elm+St&sig=${SIG}`,
    )
    expect(calendarLinkPath(ID, { time: '7pm', where: '' }, SIG)).toBe(`/resident/meetings/${ID}/calendar`)
    const where = new URL(`https://x${calendarLinkPath(ID, { where: 'a'.repeat(500) }, SIG)}`).searchParams.get('where')!
    expect(where).toHaveLength(MAX_CALENDAR_WHERE)
  })

  it('L-3: without a signature the link carries the date only', () => {
    expect(calendarLinkPath(ID, { time: '19:30', where: 'Clubhouse' })).toBe(`/resident/meetings/${ID}/calendar`)
    expect(calendarLinkPath(ID, { time: '19:30', where: 'Clubhouse' }, null)).toBe(`/resident/meetings/${ID}/calendar`)
  })

  it('L-3: params are normalised exactly as signed (collapsed, trimmed, capped)', () => {
    expect(calendarLinkParams({ time: '18:00', where: '  Hall \n  B  ' })).toEqual({ start: '18:00', where: 'Hall B' })
    expect(calendarLinkParams({ time: '7pm', where: '   ' })).toEqual({ start: null, where: null })
    const capped = calendarLinkParams({ where: `${'a'.repeat(199)} b` }).where!
    expect(capped).toBe('a'.repeat(199))
  })

  it('the paragraph escapes HTML and has no merge fields', () => {
    const html = calendarParagraphHtml('https://app.example.com', ID, { time: '18:00', where: '<b>"Hall"</b> & co' }, SIG)
    expect(html).not.toContain('{{')
    expect(html).not.toContain('<b>')
    expect(html).toContain(`href="https://app.example.com/resident/meetings/${ID}/calendar?start=18%3A00&amp;where=`)
    expect(html).toContain('https://app.example.com/resident/meetings</a>')
  })
})

describe('draft round trip keeps the meeting link', () => {
  it('meetingNotice survives parseDraftState; a bad id is dropped', () => {
    const base = { v: DRAFT_STATE_VERSION, step: 1, subject: 's', bodyHtml: 'b', answers: {} }
    expect(parseDraftState({ ...base, meetingNotice: { meetingId: ID } })?.meetingNotice).toEqual({ meetingId: ID })
    expect(parseDraftState({ ...base, meetingNotice: { meetingId: 'nope' } })).not.toHaveProperty('meetingNotice')
    expect(parseDraftState(base)).not.toHaveProperty('meetingNotice')
  })
})
