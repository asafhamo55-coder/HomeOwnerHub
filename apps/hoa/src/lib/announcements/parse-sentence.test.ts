import { describe, expect, it } from 'vitest'
import { parseAnnouncementSentence } from './parse-sentence'

// Monday, October 26, 2026.
const TODAY = '2026-10-26'
const parse = (s: string) => parseAnnouncementSentence(s, TODAY)

describe('parseAnnouncementSentence', () => {
  it('reads the backlog example', () => {
    expect(parse('Halloween party Oct 31 at 6pm at the clubhouse')).toEqual({
      date: '2026-10-31',
      time: '18:00',
      place: 'the clubhouse',
      occasionId: 'halloween-party',
    })
  })

  it.each([
    ['Party on October 31st at 6:30 pm in the pool area.', '2026-10-31', '18:30', 'the pool area'],
    ['Yard sale Saturday 9am at the main gate', '2026-10-31', '09:00', 'the main gate'],
    ['Meeting tomorrow at 7 pm in the community room', '2026-10-27', '19:00', 'the community room'],
    ['Cleanup 11/14 at noon by the lake', '2026-11-14', '12:00', 'the lake'],
    ['Cleanup 11/14/2027 at 10:00 a.m. at Pavilion B', '2027-11-14', '10:00', 'Pavilion B'],
    ['Social on 5 December from 4pm at the clubhouse, bring a dish', '2026-12-05', '16:00', 'the clubhouse'],
    ['Movie night next Friday at 8 pm at the pool', '2026-11-06', '20:00', 'the pool'],
    ['Pool opens this Saturday', '2026-10-31', '', ''],
    ['Trash pickup moves to Thursday', '2026-10-29', '', ''],
    ['Concert tonight at 18:30 at the green', '2026-10-26', '18:30', 'the green'],
  ])('reads "%s"', (sentence, date, time, place) => {
    const r = parse(sentence)
    expect(r.date).toBe(date)
    expect(r.time).toBe(time)
    expect(r.place).toBe(place)
  })

  it('treats a month and day that already passed as next year, never the past', () => {
    expect(parse('Meeting Mar 3').date).toBe('2027-03-03')
    expect(parse('Meeting Oct 26').date).toBe('2026-10-26')
  })

  it('returns blanks when it is not sure', () => {
    expect(parse('Remember to leash your dogs')).toMatchObject({ date: '', time: '', place: '' })
    expect(parse('Gate code changes on Feb 30').date).toBe('')
    expect(parse('We may meet at 25pm').time).toBe('')
  })

  it('does not read "may" the verb as a date', () => {
    expect(parse('We may fix the gate').date).toBe('')
  })

  it('names the occasion the words point at', () => {
    expect(parse('Happy holidays everyone').occasionId).toBe('happy-holidays')
    expect(parse('Graduation reminder: guests park on Elm').occasionId).toBe('graduation')
  })
})
