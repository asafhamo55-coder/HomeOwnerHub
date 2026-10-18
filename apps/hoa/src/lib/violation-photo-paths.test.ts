import { describe, expect, it } from 'vitest'
import { MAX_DRAFT_PHOTOS, isOrgPhotoPath, orgPhotoPaths } from './violation-photo-paths'

const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const key = (org: string, n = 1, ext = 'jpg') => `${org}/1760000000000-1111111${n}-1111-4111-8111-111111111111.${ext}`

describe('isOrgPhotoPath', () => {
  it('accepts a key the upload route made for this org', () => {
    expect(isOrgPhotoPath(ORG, key(ORG))).toBe(true)
    for (const ext of ['png', 'webp', 'heic']) expect(isOrgPhotoPath(ORG, key(ORG, 1, ext))).toBe(true)
  })

  it('refuses another org’s key, traversal, other extensions and non-strings', () => {
    expect(isOrgPhotoPath(ORG, key(OTHER))).toBe(false)
    expect(isOrgPhotoPath(ORG, `${ORG}/../${key(OTHER)}`)).toBe(false)
    expect(isOrgPhotoPath(ORG, key(ORG, 1, 'svg'))).toBe(false)
    expect(isOrgPhotoPath(ORG, `${ORG}/x.jpg`)).toBe(false)
    expect(isOrgPhotoPath(ORG, null)).toBe(false)
    expect(isOrgPhotoPath(ORG, 42)).toBe(false)
  })
})

describe('orgPhotoPaths', () => {
  it('keeps only this org’s keys, deduplicated, capped', () => {
    expect(orgPhotoPaths(ORG, [key(ORG, 1), key(OTHER, 2), key(ORG, 1), 'junk', key(ORG, 3)])).toEqual([key(ORG, 1), key(ORG, 3)])
    const many = Array.from({ length: 15 }, (_, i) => `${ORG}/1760000000000-${String(i).padStart(8, '0')}-1111-4111-8111-111111111111.jpg`)
    expect(orgPhotoPaths(ORG, many)).toHaveLength(MAX_DRAFT_PHOTOS)
  })

  it('is empty for anything but an array', () => {
    expect(orgPhotoPaths(ORG, undefined)).toEqual([])
    expect(orgPhotoPaths(ORG, key(ORG))).toEqual([])
  })
})
