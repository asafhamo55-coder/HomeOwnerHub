import { describe, expect, it } from 'vitest'
import { htmlToMessageText, plainTextToHtml } from '../communications/plain-text'
import { htmlToPlainText } from '../communications/bilingual'
import { composeSmsBody } from '../communications/sms-body'
import {
  announcementImageContentType,
  dropUnresolvedMarkers,
  markersToImgHtml,
  stripImageMarkers,
  toIdMarkers,
} from './inline-images'

const ID = '3f2a9c1e-1111-4222-8333-444455556666.png'
const ORG = '11111111-2222-4333-8444-555555555555'
const opts = { origin: 'https://app.example.org/', orgId: ORG }

describe('announcement inline images', () => {
  it('turns a friendly marker into an id marker only when the map knows it', () => {
    const text = 'Hi\n[image: pasted-1.png]\n[image: other.png]'
    expect(toIdMarkers(text, { 'pasted-1.png': ID })).toBe(`Hi\n[image: ${ID}]\n[image: other.png]`)
  })

  it('ignores a map entry that is not a real id', () => {
    expect(toIdMarkers('[image: a.png]', { 'a.png': '../../etc/passwd' })).toBe('[image: a.png]')
  })

  it('renders an id marker as an img on this app, after escaping', () => {
    const html = markersToImgHtml(plainTextToHtml(`Look:\n[image: ${ID}]\nThanks`), opts)
    expect(html).toContain(`<img src="https://app.example.org/api/announcement-image/${ORG}/${ID}"`)
    expect(html).toContain('max-width:100%;height:auto')
    expect(html).not.toContain('[image:')
  })

  it('never lets a hand-typed marker become markup', () => {
    const evil = '[image: "><script>alert(1)</script>.png]\n[image: x" onerror="y.png]'
    const html = markersToImgHtml(plainTextToHtml(dropUnresolvedMarkers(evil + '\nok text here')), opts)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('drops unresolved markers but keeps id markers', () => {
    expect(dropUnresolvedMarkers(`a\n[image: pasted.png]\nb\n[image: ${ID}]`)).toBe(`a\n\nb\n[image: ${ID}]`)
  })

  it('strips every marker for the translator', () => {
    expect(stripImageMarkers('Hello\n\n[image: a.png]\n\nBye')).toBe('Hello\n\nBye')
  })

  it('leaves no trace of an image in the text part or the SMS', () => {
    const html = markersToImgHtml(plainTextToHtml(`Pool opens Saturday.\n\n[image: ${ID}]\n\nSee you there.`), opts)
    const text = htmlToMessageText(html)
    expect(text).toBe('Pool opens Saturday.\n\nSee you there.')
    expect(htmlToPlainText(html)).not.toContain('announcement-image')
    const sms = composeSmsBody({ subject: 'Pool', body: text, portalLink: 'https://app.example.org/p/1' })
    expect(sms).not.toContain('image')
    expect(sms).not.toContain('api/')
    expect(sms.length).toBeLessThanOrEqual(279)
  })

  it('serves only the four image types', () => {
    expect(announcementImageContentType(ID)).toBe('image/png')
    expect(announcementImageContentType(ID.replace('png', 'jpg'))).toBe('image/jpeg')
    expect(announcementImageContentType(ID.replace('png', 'svg'))).toBeNull()
    expect(announcementImageContentType('x.png')).toBeNull()
  })
})
