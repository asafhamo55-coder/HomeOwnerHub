import { describe, expect, it } from 'vitest'
import { residentCalendarHref } from './resident-calendar-link'
import { verifyCalendarLink } from './calendar-link-sign'

const ORG = '5b1f0a52-0000-4000-8000-000000000001'
const MEETING = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const SECRET = 'test-secret'

describe('residentCalendarHref', () => {
  it('returns a signed URL that verifyCalendarLink accepts', () => {
    const href = residentCalendarHref(ORG, MEETING, SECRET)!
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe(`/resident/meetings/${MEETING}/calendar`)
    const sig = url.searchParams.get('sig')
    expect(verifyCalendarLink(SECRET, { orgId: ORG, meetingId: MEETING, start: null, where: null, sig })).toBe(true)
  })
  it('does not verify for another org, another meeting or another secret', () => {
    const sig = new URL(residentCalendarHref(ORG, MEETING, SECRET)!, 'https://x.test').searchParams.get('sig')
    expect(verifyCalendarLink(SECRET, { orgId: 'other', meetingId: MEETING, start: null, where: null, sig })).toBe(false)
    expect(verifyCalendarLink(SECRET, { orgId: ORG, meetingId: 'other', start: null, where: null, sig })).toBe(false)
    expect(verifyCalendarLink('nope', { orgId: ORG, meetingId: MEETING, start: null, where: null, sig })).toBe(false)
  })
  it('produces no link without a secret', () => {
    expect(residentCalendarHref(ORG, MEETING, null)).toBeNull()
  })
})
