import { describe, it, expect, afterEach } from 'vitest'
import { emailAssetUrl } from './asset-url'

const ORIGINAL = process.env.EMAIL_ASSET_BASE_URL
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_ASSET_BASE_URL
  else process.env.EMAIL_ASSET_BASE_URL = ORIGINAL
})

describe('emailAssetUrl', () => {
  it('joins the base and the versioned path', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
    expect(emailAssetUrl('pet-waste.png')).toBe(
      'https://app.homeownerhub.com/email/v1/pet-waste.png',
    )
  })

  it('tolerates a trailing slash on the base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com/'
    expect(emailAssetUrl('pet-waste.png')).toBe(
      'https://app.homeownerhub.com/email/v1/pet-waste.png',
    )
  })

  it('throws when the var is unset rather than falling back', () => {
    delete process.env.EMAIL_ASSET_BASE_URL
    expect(() => emailAssetUrl('x.png')).toThrow(/EMAIL_ASSET_BASE_URL/)
  })

  it('refuses a localhost base — that would ship broken images forever', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'http://localhost:3000'
    expect(() => emailAssetUrl('x.png')).toThrow(/localhost/i)
  })

  it('refuses a Vercel preview base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://hoa-git-branch-team.vercel.app'
    expect(() => emailAssetUrl('x.png')).toThrow(/preview/i)
  })

  it('refuses a non-https base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'http://app.homeownerhub.com'
    expect(() => emailAssetUrl('x.png')).toThrow(/https/i)
  })
})
