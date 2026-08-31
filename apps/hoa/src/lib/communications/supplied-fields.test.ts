import { describe, it, expect } from 'vitest'
import { normalizeSuppliedFields } from './supplied-fields'
import { unresolvedFields } from './merge-recovery'
import { renderTemplateStrict } from './templates'

const AMBIENT = {
  association_name: 'Madison Park',
  recipient_name: 'Resident',
  owner_name: 'Resident',
  unit_id: '',
}

describe('normalizeSuppliedFields', () => {
  it('trims the answers it keeps', () => {
    expect(normalizeSuppliedFields({ deadline_date: '  Friday, September 11 ' })).toEqual({
      deadline_date: 'Friday, September 11',
    })
  })

  it('drops empty and whitespace-only answers', () => {
    expect(
      normalizeSuppliedFields({ deadline_date: 'Friday', season_context: '', upkeep_items: '   ' }),
    ).toEqual({ deadline_date: 'Friday' })
  })

  it('ignores keys no placeholder could name', () => {
    expect(
      normalizeSuppliedFields({ 'not a field': 'x', 'a-b': 'y', deadline_date: 'Friday' }),
    ).toEqual({ deadline_date: 'Friday' })
  })

  it('tolerates a missing bag', () => {
    expect(normalizeSuppliedFields(undefined)).toEqual({})
    expect(normalizeSuppliedFields(null)).toEqual({})
  })

  it('drops a non-string value rather than stringifying it', () => {
    // The argument crosses the server-action boundary from the browser, so
    // its declared type is a promise, not a guarantee.
    const hostile = { deadline_date: 42 } as unknown as Record<string, string>
    expect(normalizeSuppliedFields(hostile)).toEqual({})
  })
})

describe('normalized answers agree with the strict render', () => {
  // The bug this guards: unresolvedFields asks whether a KEY is present,
  // renderTemplateStrict asks whether its VALUE is non-empty. A blank
  // answer that survived normalization would satisfy the first and throw in
  // the second — a send that passed preflight and then failed all 37 rows.
  const SUBJECT = 'Yard upkeep in {{association_name}} before {{deadline_date}}'

  it('leaves a blank answer unresolved instead of letting it reach the render', () => {
    const bag = { ...AMBIENT, ...normalizeSuppliedFields({ deadline_date: '  ' }) }
    expect(unresolvedFields({ subject: SUBJECT, bodyHtml: '', known: bag })).toEqual([
      'deadline_date',
    ])
    expect(() => renderTemplateStrict(SUBJECT, bag)).toThrow(/deadline_date/)
  })

  it('reports nothing unresolved exactly when the render succeeds', () => {
    const bag = { ...AMBIENT, ...normalizeSuppliedFields({ deadline_date: 'Friday, September 11' }) }
    expect(unresolvedFields({ subject: SUBJECT, bodyHtml: '', known: bag })).toEqual([])
    expect(renderTemplateStrict(SUBJECT, bag)).toBe(
      'Yard upkeep in Madison Park before Friday, September 11',
    )
  })
})
