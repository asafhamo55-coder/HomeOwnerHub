import { describe, it, expect } from 'vitest'

import {
  PERSONALIZED_FIELD_LABEL,
  resolveForDisplay,
  resolveHtmlForDisplay,
  pickDisplaySubject,
} from './display'

const ASSOC = 'Madison Park'

describe('resolveForDisplay — association-level fields', () => {
  it('substitutes the real association name for {{association_name}}', () => {
    const r = resolveForDisplay('A friendly reminder about dogs in {{association_name}}', {
      associationName: ASSOC,
    })
    expect(r.text).toBe('A friendly reminder about dogs in Madison Park')
    expect(r.personalizedFields).toEqual([])
  })

  it('treats {{association_name_text}} the same as {{association_name}}', () => {
    const r = resolveForDisplay('{{association_name_text}} dues', { associationName: ASSOC })
    expect(r.text).toBe('Madison Park dues')
  })

  it('tolerates the spaced placeholder form the renderer accepts', () => {
    const r = resolveForDisplay('{{ association_name }} news', { associationName: ASSOC })
    expect(r.text).toBe('Madison Park news')
  })
})

describe('resolveForDisplay — per-recipient fields', () => {
  it('replaces a known per-recipient field with its human label', () => {
    const r = resolveForDisplay('{{association_name_text}} dues — {{amount_summary}}', {
      associationName: ASSOC,
    })
    expect(r.text).toBe('Madison Park dues — amount due')
    expect(r.personalizedFields).toEqual(['amount_summary'])
  })

  it('de-underscores an unknown field rather than leaking braces', () => {
    const r = resolveForDisplay('Your {{late_fee_total}} is due', { associationName: ASSOC })
    expect(r.text).toBe('Your late fee total is due')
    expect(r.personalizedFields).toEqual(['late_fee_total'])
  })

  it('reports each personalized field once even when repeated', () => {
    const r = resolveForDisplay('{{owner_name}}, hello {{owner_name}}', { associationName: ASSOC })
    expect(r.personalizedFields).toEqual(['owner_name'])
  })

  it('leaves text with no placeholders untouched', () => {
    const r = resolveForDisplay('Pool closes Friday', { associationName: ASSOC })
    expect(r.text).toBe('Pool closes Friday')
    expect(r.personalizedFields).toEqual([])
  })
})

describe('resolveHtmlForDisplay', () => {
  it('wraps a personalized field in a chip instead of showing braces', () => {
    const r = resolveHtmlForDisplay('<p>Hi {{owner_name}}</p>', { associationName: ASSOC })
    expect(r.html).toContain('merge-chip')
    expect(r.html).toContain('owner')
    expect(r.html).not.toContain('{{')
  })

  it('substitutes association fields inline with no chip', () => {
    const r = resolveHtmlForDisplay('<p>{{association_name}}</p>', { associationName: ASSOC })
    expect(r.html).toBe('<p>Madison Park</p>')
  })

  it('escapes an association name carrying HTML so the preview cannot inject markup', () => {
    const r = resolveHtmlForDisplay('<p>{{association_name}}</p>', {
      associationName: 'Oak & <b>Vine</b>',
    })
    expect(r.html).toBe('<p>Oak &amp; &lt;b&gt;Vine&lt;/b&gt;</p>')
  })
})

describe('pickDisplaySubject', () => {
  const fallback = { subject: '{{association_name_text}} dues — {{amount_summary}}', associationName: ASSOC }

  it('prefers the stored rendered subject when every recipient got the same one', () => {
    const r = pickDisplaySubject({
      ...fallback,
      renderedSubjects: ['Madison Park dues — $310.00 across 2 properties'],
    })
    expect(r.text).toBe('Madison Park dues — $310.00 across 2 properties')
    expect(r.exact).toBe(true)
    expect(r.personalizedFields).toEqual([])
  })

  it('ignores duplicates of one identical rendered subject', () => {
    const r = pickDisplaySubject({
      subject: 'Pool closes Friday',
      associationName: ASSOC,
      renderedSubjects: ['Pool closes Friday', 'Pool closes Friday'],
    })
    expect(r.text).toBe('Pool closes Friday')
    expect(r.exact).toBe(true)
  })

  it('falls back to labels when recipients received different subjects', () => {
    const r = pickDisplaySubject({
      ...fallback,
      renderedSubjects: ['Madison Park dues — $310.00', 'Madison Park dues — $80.00'],
    })
    expect(r.text).toBe('Madison Park dues — amount due')
    expect(r.exact).toBe(false)
    expect(r.personalizedFields).toEqual(['amount_summary'])
  })

  it('falls back for historical rows that stored no rendered subject', () => {
    const r = pickDisplaySubject({ ...fallback, renderedSubjects: [] })
    expect(r.text).toBe('Madison Park dues — amount due')
    expect(r.exact).toBe(false)
  })

  it('ignores nulls from recipients whose render failed before sending', () => {
    const r = pickDisplaySubject({
      ...fallback,
      renderedSubjects: [null, 'Madison Park dues — $310.00', null],
    })
    expect(r.text).toBe('Madison Park dues — $310.00')
    expect(r.exact).toBe(true)
  })
})

describe('PERSONALIZED_FIELD_LABEL', () => {
  it('covers every field the send pipeline merges per recipient', () => {
    // merge-bag.ts ambient fields plus the dues campaign's own bag.
    for (const f of [
      'owner_name',
      'owner_name_text',
      'recipient_name',
      'unit_id',
      'amount_summary',
      'dues_table',
      'dues_text',
    ]) {
      expect(PERSONALIZED_FIELD_LABEL[f]).toBeTruthy()
    }
  })
})
