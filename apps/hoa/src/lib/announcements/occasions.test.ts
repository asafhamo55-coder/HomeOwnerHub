import { describe, expect, it } from 'vitest'
import { composeSmsBody, SMS_MAX_CHARS } from '../communications/sms-body'
import { composeBilingualSms } from '../communications/bilingual'
import { htmlToMessageText, plainTextToHtml } from '../communications/plain-text'
import {
  EMPTY_FACTS,
  OCCASIONS,
  cleanFact,
  fillCustom,
  fillOccasion,
  formatTime,
  matchOccasion,
  type AnnouncementFacts,
} from './occasions'

// A real portal link is an https URL with a uuid: ~75 characters.
const PORTAL = 'https://app.example.org/communications/00000000-0000-0000-0000-000000000000'
const FULL: AnnouncementFacts = { date: '2026-10-31', time: '18:00', place: 'the clubhouse', detail: 'Bring a snack to share.' }
const ASSOCS = ['Lakeside HOA', 'The Very Long Named Heritage Oaks at Riverbend Community Association']

const PLACEHOLDER = /\{|\}|\[\s*\w*\s*\]|undefined|null|NaN/

describe('occasion templates', () => {
  it('offers 12 to 30 occasions with unique ids', () => {
    expect(OCCASIONS.length).toBeGreaterThanOrEqual(12)
    expect(OCCASIONS.length).toBeLessThanOrEqual(30)
    expect(new Set(OCCASIONS.map((o) => o.id)).size).toBe(OCCASIONS.length)
  })

  for (const o of OCCASIONS) {
    describe(o.id, () => {
      for (const [name, facts] of [
        ['no facts', EMPTY_FACTS],
        ['all facts', FULL],
        ['date only', { ...EMPTY_FACTS, date: '2026-12-01' }],
      ] as const) {
        it(`renders with no unfilled placeholder (${name}), English and Spanish`, () => {
          for (const assoc of ASSOCS) {
            const filled = fillOccasion(o, assoc, facts)
            for (const lang of [filled.en, filled.es]) {
              expect(lang.subject).not.toMatch(PLACEHOLDER)
              expect(lang.body).not.toMatch(PLACEHOLDER)
              expect(lang.subject.length).toBeGreaterThan(3)
              expect(lang.body).not.toMatch(/\n{3,}/)
              expect(lang.body).not.toMatch(/ {2,}/)
              expect(lang.body).not.toMatch(/ [.,!?]/)
            }
          }
        })
      }

      it('stays within 279 characters as a text, with the opening line kept', () => {
        for (const assoc of ASSOCS) {
          for (const facts of [EMPTY_FACTS, FULL]) {
            const { en } = fillOccasion(o, assoc, facts)
            const text = htmlToMessageText(plainTextToHtml(en.body))
            const sms = composeSmsBody({ subject: en.subject, body: text, portalLink: PORTAL })
            expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
            if (assoc === ASSOCS[0]) {
              const lead = en.body.split('\n\n')[0]!
              expect(sms.startsWith(`${en.subject}: ${lead.slice(0, 60)}`)).toBe(true)
            }
          }
        }
      })

      it('fits one text in both languages, or falls back to English only, never over', () => {
        const { en, es } = fillOccasion(o, ASSOCS[0]!, FULL)
        const sms = composeBilingualSms({
          subject: en.subject,
          englishText: htmlToMessageText(plainTextToHtml(en.body)),
          spanish: { subject: es.subject, text: htmlToMessageText(plainTextToHtml(es.body)) },
          portalLink: PORTAL,
        })
        expect(sms.body.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
      })

      it('uses inclusive wording and assumes nothing about who lives in a home', () => {
        const { en, es } = fillOccasion(o, ASSOCS[0]!, FULL)
        const all = ` ${en.subject} ${en.body} ${es.subject} ${es.body}`.toLowerCase()
        for (const word of [
          'christmas', 'navidad', 'hanukkah', 'easter', 'pascua', 'church', 'iglesia', 'pray', 'bless', 'dios',
          'god', 'kids', 'children', 'niños', 'family', 'families', 'familias', 'husband', 'wife', 'mom', 'dad',
        ]) {
          expect(all, word).not.toMatch(new RegExp(`\\b${word}\\b`))
        }
      })

      it('never invents a time the board did not give', () => {
        const { en } = fillOccasion(o, ASSOCS[0]!, EMPTY_FACTS)
        expect(en.body).not.toMatch(/\b\d{1,2}:\d{2}\b/)
      })
    })
  }

  it('puts the date, time and place in the Halloween draft', () => {
    const { en, es } = fillOccasion(OCCASIONS[0]!, 'Lakeside HOA', FULL)
    expect(en.subject).toBe('Halloween party, Oct 31')
    expect(en.body).toContain('on Saturday, October 31 at 6:00 PM at the clubhouse')
    expect(en.body).toContain('Bring a snack to share.')
    expect(en.body).toContain('Lakeside HOA Board')
    expect(es.body).toContain('sábado, 31 de octubre a las 6:00 p. m. en the clubhouse')
  })

  it('removes merge-field braces and markup from anything the board typed', () => {
    const { en } = fillOccasion(OCCASIONS[0]!, 'Lakeside {{ owner_phone }} HOA', {
      date: '',
      time: '',
      place: '<b>{{club}}</b>',
      detail: '{{ amount }} due',
    })
    expect(`${en.subject}\n${en.body}`).not.toMatch(/[{}<>]/)
    expect(cleanFact('  a\n\n b  {{x}} ')).toBe('a b x')
  })

  it('formats times in 12 hour and Spanish clocks', () => {
    expect(formatTime('00:05', 'en')).toBe('12:05 AM')
    expect(formatTime('12:00', 'en')).toBe('12:00 PM')
    expect(formatTime('13:30', 'en')).toBe('1:30 PM')
    expect(formatTime('09:15', 'es')).toBe('9:15 a. m.')
  })

  it('builds a plain draft for a sentence that matches nothing', () => {
    const d = fillCustom('block party on the cul-de-sac', 'Lakeside HOA', { ...EMPTY_FACTS, date: '2026-06-14', time: '16:00' })
    expect(d.subject).toBe('Block party on the cul-de-sac')
    expect(d.body).toContain('Hello neighbors! Block party on the cul-de-sac.')
    expect(d.body).toContain('When: Sunday, June 14 at 4:00 PM')
    expect(d.body).toContain('Lakeside HOA Board')
    expect(`${d.subject}${d.body}`).not.toMatch(PLACEHOLDER)
    expect(fillCustom('x'.repeat(300), 'A', EMPTY_FACTS).subject.length).toBeLessThanOrEqual(60)
  })

  it('points a typed sentence at the right occasion', () => {
    expect(matchOccasion('Halloween party Oct 31 at 6pm')?.id).toBe('halloween-party')
    expect(matchOccasion('Reminder: pick up dog waste and keep dogs on a leash')?.id).toBe('pet-rules')
    expect(matchOccasion('Congrats to our graduates!')?.id).toBe('graduation')
    expect(matchOccasion('Pool closes for the season on Sept 7')?.id).toBe('pool-closing')
    expect(matchOccasion('Bulk trash pickup moves to Thursday')?.id).toBe('trash-pickup')
    expect(matchOccasion('Hurricane coming Thursday')?.id).toBe('severe-weather')
    expect(matchOccasion('We are painting the fence')).toBeNull()
  })
})
