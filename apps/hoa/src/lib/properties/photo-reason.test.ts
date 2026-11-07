import { describe, expect, it } from 'vitest'
import { PHOTO_REASONS, photoReasonMessage, toPhotoReason } from './photo-reason'

describe('photoReasonMessage', () => {
  it('asks the board for the city and ZIP and links to the setting', () => {
    const m = photoReasonMessage('needs_location', true)
    expect(m.text).toBe("No photo: we need your community's city and ZIP to find this street.")
    expect(m.fix?.href).toBe('/settings/association#community-location')
  })
  it('gives a resident the same reason without a link they cannot use', () => {
    const m = photoReasonMessage('needs_location', false)
    expect(m.fix).toBeUndefined()
    expect(m.text).toContain('the board needs to add')
  })
  it('says each other reason in plain words', () => {
    expect(photoReasonMessage('no_street_view', true).text).toBe('Google has no street picture for this address.')
    expect(photoReasonMessage('no_key', true).text).toBe('Photos are turned off.')
    expect(photoReasonMessage('upstream', true).text).toBe('Google could not be reached. Try again later.')
    expect(photoReasonMessage('no_address', true).text).toContain('no street address')
    expect(photoReasonMessage('unknown', true).text).toBe('No photo is available for this home.')
  })
  it('never uses an em dash and every code has a message', () => {
    for (const r of PHOTO_REASONS) {
      const m = photoReasonMessage(r, true)
      expect(m.text.length).toBeGreaterThan(5)
      expect(m.text).not.toContain('—')
    }
  })
  it('treats an unknown header value as unknown', () => {
    expect(toPhotoReason('needs_location')).toBe('needs_location')
    expect(toPhotoReason('<script>')).toBe('unknown')
    expect(toPhotoReason(null)).toBe('unknown')
  })
})
