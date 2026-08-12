import { describe, it, expect } from 'vitest'
import { validateTemplate, COMMUNITY_TEMPLATES, getTemplate } from './registry'
import type { CommunityTemplate } from './types'

function tpl(over: Partial<CommunityTemplate> = {}): CommunityTemplate {
  return {
    slug: 'x-topic',
    name: 'X — Topic',
    description: 'd',
    genre: 'conduct',
    shape: 'reminder',
    audience: 'broadcast',
    accentColor: '#1C6772',
    visual: { kind: 'illustration', asset: 'x.png', alt: 'A real description of the scene' },
    subject: 'Hello {{association_name}}',
    preview: 'p',
    body: [{ type: 'paragraph', text: 'Hi {{recipient_name}}, see {{affected_areas}}.' }],
    questions: [
      { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A'], required: true },
    ],
    ...over,
  }
}

describe('validateTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(() => validateTemplate(tpl())).not.toThrow()
  })

  it('rejects a merge field with no question and no ambient source', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Deadline is {{deadline_date}}.' }],
    }))).toThrow(/deadline_date/)
  })

  it('accepts ambient fields the send pipeline always provides', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Hi {{recipient_name}} of {{association_name}}.' }],
      questions: [],
    }))).not.toThrow()
  })

  it('rejects a question that the body never uses', () => {
    expect(() => validateTemplate(tpl({
      questions: [
        { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A'], required: true },
        { id: 'unused_field', label: 'Unused', type: 'text', required: true },
      ],
    }))).toThrow(/unused_field/)
  })

  it('rejects a non-snake_case question id', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'See {{affectedAreas}}.' }],
      questions: [{ id: 'affectedAreas', label: 'Where?', type: 'text', required: true }],
    }))).toThrow(/snake_case/i)
  })

  it('rejects an accent outside the safe luminance window', () => {
    expect(() => validateTemplate(tpl({ accentColor: '#A8E6C4' }))).toThrow(/luminance/i)
  })

  it('rejects a select question with no options', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Tone {{tone}}.' }],
      questions: [{ id: 'tone', label: 'Tone', type: 'select', required: true }],
    }))).toThrow(/options/i)
  })

  it('rejects more than five questions — the composer must stay under a minute', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `f_${i}`, label: `L${i}`, type: 'text' as const, required: true,
    }))
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: six.map((q) => `{{${q.id}}}`).join(' ') }],
      questions: six,
    }))).toThrow(/five/i)
  })

  it('rejects deadline_date on a single-property template', () => {
    expect(() => validateTemplate(tpl({
      audience: 'single_property',
      body: [{ type: 'paragraph', text: 'By {{deadline_date}}.' }],
      questions: [{ id: 'deadline_date', label: 'By when?', type: 'date', required: true }],
    }))).toThrow(/cure_window/)
  })
})

describe('COMMUNITY_TEMPLATES', () => {
  it('has unique slugs', () => {
    const slugs = COMMUNITY_TEMPLATES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every registered template validates', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(() => validateTemplate(t), `invalid: ${t.slug}`).not.toThrow()
    }
  })

  it('getTemplate finds by slug and returns undefined otherwise', () => {
    expect(getTemplate('definitely-not-a-slug')).toBeUndefined()
  })
})
