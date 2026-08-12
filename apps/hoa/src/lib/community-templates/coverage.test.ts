import { describe, it, expect } from 'vitest'
import { COMMUNITY_TEMPLATES } from './registry'
import type { TemplateShape } from './types'
import { PICTOGRAMS } from '@/lib/email/pictogram-manifest'

describe('community template library coverage', () => {
  it('has exactly seven templates with unique slugs', () => {
    expect(COMMUNITY_TEMPLATES.length).toBe(7)
    const slugs = COMMUNITY_TEMPLATES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('covers all four template shapes', () => {
    const shapes = new Set(COMMUNITY_TEMPLATES.map((t) => t.shape))
    const expected: TemplateShape[] = ['reminder', 'invitation', 'submission_request', 'notice']
    for (const shape of expected) {
      expect(shapes.has(shape), `missing shape: ${shape}`).toBe(true)
    }
  })

  it('every template is broadcast audience', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(t.audience, `${t.slug} audience`).toBe('broadcast')
    }
  })

  it('no template uses a chart visual — cut from phase 1', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(t.visual.kind, `${t.slug} visual.kind`).not.toBe('chart')
    }
  })

  it('every image-kind template asset matches a PICTOGRAMS entry for its slug', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      if (t.visual.kind === 'illustration' || t.visual.kind === 'map' || t.visual.kind === 'photo') {
        const entry = PICTOGRAMS.find((p) => p.slug === t.slug)
        expect(entry, `${t.slug} has no PICTOGRAMS entry`).toBeDefined()
        expect(t.visual.asset, `${t.slug} asset`).toBe(`${entry!.slug}.png`)
      }
    }
  })

  it('every template accentColor matches the manifest accent for its slug', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      const entry = PICTOGRAMS.find((p) => p.slug === t.slug)
      expect(entry, `${t.slug} has no PICTOGRAMS entry`).toBeDefined()
      expect(t.accentColor, `${t.slug} accentColor`).toBe(entry!.accent)
    }
  })

  it('every template has a non-empty legalNote', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(t.legalNote, `${t.slug} legalNote`).toBeTruthy()
      expect(t.legalNote!.trim().length, `${t.slug} legalNote length`).toBeGreaterThan(0)
    }
  })

  it('providedFields and question ids are disjoint for every template', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      const provided = new Set(t.providedFields ?? [])
      const questionIds = new Set(t.questions.map((q) => q.id))
      const overlap = [...provided].filter((f) => questionIds.has(f))
      expect(overlap, `${t.slug} providedFields/questions overlap`).toEqual([])
    }
  })
})
