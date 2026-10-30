import { describe, expect, it } from 'vitest'
import { buildEmailPreviewHtml, sendButtonLabel } from './review-helpers'
import { smsTextCount } from '../new/PhonePreview'
import { composeSmsBody, SMS_MAX_CHARS } from '@/lib/communications/sms-body'

const ID = '123e4567-e89b-42d3-a456-426614174000.png'

describe('announce review helpers', () => {
  it('the Send label carries the count', () => {
    expect(sendButtonLabel('now', 142)).toBe('Send to 142 homes')
    expect(sendButtonLabel('now', 1)).toBe('Send to 1 home')
    expect(sendButtonLabel('later', 142)).toBe('Schedule it')
  })

  it('a 300-character message goes out as one text of at most 279', () => {
    const body = composeSmsBody({ subject: 'Pool', body: 'x'.repeat(300), portalLink: 'https://example.test/p/1' })
    expect(body.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(body.endsWith('https://example.test/p/1')).toBe(true)
    expect(smsTextCount(body)).toBe(1)
  })

  it('the email preview escapes HTML', () => {
    const html = buildEmailPreviewHtml('<script>alert(1)</script> <img src=x onerror=y>', {}, null, 'https://app.test')
    expect(html).not.toMatch(/<script|<img/)
    expect(html).toContain('&lt;script&gt;')
  })

  it('an image marker renders as an image in the preview', () => {
    const html = buildEmailPreviewHtml('Look\n\n[image: pool.png]', { 'pool.png': ID }, 'org-1', 'https://app.test/')
    expect(html).toMatch(/<img src="https:\/\/app\.test\/[^"]*org-1[^"]*"/)
    expect(html).not.toContain('[image:')
  })
})
