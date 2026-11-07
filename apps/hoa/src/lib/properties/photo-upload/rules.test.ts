import { describe, expect, it } from 'vitest'
import {
  canChangePhoto,
  choosePhotoSource,
  isOwnPhotoPath,
  photoUploadEnabled,
  resolvePhotoType,
  uploadedPhotoPath,
} from './rules'

const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '33333333-3333-4333-8333-333333333333'
const HOME = '11111111-1111-4111-8111-111111111111'
const NEXT_DOOR = '44444444-4444-4444-8444-444444444444'

describe('who may change a photo', () => {
  it('lets board and admin change any home', () => {
    for (const role of ['board', 'admin'] as const) {
      expect(canChangePhoto({ role, propertyId: HOME, residentPropertyIds: [] })).toBe(true)
      expect(canChangePhoto({ role, propertyId: NEXT_DOOR, residentPropertyIds: [HOME] })).toBe(true)
    }
  })
  it('lets an owner or resident change only their own home', () => {
    expect(canChangePhoto({ role: 'resident', propertyId: HOME, residentPropertyIds: [HOME] })).toBe(true)
    expect(canChangePhoto({ role: 'resident', propertyId: NEXT_DOOR, residentPropertyIds: [HOME] })).toBe(false)
    expect(canChangePhoto({ role: 'resident', propertyId: HOME, residentPropertyIds: [] })).toBe(false)
  })
})

describe('the stored path', () => {
  it('is built from ids and is always front.jpg', () => {
    expect(uploadedPhotoPath(ORG, HOME)).toBe(`${ORG}/${HOME}/front.jpg`)
  })
  it('is trusted only for this org and this home', () => {
    expect(isOwnPhotoPath(`${ORG}/${HOME}/front.jpg`, ORG, HOME)).toBe(true)
    expect(isOwnPhotoPath(`${OTHER_ORG}/${HOME}/front.jpg`, ORG, HOME)).toBe(false)
    expect(isOwnPhotoPath(`${ORG}/${NEXT_DOOR}/front.jpg`, ORG, HOME)).toBe(false)
    expect(isOwnPhotoPath(`${ORG}/${HOME}/../x.jpg`, ORG, HOME)).toBe(false)
    expect(isOwnPhotoPath(null, ORG, HOME)).toBe(false)
  })
})

describe('uploaded wins over Street View', () => {
  it('uses the upload when one is stored and the flag is on', () => {
    expect(choosePhotoSource({ photoPath: `${ORG}/${HOME}/front.jpg`, flagOn: true })).toBe('upload')
  })
  it('falls back to Street View after a remove (no path)', () => {
    expect(choosePhotoSource({ photoPath: null, flagOn: true })).toBe('street_view')
  })
  it('ignores a stored path while the flag is off', () => {
    expect(choosePhotoSource({ photoPath: `${ORG}/${HOME}/front.jpg`, flagOn: false })).toBe('street_view')
  })
})

describe('the flag', () => {
  it('ships off', () => {
    expect(photoUploadEnabled()).toBe(false)
    expect(photoUploadEnabled(true)).toBe(true)
  })
})

describe('file type by name or type', () => {
  it('accepts jpeg, png and webp only', () => {
    expect(resolvePhotoType({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image/jpeg')
    expect(resolvePhotoType({ type: 'image/png', name: 'a.png' })).toBe('image/png')
    expect(resolvePhotoType({ type: 'image/webp', name: 'a.webp' })).toBe('image/webp')
    expect(resolvePhotoType({ type: 'image/gif', name: 'a.gif' })).toBeNull()
    expect(resolvePhotoType({ type: 'image/svg+xml', name: 'a.svg' })).toBeNull()
    expect(resolvePhotoType({ type: 'application/pdf', name: 'a.jpg' })).toBeNull()
    expect(resolvePhotoType({ type: 'constructor', name: 'a' })).toBeNull()
  })
  it('falls back to the extension for octet-stream', () => {
    expect(resolvePhotoType({ type: 'application/octet-stream', name: 'house.JPEG' })).toBe('image/jpeg')
    expect(resolvePhotoType({ type: '', name: 'house' })).toBeNull()
  })
})
