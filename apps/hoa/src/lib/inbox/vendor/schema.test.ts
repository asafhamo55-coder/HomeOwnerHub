import { describe, it, expect } from 'vitest'
import { QuickCreateVendorSchema, isVendorIncomplete } from './schema'

describe('QuickCreateVendorSchema', () => {
  it('accepts a name and email alone — an email cannot supply an EIN', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing email — it is the dedupe and auto-match key', () => {
    const result = QuickCreateVendorSchema.safeParse({ legalName: 'ABC Landscaping' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed email', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a whitespace-only name', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: '   ',
      primaryEmail: 'jose@abclandscaping.com',
    })
    expect(result.success).toBe(false)
  })

  it('normalizes the email to lowercase so dedupe is case-insensitive', () => {
    const result = QuickCreateVendorSchema.parse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'Jose@ABCLandscaping.com',
    })
    expect(result.primaryEmail).toBe('jose@abclandscaping.com')
  })

  it('accepts an EIN the reviewer confirmed, normalised to nine digits', () => {
    // v1 stripped this key outright, because the only source then was model
    // inference from prose. It now arrives from a W-9 the reviewer read and
    // confirmed in the form, so it is human-attested input like any other
    // field on this schema.
    const result = QuickCreateVendorSchema.parse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
      ein: '12-3456789',
    })
    expect(result.ein).toBe('123456789')
  })

  it('rejects an EIN that is not nine digits', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
      ein: '123',
    })
    expect(result.success).toBe(false)
  })

  it('still accepts no EIN at all — that is the common case', () => {
    const result = QuickCreateVendorSchema.parse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
    })
    expect(result.ein ?? null).toBeNull()
  })
})

describe('isVendorIncomplete', () => {
  it('is incomplete without an EIN', () => {
    expect(isVendorIncomplete({ ein: null, trades: ['landscaping'] })).toBe(true)
  })

  it('is incomplete without trades', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: null })).toBe(true)
  })

  it('is incomplete with an empty trades array', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: [] })).toBe(true)
  })

  it('is complete with both', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: ['landscaping'] })).toBe(false)
  })
})
