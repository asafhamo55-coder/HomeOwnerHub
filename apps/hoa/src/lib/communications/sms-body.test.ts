import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SMS_CHANNEL_HINT, SMS_MAX_CHARS, SMS_STOP_LINE, composeSmsBody, withStopLine } from './sms-body'

// BL-072: the wizard's SMS hint said texts are "split" at 279 characters;
// the server shortens them and links to the full message. The hint now
// describes composeSmsBody, the one function the send path uses.

const link = 'https://app.example.test/communications/c1'

describe('composeSmsBody', () => {
  it('a short message goes as is, with no link', () => {
    expect(composeSmsBody({ subject: 'Pool', body: 'Opens Saturday.', portalLink: link })).toBe('Pool: Opens Saturday. Reply STOP to opt out.')
  })

  it('a long body is shortened to the limit and ends with the portal link', () => {
    const sms = composeSmsBody({ subject: 'Annual meeting', body: 'x'.repeat(600), portalLink: link })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(`… see ${link}${SMS_STOP_LINE}`)).toBe(true)
  })

  it('a short body under a long subject is never cut off without the link', () => {
    const sms = composeSmsBody({ subject: 's'.repeat(150), body: 'b'.repeat(150), portalLink: link })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(`… see ${link}${SMS_STOP_LINE}`)).toBe(true)
  })

  it('a real-length portal link (https + uuid) arrives whole', () => {
    const real = 'https://www.homeownerledger.com/communications/3f2b8c1e-0000-4000-8000-000000000000'
    const sms = composeSmsBody({ subject: 'Annual meeting', body: 'x'.repeat(600), portalLink: real })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(`${real}${SMS_STOP_LINE}`)).toBe(true)
  })

  it('a normal message gets the opt-out line exactly once', () => {
    const sms = composeSmsBody({ subject: 'Pool', body: 'Opens Saturday.', portalLink: link })
    expect(sms.endsWith(' Reply STOP to opt out.')).toBe(true)
    expect(sms.split('Reply STOP').length).toBe(2)
  })

  it('a long message keeps the STOP line intact and the total within 279', () => {
    const sms = composeSmsBody({ subject: 'Annual meeting', body: 'x'.repeat(900), portalLink: link })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(SMS_STOP_LINE)).toBe(true)
    expect(sms).toContain(link)
  })

  it('the limit is still 279', () => {
    expect(SMS_MAX_CHARS).toBe(279)
  })
})

describe('SMS hint says what the server does', () => {
  it('names the limit and the link, and never "split"', () => {
    expect(SMS_CHANNEL_HINT).toContain('279 characters')
    expect(SMS_CHANNEL_HINT).toMatch(/shortened/i)
    expect(SMS_CHANNEL_HINT).toMatch(/link to the full message in the portal/i)
    expect(SMS_CHANNEL_HINT).not.toMatch(/split/i)
  })

  it('the wizard shows the shared hint and the send path uses composeSmsBody', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const wizard = readFileSync(path.join(here, '../../app/(dashboard)/communications/new/NewCommunicationWizard.tsx'), 'utf8')
    expect(wizard).toMatch(/hint: SMS_CHANNEL_HINT/)
    expect(wizard).not.toMatch(/split at 279/i)
    // The delivery (send-now and scheduled) lives in deliver.ts.
    // Its SMS text comes from sms-render.ts, shared with the phone preview.
    const deliver = readFileSync(path.join(here, 'deliver.ts'), 'utf8')
    expect(deliver).toMatch(/renderSmsText\(/)
    expect(readFileSync(path.join(here, 'sms-render.ts'), 'utf8')).toMatch(/composeSmsBody\(/)
  })
})

describe('withStopLine', () => {
  it('appends the line to a plain body', () => {
    expect(withStopLine('Water off Thursday')).toBe('Water off Thursday Reply STOP to opt out.')
  })
  it('is idempotent and never doubles an existing line or STOP wording', () => {
    const once = withStopLine('Water off Thursday')
    expect(withStopLine(once)).toBe(once)
    expect(withStopLine('Hi. Text STOP... Reply STOP to unsubscribe.')).toBe('Hi. Text STOP... Reply STOP to unsubscribe.')
  })
  it('shortens content, never the STOP line, at exactly 279', () => {
    for (const n of [250, 256, 257, 279, 280, 1000]) {
      const out = withStopLine('a'.repeat(n))
      expect(out.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
      expect(out.endsWith(SMS_STOP_LINE)).toBe(true)
    }
    expect(withStopLine('a'.repeat(256))).toBe(`${'a'.repeat(256)}${SMS_STOP_LINE}`)
  })
})
