import { describe, expect, it } from 'vitest'
import { CHECKED_ON, COMPETITORS, FEATURE_LABELS, OURS, OUR_GAPS, OUR_PRICE, type FeatureKey } from './competitors'

const KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[]

describe('competitors data', () => {
  it('has the expected set and unique ids', () => {
    expect(new Set(COMPETITORS.map((c) => c.id)).size).toBe(COMPETITORS.length)
    expect(COMPETITORS.length).toBeGreaterThanOrEqual(10)
  })

  it('every competitor has a source URL and a check date', () => {
    for (const c of COMPETITORS) {
      expect(c.sources.length, c.id).toBeGreaterThan(0)
      for (const s of c.sources) {
        expect(s.url, c.id).toMatch(/^https:\/\//)
        expect(s.checkedOn, c.id).toBe(CHECKED_ON)
      }
    }
  })

  it('every cell points at one of the competitor sources', () => {
    for (const c of COMPETITORS) {
      const urls = new Set(c.sources.map((s) => s.url))
      for (const k of KEYS) {
        expect(c.features[k], `${c.id}.${k}`).toBeDefined()
        expect(urls.has(c.features[k].source), `${c.id}.${k} source`).toBe(true)
      }
    }
  })

  it('a "no" is never used without a note saying where it was shown', () => {
    for (const c of COMPETITORS) {
      for (const k of KEYS) {
        const cell = c.features[k]
        if (cell.state === 'no') expect(cell.note?.trim().length, `${c.id}.${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('unpublished prices say to ask, and published ones carry a number', () => {
    for (const c of COMPETITORS) {
      if (c.priceIsPublished) expect(c.startingPrice, c.id).toMatch(/\$|Free/)
      else expect(c.startingPrice, c.id).toBe('Ask them for a price')
    }
  })

  it('management-company tools are labeled as such', () => {
    for (const id of ['vantaca', 'cinc', 'appfolio', 'frontsteps', 'buildium']) {
      expect(COMPETITORS.find((c) => c.id === id)?.audience, id).toBe('management-companies')
    }
  })

  it('has no em dashes, no logos or ratings in the copy', () => {
    const text = JSON.stringify({ COMPETITORS, OURS, OUR_GAPS })
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/stars?\b|rating|testimonial/i)
  })

  it('our column does not claim online payments, and states the gaps', () => {
    expect(OURS.payments.state).toBe('soon')
    const gaps = OUR_GAPS.join(' ')
    expect(gaps).toMatch(/not live/i)
    expect(gaps).toMatch(/two-factor/i)
    expect(gaps).toMatch(/online voting/i)
  })

  it('our price matches the one-plan decision', () => {
    expect(OUR_PRICE.tiers.map((t) => t.monthlyUsd)).toEqual([59, 109, 169, 249])
    expect(OUR_PRICE.overFourHundredPerHomeUsd).toBe(0.65)
    expect(OUR_PRICE.yearlyFreeMonths).toBe(2)
    expect(OUR_PRICE.trialDays).toBe(30)
  })
})
