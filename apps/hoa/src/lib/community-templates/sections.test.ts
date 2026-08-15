import { beforeAll, describe, expect, it } from 'vitest'
import { getTemplate } from './registry'
import {
  describeSections,
  hasContent,
  placeholdersUsed,
  questionsFor,
  withoutSections,
} from './sections'
import { renderCommunityEmailHtml, renderCommunityEmailText } from './render'

const dog = getTemplate('dog-leash-and-waste')!

// renderCommunityEmailHtml resolves the illustration through emailAssetUrl,
// which throws when unset rather than defaulting — same as render.test.ts
// and delivery.test.ts.
beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://www.homeownerledger.com'
})

describe('describeSections', () => {
  it('lists every body block in order with a stable index', () => {
    const s = describeSections(dog)
    expect(s.length).toBe(dog.body.length)
    expect(s.map((x) => x.index)).toEqual(dog.body.map((_, i) => i))
  })

  it('gives each section a human label and a distinguishing preview', () => {
    for (const s of describeSections(dog)) {
      expect(s.label).not.toBe(s.kind)
      expect(s.preview.length).toBeGreaterThan(0)
    }
  })

  it('previews the illustration with its alt text, not a filename', () => {
    const visual = describeSections(dog).find((s) => s.kind === 'visual')!
    // The dog template carries an illustration, so alt is the preview.
    expect(dog.visual.kind).toBe('illustration')
    if (dog.visual.kind === 'illustration') {
      expect(visual.preview).toBe(dog.visual.alt)
    }
    expect(visual.preview).not.toMatch(/\.png/)
  })

  it('describes a meter visual without pretending it has alt text', () => {
    // lease-cap-status is the meter case; its figures come from live data
    // at send time, so there is nothing to quote as a description.
    const leaseCap = getTemplate('lease-cap-status')!
    for (const s of describeSections(leaseCap)) {
      expect(s.preview.length).toBeGreaterThan(0)
    }
  })

  it('keeps merge placeholders visible so paragraphs can be told apart', () => {
    const withField = describeSections(dog).some((s) => s.preview.includes('{{'))
    expect(withField).toBe(true)
  })
})

describe('withoutSections', () => {
  it('removes exactly the excluded indices', () => {
    const out = withoutSections(dog, [0])
    expect(out.body.length).toBe(dog.body.length - 1)
    expect(out.body[0]).toEqual(dog.body[1])
  })

  it('does not mutate the shared registry template', () => {
    // The registry freezes its array but the template objects are shared
    // across requests; mutating one would leak one board member's choices
    // into everyone else's send.
    const before = dog.body.length
    withoutSections(dog, [0, 1, 2])
    expect(dog.body.length).toBe(before)
  })

  it('ignores out-of-range and duplicate indices', () => {
    expect(withoutSections(dog, [99]).body.length).toBe(dog.body.length)
    expect(withoutSections(dog, [0, 0]).body.length).toBe(dog.body.length - 1)
  })
})

describe('hasContent', () => {
  it('is true while anything survives', () => {
    expect(hasContent(dog, [0])).toBe(true)
  })

  it('is false when everything is excluded', () => {
    expect(hasContent(dog, dog.body.map((_, i) => i))).toBe(false)
  })
})

describe('questionsFor', () => {
  it('asks everything when nothing is excluded', () => {
    expect(questionsFor(dog, []).map((q) => q.id)).toEqual(dog.questions.map((q) => q.id))
  })

  it('stops asking for a field whose only section was removed', () => {
    // The callout is the only block mentioning {{station_locations}}.
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    expect(calloutIdx).toBeGreaterThanOrEqual(0)

    const ids = questionsFor(dog, [calloutIdx]).map((q) => q.id)
    expect(ids).not.toContain('station_locations')
    // The other questions live in paragraphs that are still present.
    expect(ids).toContain('issue_type')
  })

  it('keeps a question whose field also appears in a surviving section', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    const ids = questionsFor(dog, [calloutIdx]).map((q) => q.id)
    expect(ids).toContain('affected_areas')
  })
})

describe('placeholdersUsed', () => {
  it('finds fields in paragraphs and callouts', () => {
    const used = placeholdersUsed(dog)
    expect(used.has('issue_type')).toBe(true)
    expect(used.has('station_locations')).toBe(true)
  })

  it('includes ambient fields, which the caller filters separately', () => {
    expect(placeholdersUsed(dog).has('recipient_name')).toBe(true)
  })
})

describe('rendering a filtered template', () => {
  it('drops the excluded copy from the HTML', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    const full = renderCommunityEmailHtml(dog)
    const trimmed = renderCommunityEmailHtml(withoutSections(dog, [calloutIdx]))

    // "restock" appears only in the callout. Do NOT assert on "bag
    // stations": that phrase is also in the template's `preview`, which
    // renders as the hidden preheader and is not a body section — an
    // earlier version of this test failed for exactly that reason and the
    // assertion was wrong, not the filtering.
    expect(full).toContain('restock')
    expect(trimmed).not.toContain('restock')
    expect(trimmed.length).toBeLessThan(full.length)
  })

  it('leaves the preheader alone — it is not a body section', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    const trimmed = renderCommunityEmailHtml(withoutSections(dog, [calloutIdx]))
    expect(trimmed).toContain(dog.preview)
  })

  it('drops it from the plain-text part too', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    const trimmed = renderCommunityEmailText(withoutSections(dog, [calloutIdx]))
    expect(trimmed).not.toContain('restock')
  })

  it('still renders a valid document with the illustration removed', () => {
    const visualIdx = dog.body.findIndex((b) => b.type === 'visual')
    const html = renderCommunityEmailHtml(withoutSections(dog, [visualIdx]))
    expect(html).not.toContain('.png')
    expect(html).toContain('<table')
  })

  it('leaves no orphaned placeholder for a dropped question', () => {
    // The point of questionsFor: if the composer stops asking, nothing may
    // be left in the body expecting that answer.
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    const html = renderCommunityEmailHtml(withoutSections(dog, [calloutIdx]))
    expect(html).not.toContain('{{station_locations}}')
  })
})
