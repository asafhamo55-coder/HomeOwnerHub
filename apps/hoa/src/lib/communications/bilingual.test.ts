import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SMS_ENGLISH_ONLY_NOTE,
  bodyForLanguage,
  composeBilingualHtml,
  composeBilingualSms,
  htmlToPlainText,
  isBilingual,
  recipientLanguagePreference,
  splitBilingualHtml,
} from './bilingual'
import { buildEmailPayloads } from './email-payloads'
import { SMS_MAX_CHARS } from './sms-body'

const EN = '<p>Hi {{ recipient_name }},</p><p>The pool opens Saturday.</p>'
const ES = '<p>Hola {{ recipient_name }}:</p><p>La piscina abre el sábado.</p>'
const link = 'https://www.homeownerledger.com/communications/00000000-0000-0000-0000-000000000000'

describe('composeBilingualHtml / splitBilingualHtml', () => {
  const html = composeBilingualHtml({ englishHtml: EN, spanishSubject: 'Piscina & horario', spanishHtml: ES })

  it('puts English first, then a headed Español section', () => {
    expect(html.indexOf('The pool opens')).toBeLessThan(html.indexOf('Español'))
    expect(html.indexOf('Español')).toBeLessThan(html.indexOf('La piscina'))
    expect(html).toContain('<section lang="es">')
    expect(html).toContain('<h2>Español</h2>')
    expect(html).toContain('Piscina &amp; horario')
  })

  it('round-trips', () => {
    const parts = splitBilingualHtml(html)
    expect(parts.englishHtml).toBe(EN)
    expect(parts.spanish).toEqual({ subject: 'Piscina & horario', html: ES })
    expect(isBilingual(html)).toBe(true)
  })

  it('a plain body has no Spanish part', () => {
    expect(splitBilingualHtml(EN)).toEqual({ englishHtml: EN, spanish: null })
    expect(isBilingual(EN)).toBe(false)
  })
})

describe('language seam (M-P1)', () => {
  const html = composeBilingualHtml({ englishHtml: EN, spanishSubject: 'Piscina', spanishHtml: ES })

  it('no preference exists yet, so everyone gets both languages unchanged', () => {
    expect(recipientLanguagePreference({ id: 'r1' })).toBeNull()
    expect(bodyForLanguage(html, null)).toBe(html)
  })

  it('en drops the Spanish; es leads with it and keeps the English', () => {
    expect(bodyForLanguage(html, 'en')).toBe(EN)
    const es = bodyForLanguage(html, 'es')
    expect(es.indexOf('La piscina')).toBeLessThan(es.indexOf('The pool'))
  })

  it('leaves a non-bilingual body alone for any preference', () => {
    expect(bodyForLanguage(EN, 'es')).toBe(EN)
  })

  it('email payloads carry both languages today', () => {
    const { payloads } = buildEmailPayloads({
      recipients: [{ id: 'r1', email: 'a@example.com', recipient_name: 'Ana', unit_id: null }],
      subject: 'Pool',
      bodyHtml: html,
      associationName: 'Test HOA',
    })
    expect(payloads[0].html).toContain('The pool opens')
    expect(payloads[0].html).toContain('Español')
    expect(payloads[0].html).toContain('Hola Ana')
  })
})

describe('composeBilingualSms', () => {
  it('sends both languages when they fit', () => {
    const r = composeBilingualSms({
      subject: 'Pool',
      englishText: 'Opens Saturday.',
      spanish: { subject: 'Piscina', text: 'Abre el sábado.' },
      portalLink: link,
    })
    expect(r).toEqual({ body: 'Pool: Opens Saturday. / Piscina: Abre el sábado.', spanishIncluded: true })
  })

  it('falls back to English only, never past the limit, when both do not fit', () => {
    const r = composeBilingualSms({
      subject: 'Annual meeting',
      englishText: 'e'.repeat(150),
      spanish: { subject: 'Reunión anual', text: 's'.repeat(150) },
      portalLink: link,
    })
    expect(r.spanishIncluded).toBe(false)
    expect(r.body.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(r.body).not.toContain('s'.repeat(20))
    expect(r.body).toContain('Annual meeting')
  })

  it('a long English body still ends in the portal link', () => {
    const r = composeBilingualSms({
      subject: 'Annual meeting',
      englishText: 'x'.repeat(600),
      spanish: { subject: 'Reunión', text: 'y' },
      portalLink: link,
    })
    expect(r.body.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(r.body.endsWith(link)).toBe(true)
  })

  it('without Spanish behaves like the English composer', () => {
    expect(
      composeBilingualSms({ subject: 'Pool', englishText: 'Opens.', spanish: null, portalLink: link }),
    ).toEqual({ body: 'Pool: Opens.', spanishIncluded: false })
  })

  it('the note says English only', () => {
    expect(SMS_ENGLISH_ONLY_NOTE).toMatch(/English only/)
    expect(SMS_ENGLISH_ONLY_NOTE).toContain(String(SMS_MAX_CHARS))
  })
})

describe('htmlToPlainText', () => {
  it('drops tags and markers and decodes entities', () => {
    expect(htmlToPlainText('<!-- x --><p>A &amp; B</p><p>C</p>')).toBe('A & B\nC')
  })
})

describe('wiring', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  it('send.ts stores the Spanish in the body and uses the bilingual SMS composer', () => {
    const send = readFileSync(path.join(here, 'send.ts'), 'utf8')
    expect(send).toMatch(/composeBilingualHtml\(/)
    expect(send).toMatch(/Review the Spanish version before sending/)
    // Delivery lives in deliver.ts, shared by send-now and the scheduled
    // dispatcher; every send still goes through the outbound guard.
    const deliver = readFileSync(path.join(here, 'deliver.ts'), 'utf8')
    // The SMS text is built in sms-render.ts, shared with the phone preview.
    expect(deliver).toMatch(/renderSmsText\(/)
    expect(readFileSync(path.join(here, 'sms-render.ts'), 'utf8')).toMatch(/composeBilingualSms\(/)
    expect(deliver).toMatch(/sendSms\(\{ to: phone, body: smsBody \}, outbound\)/)
    expect(deliver).toMatch(/sendEmailBatch\(payloads, outbound\)/)
    expect(send).toMatch(/deliverToRecipients\(/)
  })

  it('the wizard offers "Add Spanish version" and shows the English-only note', () => {
    const dir = path.join(here, '../../app/(dashboard)/communications/new')
    const wizard = readFileSync(path.join(dir, 'NewCommunicationWizard.tsx'), 'utf8')
    const spanish = readFileSync(path.join(dir, 'SpanishVersion.tsx'), 'utf8')
    expect(wizard).toContain('<SpanishVersion')
    expect(wizard).toContain('SMS_ENGLISH_ONLY_NOTE')
    expect(wizard).toMatch(/reviewed: spanish\.viewed/)
    expect(spanish).toContain('Add Spanish version')
    expect(spanish).toContain('/api/ai/translate-communication')
    expect(spanish).toContain("I've read the Spanish version")
  })
})
