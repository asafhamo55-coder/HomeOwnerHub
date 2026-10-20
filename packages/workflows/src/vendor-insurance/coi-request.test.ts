import { describe, expect, it } from 'vitest'
import { coiDaysLeft, coiExpiryLabel, coiExpiryState, coiRequestHtml, draftCoiRequest, formatCoiDate } from './coi-request'

describe('coiExpiryState (BL-083)', () => {
  const today = '2026-10-20'
  it('expired from the day after, expiring through 30 days out (today included), else current', () => {
    expect(coiExpiryState('2026-10-19', today)).toBe('expired')
    expect(coiExpiryState('2026-10-20', today)).toBe('expiring')
    expect(coiExpiryState('2026-11-19', today)).toBe('expiring') // 30 days
    expect(coiExpiryState('2026-11-20', today)).toBe('current') // 31 days
    expect(coiExpiryState('2026-10-19T23:00:00Z', today)).toBe('expired')
  })
  it('no date, or a bad one, is null', () => {
    expect(coiExpiryState(null, today)).toBeNull()
    expect(coiExpiryState('soon', today)).toBeNull()
  })
  it('counts calendar days across a DST change and a leap day', () => {
    expect(coiDaysLeft('2026-11-02', '2026-10-31')).toBe(2)
    expect(coiDaysLeft('2028-03-01', '2028-02-28')).toBe(2)
  })
})

describe('labels and dates', () => {
  it('reads naturally', () => {
    expect(coiExpiryLabel(-1)).toBe('Expired 1 day ago')
    expect(coiExpiryLabel(-3)).toBe('Expired 3 days ago')
    expect(coiExpiryLabel(0)).toBe('Expires today')
    expect(coiExpiryLabel(12)).toBe('Expires in 12 days')
    expect(formatCoiDate('2026-10-25')).toBe('October 25, 2026')
  })
})

describe('draftCoiRequest', () => {
  const base = { associationName: 'Maple Court HOA', vendorName: 'Acme Roofing LLC', today: '2026-10-20', requirementLines: [] }
  it('says when it expires, or that it has expired, and lists the minimums', () => {
    const soon = draftCoiRequest({ ...base, expiresOn: '2026-10-25', requirementLines: ['Auto liability: $1,000,000'] })
    expect(soon.subject).toBe('Updated certificate of insurance for Maple Court HOA')
    expect(soon.body).toContain('expires on October 25, 2026')
    expect(soon.body).toContain('- Auto liability: $1,000,000')
    expect(draftCoiRequest({ ...base, expiresOn: '2026-10-01' }).body).toContain('expired on October 1, 2026')
    expect(draftCoiRequest({ ...base, expiresOn: '2026-10-20' }).body).toContain('expires today')
    expect(draftCoiRequest({ ...base, expiresOn: null }).body).toContain('does not have a current certificate')
    expect(soon.body).toContain('must show at least')
    expect(draftCoiRequest({ ...base, expiresOn: '2026-10-25' }).body).not.toContain('must show at least')
  })
})

describe('coiRequestHtml', () => {
  it('escapes and paragraphs the plain text', () => {
    const html = coiRequestHtml('Hi <b>you</b>,\n\nLine one\nLine two')
    expect(html).toContain('<p>Hi &lt;b&gt;you&lt;/b&gt;,</p>')
    expect(html).toContain('<p>Line one<br>Line two</p>')
  })
})
