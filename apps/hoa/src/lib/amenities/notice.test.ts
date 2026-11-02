import { describe, expect, it } from 'vitest'
import { buildAmenityEmail, mayEmailMember, requestBell } from './notice'

const args = { amenityName: 'Clubhouse', slot: 'Sat, Nov 8, 2:00 PM to 6:00 PM', note: null, link: 'https://app.example/resident/amenities' }

describe('amenity email wording', () => {
  it('says what happened and what to do next, with no dashes', () => {
    for (const kind of ['approved', 'denied', 'canceled_by_board'] as const) {
      const m = buildAmenityEmail(kind, { ...args, note: 'The room is closed for repairs' })
      expect(m.subject).toContain('Clubhouse')
      expect(m.text).toContain('Sat, Nov 8, 2:00 PM to 6:00 PM')
      expect(m.text).toContain(args.link)
      expect(`${m.subject}${m.text}${m.html}`).not.toMatch(/[–—]/)
    }
    expect(buildAmenityEmail('approved', args).text).toContain('cancel any time before it starts')
    expect(buildAmenityEmail('denied', { ...args, note: 'Closed for repairs' }).text).toContain('Their note: Closed for repairs')
  })

  it('escapes the board note in the html', () => {
    const m = buildAmenityEmail('denied', { ...args, note: '<script>x</script>' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})

describe('who may be emailed', () => {
  const granted = { granted: true, method: 'portal' as const, at: '2026-01-01T00:00:00Z' }
  it('never emails a member who turned email off or revoked consent', () => {
    expect(mayEmailMember({ state: 'GA', emailOptIn: false, consent: undefined, consentAvailable: false })).toBe(false)
    expect(mayEmailMember({ state: 'GA', emailOptIn: true, consent: { ...granted, granted: false }, consentAvailable: true })).toBe(false)
  })
  it('needs recorded consent in California when the consent table is live', () => {
    expect(mayEmailMember({ state: 'CA', emailOptIn: true, consent: undefined, consentAvailable: true })).toBe(false)
    expect(mayEmailMember({ state: 'ca', emailOptIn: true, consent: granted, consentAvailable: true })).toBe(true)
    expect(mayEmailMember({ state: 'CA', emailOptIn: true, consent: undefined, consentAvailable: false })).toBe(true)
  })
  it('emails a Georgia resident who has not opted out', () => {
    expect(mayEmailMember({ state: 'GA', emailOptIn: true, consent: undefined, consentAvailable: true })).toBe(true)
  })
})

describe('the board bell', () => {
  it('is deduped on the reservation and never rings the person who asked', () => {
    const b = requestBell({ organizationId: 'o', actorId: 'u', reservationId: 'r', amenityName: 'Pool' })
    expect(b).toMatchObject({ entityId: 'r', actorId: 'u', link: '/amenities', entityType: 'amenity_reservation' })
    expect(b.title).toContain('Pool')
  })
})
