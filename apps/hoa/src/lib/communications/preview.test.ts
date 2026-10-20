import { describe, expect, it } from 'vitest'
import { blankMarker, buildPreview } from './preview'
import { buildEmailPayloads } from './email-payloads'
import { composeBilingualHtml, htmlToPlainText } from './bilingual'
import { renderSmsText } from './sms-render'
import { SMS_MAX_CHARS } from './sms-body'
import { htmlToMessageText } from './plain-text'

// BL-102 A7: the phone preview renders through the send's own functions.
// Synthetic data only.

const LINK = 'https://www.homeownerledger.com/communications/00000000-0000-0000-0000-000000000000'
const RECIPIENT = { email: 'sample@example.com', recipient_name: 'Sam Sample', unit_id: 'u1' }

describe('buildPreview', () => {
  const bodyHtml = '<p>Hi {{ recipient_name }},</p>\n<p>The pool closes {{ close_date }}.</p>\n<p>{{ association_name }} Board</p>'

  it('the email is byte-identical to the payload the send hands to sendEmailBatch', () => {
    const p = buildPreview(RECIPIENT, {
      subject: 'Pool closing {{ close_date }}',
      bodyHtml,
      extraFields: { close_date: 'Sept 30' },
      associationName: 'Lakeside HOA',
      portalLink: LINK,
    })
    const { payloads } = buildEmailPayloads({
      recipients: [{ ...RECIPIENT, id: 'x' }],
      subject: 'Pool closing {{ close_date }}',
      bodyHtml,
      associationName: 'Lakeside HOA',
      extraFields: { close_date: 'Sept 30' },
    })
    expect(p.email).toEqual({ subject: payloads[0].subject, html: payloads[0].html })
    expect(p.email.html).toContain('Hi Sam Sample,')
    expect(p.blanks).toEqual([])
  })

  it('a blank answer shows as a visible marker and is listed, instead of failing', () => {
    const p = buildPreview(RECIPIENT, {
      subject: 'Pool closing {{ close_date }}',
      bodyHtml,
      associationName: 'Lakeside HOA',
      portalLink: LINK,
    })
    expect(p.blanks).toEqual(['close date'])
    expect(p.email.subject).toBe(`Pool closing ${blankMarker('close_date')}`)
    expect(p.email.html).toContain('[Close date]')
  })

  it('the text is the send’s text, within the limit', () => {
    const bodyText = htmlToMessageText(bodyHtml)
    const p = buildPreview(RECIPIENT, {
      subject: 'Pool closing',
      bodyHtml,
      bodyText,
      extraFields: { close_date: 'Sept 30' },
      associationName: 'Lakeside HOA',
      portalLink: LINK,
    })
    expect(p.sms.max).toBe(SMS_MAX_CHARS)
    expect(p.sms.chars).toBeLessThanOrEqual(SMS_MAX_CHARS)
    const expected = renderSmsText({
      subject: 'Pool closing',
      html: p.email.html,
      text: bodyText.replace('{{ recipient_name }}', 'Sam Sample').replace('{{ close_date }}', 'Sept 30').replace('{{ association_name }}', 'Lakeside HOA'),
      portalLink: LINK,
    })
    expect(p.sms.body).toBe(expected.body)
  })

  it('a long message is shortened and ends with the portal link', () => {
    const long = `<p>${'Water main repair details. '.repeat(30)}</p>`
    const p = buildPreview(RECIPIENT, {
      subject: 'Water off',
      bodyHtml: long,
      bodyText: htmlToMessageText(long),
      associationName: 'Lakeside HOA',
      portalLink: LINK,
    })
    expect(p.sms.shortened).toBe(true)
    expect(p.sms.body.endsWith(LINK)).toBe(true)
    expect(p.sms.chars).toBeLessThanOrEqual(SMS_MAX_CHARS)
  })

  it('splits out the Spanish section for its own tab', () => {
    const html = composeBilingualHtml({
      englishHtml: '<p>Pool closed.</p>',
      spanishSubject: 'Piscina cerrada',
      spanishHtml: '<p>La piscina está cerrada.</p>',
    })
    const p = buildPreview(RECIPIENT, {
      subject: 'Pool closed',
      bodyHtml: html,
      bodyText: htmlToPlainText(html),
      associationName: 'Lakeside HOA',
      portalLink: LINK,
    })
    expect(p.spanish).toEqual({ subject: 'Piscina cerrada', html: '<p>La piscina está cerrada.</p>' })
    expect(p.email.html).toContain('Español')
  })
})
