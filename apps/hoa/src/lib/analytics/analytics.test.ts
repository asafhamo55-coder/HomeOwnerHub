import { describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS, ANALYTICS_EVENT_NAMES, sanitizeEvent } from './events'
import { analyticsEnabled, doNotTrack, scrubBeforeSend, scrubPath, scrubUrl } from './privacy'
import { sendEvent } from './track'

const UUID = '3f2c9a1e-8b7d-4c6e-9f0a-1b2c3d4e5f60'
const ORIGIN = 'https://app.example.com'

describe('scrubPath', () => {
  it('replaces uuids with [id]', () => {
    expect(scrubPath(`/inbox/${UUID}`)).toBe('/inbox/[id]')
    expect(scrubPath(`/rfps/${UUID}/bids/${UUID}`)).toBe('/rfps/[id]/bids/[id]')
    expect(scrubPath(`/resident/arc/${UUID}`)).toBe('/resident/arc/[id]')
  })

  it('drops the query string and hash', () => {
    expect(scrubPath(`/inbox/${UUID}?undo=abc&from=${UUID}#reply`)).toBe('/inbox/[id]')
    expect(scrubPath('/properties?q=smith+family')).toBe('/properties')
  })

  it('redacts numbers, long hex, tokens, emails and anything not a route word', () => {
    expect(scrubPath('/tickets/12345')).toBe('/tickets/[id]')
    expect(scrubPath('/documents/abcdef0123456789')).toBe('/documents/[id]')
    expect(scrubPath('/x/Zx9_kLmN0pQrStUv')).toBe('/x/[id]')
    expect(scrubPath('/people/jane%40example.com')).toBe('/people/[id]')
    expect(scrubPath('/people/jane@example.com')).toBe('/people/[id]')
    expect(scrubPath('/streets/Main%20Street')).toBe('/streets/[id]')
    expect(scrubPath('/unit/42')).toBe('/unit/[id]')
  })

  it('keeps route words and article slugs', () => {
    expect(scrubPath('/')).toBe('/')
    expect(scrubPath('/settings/billing')).toBe('/settings/billing')
    expect(scrubPath('/help/send-an-announcement')).toBe('/help/send-an-announcement')
    expect(scrubPath('/resident/dues/pay')).toBe('/resident/dues/pay')
  })
})

describe('scrubUrl / scrubBeforeSend', () => {
  it('keeps the origin, scrubs the path, drops the query', () => {
    expect(scrubUrl(`${ORIGIN}/violations/${UUID}/edit?tab=letter`)).toBe(`${ORIGIN}/violations/[id]/edit`)
  })

  it('returns null for an unparsable url', () => {
    expect(scrubUrl('not a url')).toBeNull()
  })

  it('scrubs page views and custom events alike', () => {
    const env = { nav: {}, win: {} }
    expect(scrubBeforeSend({ type: 'pageview', url: `${ORIGIN}/inbox/${UUID}?q=x` }, env)).toEqual({
      type: 'pageview',
      url: `${ORIGIN}/inbox/[id]`,
    })
    expect(scrubBeforeSend({ type: 'event', url: `${ORIGIN}/approvals?kind=bill` }, env)).toEqual({
      type: 'event',
      url: `${ORIGIN}/approvals`,
    })
  })

  it('L-6: scrubs a referrer to origin + route shape, and drops an unparsable one', () => {
    const env = { nav: {}, win: {} }
    const ev = { type: 'pageview' as const, url: `${ORIGIN}/inbox`, referrer: `${ORIGIN}/inbox/${UUID}?q=smith#x` }
    expect(scrubBeforeSend(ev, env)).toEqual({ type: 'pageview', url: `${ORIGIN}/inbox`, referrer: `${ORIGIN}/inbox/[id]` })
    expect(scrubBeforeSend({ ...ev, referrer: 'garbage' }, env)).toEqual({ type: 'pageview', url: `${ORIGIN}/inbox` })
    expect(scrubBeforeSend({ ...ev, referrer: '' }, env)).toEqual({ type: 'pageview', url: `${ORIGIN}/inbox` })
    // The other spelling too.
    expect(scrubBeforeSend({ type: 'event' as const, url: `${ORIGIN}/x`, referer: `https://mail.example.com/u/0/${UUID}` }, env)).toEqual({
      type: 'event',
      url: `${ORIGIN}/x`,
      referer: 'https://mail.example.com/u/[id]/[id]',
    })
  })

  it('L-6: scrubs any other URL- or path-looking field; leaves plain values alone', () => {
    const env = { nav: {}, win: {} }
    const ev = {
      type: 'event' as const,
      url: `${ORIGIN}/a`,
      href: `${ORIGIN}/properties/${UUID}?tab=owners`,
      path: `/violations/${UUID}/edit?x=1`,
      cdn: `//evil.example/${UUID}`,
      name: 'communication.sent',
      count: 3,
    }
    expect(scrubBeforeSend(ev, env)).toEqual({
      type: 'event',
      url: `${ORIGIN}/a`,
      href: `${ORIGIN}/properties/[id]`,
      path: '/violations/[id]/edit',
      name: 'communication.sent',
      count: 3,
    })
  })

  it('drops every event under Do Not Track or Global Privacy Control', () => {
    const ev = { type: 'pageview' as const, url: `${ORIGIN}/inbox` }
    expect(scrubBeforeSend(ev, { nav: { doNotTrack: '1' } })).toBeNull()
    expect(scrubBeforeSend(ev, { nav: { globalPrivacyControl: true } })).toBeNull()
    expect(scrubBeforeSend(ev, { win: { doNotTrack: '1' } })).toBeNull()
    expect(scrubBeforeSend(ev, { nav: { doNotTrack: '0' } })).not.toBeNull()
  })
})

describe('analyticsEnabled', () => {
  it('is off when the flag is unset, empty or anything but 1/true', () => {
    expect(analyticsEnabled(undefined)).toBe(false)
    expect(analyticsEnabled('')).toBe(false)
    expect(analyticsEnabled('0')).toBe(false)
    expect(analyticsEnabled('false')).toBe(false)
    expect(analyticsEnabled('yes')).toBe(false)
  })

  it('is on for 1 or true', () => {
    expect(analyticsEnabled('1')).toBe(true)
    expect(analyticsEnabled('true')).toBe(true)
    expect(analyticsEnabled(' TRUE ')).toBe(true)
  })

  it('reads NEXT_PUBLIC_ANALYTICS_ENABLED by default', () => {
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENABLED', '')
    expect(analyticsEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENABLED', '1')
    expect(analyticsEnabled()).toBe(true)
    vi.unstubAllEnvs()
  })
})

describe('doNotTrack', () => {
  it('reads DNT and GPC', () => {
    expect(doNotTrack(undefined)).toBe(false)
    expect(doNotTrack({ doNotTrack: 'yes' })).toBe(true)
    expect(doNotTrack({ doNotTrack: null, globalPrivacyControl: false })).toBe(false)
  })
})

describe('event allowlist', () => {
  it('has exactly the 8 named events', () => {
    expect(ANALYTICS_EVENT_NAMES.sort()).toEqual(
      [
        'approval.decided',
        'arc.decided',
        'communication.sent',
        'inbox.draft_approved',
        'inbox.draft_created',
        'resident.pay_opened',
        'resident.request_submitted',
        'violation.created',
      ].sort(),
    )
  })

  it('accepts a valid event and returns only allow-listed keys', () => {
    expect(sanitizeEvent('approval.decided', { kind: 'bill', decision: 'approve' })).toEqual({
      name: 'approval.decided',
      props: { kind: 'bill', decision: 'approve' },
    })
    expect(sanitizeEvent('inbox.draft_approved', { kind: 'reply', edited: true, closeThread: false })).not.toBeNull()
  })

  it('rejects unknown event names', () => {
    expect(sanitizeEvent('user.signed_in', {})).toBeNull()
    expect(sanitizeEvent('__proto__', {})).toBeNull()
    expect(sanitizeEvent('toString', {})).toBeNull()
  })

  it('rejects unknown props rather than passing them through', () => {
    expect(sanitizeEvent('arc.decided', { decision: 'approved', email: 'a@b.com' })).toBeNull()
    expect(sanitizeEvent('resident.request_submitted', { type: 'ticket', subject: 'Leak in unit 4' })).toBeNull()
    expect(sanitizeEvent('approval.decided', { kind: 'bill', decision: 'approve', id: UUID })).toBeNull()
  })

  it('rejects values outside their enum or range, and missing props', () => {
    expect(sanitizeEvent('arc.decided', { decision: 'Jane Smith' })).toBeNull()
    expect(sanitizeEvent('communication.sent', { scheduled: false, channelCount: 99, sms: false })).toBeNull()
    expect(sanitizeEvent('communication.sent', { scheduled: false, channelCount: 1.5, sms: false })).toBeNull()
    expect(sanitizeEvent('violation.created', { fromThread: true })).toBeNull()
  })

  it('has no free-text string field anywhere: every string prop is an enum', () => {
    for (const [name, schema] of Object.entries(ANALYTICS_EVENTS)) {
      for (const [key, field] of Object.entries(schema.shape)) {
        const typeName = (field as { _def: { typeName: string } })._def.typeName
        expect(['ZodEnum', 'ZodBoolean', 'ZodNumber'], `${name}.${key}`).toContain(typeName)
      }
    }
  })
})

describe('sendEvent', () => {
  const ok = { kind: 'w3', decision: 'reject' }

  it('sends nothing when analytics is disabled', () => {
    const send = vi.fn()
    expect(sendEvent('approval.decided', ok, { enabled: false, dnt: false, send })).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing under Do Not Track', () => {
    const send = vi.fn()
    expect(sendEvent('approval.decided', ok, { enabled: true, dnt: true, send })).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing for an unknown event or prop', () => {
    const send = vi.fn()
    expect(sendEvent('page.secret', ok, { enabled: true, dnt: false, send })).toBe(false)
    expect(sendEvent('approval.decided', { ...ok, note: 'x' }, { enabled: true, dnt: false, send })).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the sanitized event when enabled', () => {
    const send = vi.fn()
    expect(sendEvent('approval.decided', ok, { enabled: true, dnt: false, send })).toBe(true)
    expect(send).toHaveBeenCalledWith('approval.decided', ok)
  })

  it('never throws when the sender does', () => {
    const send = vi.fn(() => {
      throw new Error('boom')
    })
    expect(sendEvent('approval.decided', ok, { enabled: true, dnt: false, send })).toBe(false)
  })
})
