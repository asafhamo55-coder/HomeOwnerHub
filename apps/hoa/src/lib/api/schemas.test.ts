import { describe, expect, it } from 'vitest'
import { zCents, zDateOnly, zIsoDateTime, zText, zUuid } from './schemas'
import { MAX_LONG_TEXT, MAX_SHORT_TEXT, MAX_UPLOAD_BYTES, MAX_JSON_BYTES, MAX_ARRAY_ITEMS } from './limits'

describe('shared limits', () => {
  it('has one upload limit for every route', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_JSON_BYTES).toBe(1024 * 1024)
    expect(MAX_SHORT_TEXT).toBeLessThan(MAX_LONG_TEXT)
    expect(MAX_ARRAY_ITEMS).toBeGreaterThan(0)
  })
})

describe('shared zod fields', () => {
  it('zDateOnly accepts real calendar dates only', () => {
    expect(zDateOnly.safeParse('2026-02-28').success).toBe(true)
    expect(zDateOnly.safeParse('2028-02-29').success).toBe(true)
    expect(zDateOnly.safeParse('2026-02-29').success).toBe(false)
    expect(zDateOnly.safeParse('2026-13-01').success).toBe(false)
    expect(zDateOnly.safeParse('2026-1-01').success).toBe(false)
    expect(zDateOnly.safeParse('tomorrow').success).toBe(false)
    expect(zDateOnly.safeParse('2026-01-01T00:00:00Z').success).toBe(false)
  })

  it('zIsoDateTime requires an ISO 8601 timestamp with an offset', () => {
    expect(zIsoDateTime.safeParse('2026-10-16T12:00:00Z').success).toBe(true)
    expect(zIsoDateTime.safeParse('2026-10-16T12:00:00+02:00').success).toBe(true)
    expect(zIsoDateTime.safeParse('2026-10-16').success).toBe(false)
  })

  it('zCents is a non-negative integer', () => {
    expect(zCents.safeParse(1999).success).toBe(true)
    expect(zCents.safeParse(19.99).success).toBe(false)
    expect(zCents.safeParse(-1).success).toBe(false)
  })

  it('zText always has an upper bound and trims', () => {
    expect(zText().safeParse('x'.repeat(MAX_SHORT_TEXT)).success).toBe(true)
    expect(zText().safeParse('x'.repeat(MAX_SHORT_TEXT + 1)).success).toBe(false)
    expect(zText(5).parse('  ab  ')).toBe('ab')
  })

  it('zUuid validates uuids', () => {
    expect(zUuid.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true)
    expect(zUuid.safeParse('../../etc').success).toBe(false)
  })
})
