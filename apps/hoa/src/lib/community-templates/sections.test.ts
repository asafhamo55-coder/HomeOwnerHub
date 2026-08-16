import { beforeAll, describe, expect, it } from 'vitest'
import { COMMUNITY_TEMPLATES, getTemplate } from './registry'
import {
  describeSections,
  hasContent,
  placeholdersUsed,
  questionsFor,
  sectionsMissingAnswers,
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

describe('sectionsMissingAnswers — blank means "do not send this part"', () => {
  it('drops a section whose question is unanswered', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    // Nothing answered at all.
    expect(sectionsMissingAnswers(dog, [])).toContain(calloutIdx)
  })

  it('keeps it once the answer arrives', () => {
    const calloutIdx = dog.body.findIndex((b) => b.type === 'callout')
    expect(sectionsMissingAnswers(dog, ['station_locations'])).not.toContain(calloutIdx)
  })

  it('never drops a section that only uses ambient fields', () => {
    // "Hi {{recipient_name}}," is supplied per recipient by send.ts, so it
    // must survive with nothing answered.
    const greeting = dog.body.findIndex(
      (b) => b.type === 'paragraph' && b.text.includes('recipient_name'),
    )
    expect(greeting).toBeGreaterThanOrEqual(0)
    expect(sectionsMissingAnswers(dog, [])).not.toContain(greeting)
  })

  it('never drops a section with no placeholders at all', () => {
    const plain = dog.body.findIndex((b) => b.type === 'paragraph' && !b.text.includes('{{'))
    if (plain >= 0) expect(sectionsMissingAnswers(dog, [])).not.toContain(plain)
  })

  it('never drops the illustration, which carries no copy', () => {
    const visualIdx = dog.body.findIndex((b) => b.type === 'visual')
    expect(sectionsMissingAnswers(dog, [])).not.toContain(visualIdx)
  })

  it('treats providedFields as answered', () => {
    // lease-cap-status resolves its occupancy figures server-side in
    // send.ts, so they must never drop a section — nobody can answer them.
    //
    // Asserting "no dropped section mentions a providedField" would be
    // wrong: its blocks mix provided figures with question fields, so a
    // block legitimately drops for the QUESTION while still containing a
    // provided one. The real invariant is that with every question
    // answered, nothing is dropped at all.
    const leaseCap = getTemplate('lease-cap-status')!
    expect((leaseCap.providedFields ?? []).length).toBeGreaterThan(0)

    const allAnswered = leaseCap.questions.map((q) => q.id)
    expect(sectionsMissingAnswers(leaseCap, allAnswered)).toEqual([])
  })

  it('leaves something sendable for every template with nothing answered', () => {
    // The greeting and the closing paragraph carry no question fields in
    // these templates, so an untouched form still has a message.
    for (const t of COMMUNITY_TEMPLATES) {
      const dropped = sectionsMissingAnswers(t, [])
      expect(hasContent(t, dropped), `${t.slug} has nothing left`).toBe(true)
    }
  })
})

describe('required questions are only the ones the subject needs', () => {
  it('every remaining required question appears in its subject', () => {
    // A subject cannot be dropped the way a section can, so a blank there
    // would ship a broken subject line. Everything else is optional.
    for (const t of COMMUNITY_TEMPLATES) {
      const subjectFields = [...t.subject.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1])
      for (const q of t.questions.filter((x) => x.required)) {
        expect(subjectFields, `${t.slug}: "${q.id}" is required but not in the subject`).toContain(
          q.id,
        )
      }
    }
  })
})
