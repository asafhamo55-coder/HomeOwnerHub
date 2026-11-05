import { describe, expect, it } from 'vitest'
import { getMailProvider, mailingAvailable, readMailPricing } from './config'

const PRICING = JSON.stringify({ baseCents: 100, colorCents: 20, extraPageCents: 10, certifiedCents: 700, certifiedReturnReceiptCents: 1000 })

describe('mailingAvailable', () => {
  it('is false with no keys and no pricing (the production state today)', () => {
    expect(mailingAvailable({ NODE_ENV: 'production' })).toBe(false)
  })
  it('is false with pricing but no provider wired in production', () => {
    expect(mailingAvailable({ NODE_ENV: 'production', MAIL_PRICING_JSON: PRICING, MAIL_PROVIDER: 'fake' })).toBe(false)
    expect(getMailProvider(readMailPricing({ MAIL_PRICING_JSON: PRICING }), { NODE_ENV: 'production', MAIL_PROVIDER: 'lob' })).toBeNull()
  })
  it('is false with a provider but no pricing', () => {
    expect(mailingAvailable({ NODE_ENV: 'development', MAIL_PROVIDER: 'fake' })).toBe(false)
  })
  it('is false when MAIL_PRICING_JSON is malformed', () => {
    expect(mailingAvailable({ NODE_ENV: 'development', MAIL_PROVIDER: 'fake', MAIL_PRICING_JSON: '{bad' })).toBe(false)
  })
  it('is true only with pricing and a wired provider (fake, outside production)', () => {
    expect(mailingAvailable({ NODE_ENV: 'development', MAIL_PROVIDER: 'fake', MAIL_PRICING_JSON: PRICING })).toBe(true)
  })
})
