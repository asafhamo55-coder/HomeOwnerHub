import { describe, expect, it } from 'vitest'
import { SMS_MAX_CHARS } from '@/lib/communications/sms-body'
import { renderArcDecisionEmail, renderTicketReplyEmail } from './render'

const PORTAL = 'https://www.homeownerledger.com/resident/arc/3f1c2a7e-0000-4000-8000-000000000001'
const base = {
  associationName: 'Maple Court HOA',
  residentName: 'Dana Smith',
  applicationSummary: 'Repaint front door',
  portalUrl: PORTAL,
}

describe('ARC decision email', () => {
  it('approval carries the board’s letter verbatim and the portal link', () => {
    const e = renderArcDecisionEmail({ ...base, kind: 'approved', letter: 'Dear Dana,\n\nApproved as submitted.\n\nThe Board' })
    expect(e.subject).toBe('Your ARC application was approved')
    expect(e.text).toContain('Approved as submitted.')
    expect(e.text).toContain('Dear Dana,\n\nApproved as submitted.\n\nThe Board')
    expect(e.text).toContain(PORTAL)
    expect(e.html).toContain(`href="${PORTAL}"`)
    expect(e.html).toContain('Approved as submitted.')
    expect(e.text).toContain('Repaint front door')
  })

  it('each decision has its own subject', () => {
    const s = (kind: 'approved_with_conditions' | 'denied' | 'more_info') =>
      renderArcDecisionEmail({ ...base, kind, letter: 'x' }).subject
    expect(s('approved_with_conditions')).toBe('Your ARC application was approved with conditions')
    expect(s('denied')).toBe('Your ARC application was denied')
    expect(s('more_info')).toBe('The board needs more information about your ARC application')
  })

  it('escapes everything a person typed in the HTML', () => {
    const e = renderArcDecisionEmail({
      ...base,
      residentName: 'Dana <b>',
      applicationSummary: 'Fence & <gate>',
      kind: 'denied',
      letter: '<script>alert(1)</script>',
    })
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;')
    expect(e.html).toContain('Fence &amp; &lt;gate&gt;')
    expect(e.html).toContain('Dana &lt;b&gt;')
  })

  it('no letter: says to open the portal instead of showing an empty box', () => {
    const e = renderArcDecisionEmail({ ...base, kind: 'approved', letter: '   ' })
    expect(e.text).not.toContain('The board’s letter')
    expect(e.text).toContain('Open your application in the resident portal')
  })

  it('no name on file: a plain greeting', () => {
    const e = renderArcDecisionEmail({ ...base, residentName: null, kind: 'approved', letter: 'ok' })
    expect(e.text.startsWith('Hello,')).toBe(true)
  })

  it('the text message is one SMS, ends with the portal link when shortened', () => {
    const long = 'Dear Dana, '.repeat(80)
    const e = renderArcDecisionEmail({ ...base, kind: 'approved_with_conditions', letter: long })
    expect(e.sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(e.sms.endsWith(PORTAL)).toBe(true)
    expect(e.sms.startsWith('Maple Court HOA: Your ARC application was approved with conditions')).toBe(true)
  })
})

describe('ticket reply email', () => {
  const t = {
    associationName: 'Maple Court HOA',
    residentName: 'Dana Smith',
    ticketSubject: 'Pool gate is broken',
    reply: 'Thanks — a vendor is booked for Tuesday.',
    portalUrl: 'https://www.homeownerledger.com/resident/tickets/abc',
  }

  it('says the board replied, quotes the reply and links to the request', () => {
    const e = renderTicketReplyEmail(t)
    expect(e.subject).toBe('The board replied to your request')
    expect(e.text).toContain('Pool gate is broken')
    expect(e.text).toContain('Thanks — a vendor is booked for Tuesday.')
    expect(e.text).toContain(t.portalUrl)
    expect(e.html).toContain(`href="${t.portalUrl}"`)
  })

  it('text message fits one SMS', () => {
    const e = renderTicketReplyEmail({ ...t, reply: 'word '.repeat(200) })
    expect(e.sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(e.sms.endsWith(t.portalUrl)).toBe(true)
  })

  it('a short reply goes in the text whole', () => {
    expect(renderTicketReplyEmail(t).sms).toBe(
      'Maple Court HOA: The board replied to your request: Thanks — a vendor is booked for Tuesday.',
    )
  })
})
