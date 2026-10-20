import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SMS_CHANNEL_HINT, SMS_MAX_CHARS, composeSmsBody } from './sms-body'

// BL-072: the wizard's SMS hint said texts are "split" at 279 characters;
// the server shortens them and links to the full message. The hint now
// describes composeSmsBody, the one function the send path uses.

const link = 'https://app.example.test/communications/c1'

describe('composeSmsBody', () => {
  it('a short message goes as is, with no link', () => {
    expect(composeSmsBody({ subject: 'Pool', body: 'Opens Saturday.', portalLink: link })).toBe('Pool: Opens Saturday.')
  })

  it('a long body is shortened to the limit and ends with the portal link', () => {
    const sms = composeSmsBody({ subject: 'Annual meeting', body: 'x'.repeat(600), portalLink: link })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(`… see ${link}`)).toBe(true)
  })

  it('a short body under a long subject is never cut off without the link', () => {
    const sms = composeSmsBody({ subject: 's'.repeat(150), body: 'b'.repeat(150), portalLink: link })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(`… see ${link}`)).toBe(true)
  })

  it('a real-length portal link (https + uuid) arrives whole', () => {
    const real = 'https://www.homeownerledger.com/communications/3f2b8c1e-0000-4000-8000-000000000000'
    const sms = composeSmsBody({ subject: 'Annual meeting', body: 'x'.repeat(600), portalLink: real })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(sms.endsWith(real)).toBe(true)
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
    const deliver = readFileSync(path.join(here, 'deliver.ts'), 'utf8')
    expect(deliver).toMatch(/composeSmsBody\(/)
  })
})
