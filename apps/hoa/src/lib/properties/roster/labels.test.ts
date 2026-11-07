import { describe, expect, it } from 'vitest'
import { FONT_STEPS, LABELS_PER_SHEET, addressee, buildLabels, fitFont, isPaperOnly, labelFor, paginate, type PaperRule } from './labels'
import { OWNER_NAME_MISSING, type OwnerRosterRow } from '../statutory-roster/model'

type Owner = OwnerRosterRow['owners'][number]
const owner = (name: string, email: string | null): Owner => ({ name, email, phone: null, share: '100%', since: null, sharingOptOut: null })

function row(over: Partial<OwnerRosterRow> = {}): OwnerRosterRow {
  return {
    propertyId: 'p1',
    address: '105 springwood parkway, atlanta, georgia 30067',
    unitNumber: null,
    lotNumber: null,
    state: 'GA',
    owners: [owner('Pat Lee', null)],
    ownerSource: 'ownership_history',
    sharesWarning: null,
    mailing: { text: '105 springwood parkway, atlanta, georgia 30067', source: 'property_address' },
    ...over,
  }
}

describe('label address choice', () => {
  it('uses the mailing address on file, formatted', () => {
    const l = labelFor(row({ mailing: { text: 'PO BOX 412, OCALA FL 34470', source: 'on_file' } }))
    expect(l?.lines).toEqual(['Pat Lee', 'PO Box 412', 'Ocala, FL 34470'])
  })

  it('falls back to the property address with its unit', () => {
    const l = labelFor(row({ address: '1234 Peachtree Street Northeast, Atlanta, GA 30309', unitNumber: '5' }))
    expect(l?.lines).toEqual(['Pat Lee', '1234 Peachtree St NE, #5', 'Atlanta, GA 30309'])
  })

  it('names every owner and falls back to Current Resident', () => {
    expect(addressee([owner('Pat Lee', null), owner('Sam Lee', null)])).toBe('Pat Lee & Sam Lee')
    expect(addressee([owner(OWNER_NAME_MISSING, null)])).toBe('Current Resident')
    expect(addressee([])).toBe('Current Resident')
  })

  it('skips a home with no street', () => {
    expect(labelFor(row({ address: '', mailing: { text: '', source: 'property_address' } }))).toBeNull()
  })
})

describe('paper-notice filter', () => {
  const rows = [
    row({ propertyId: 'a' }),
    row({ propertyId: 'b', owners: [owner('B', 'b@example.test')] }),
    row({ propertyId: 'c', owners: [] }),
    row({ propertyId: 'd', owners: [owner('One', null), owner('Two', 'two@example.test')] }),
  ]

  it('keeps only homes with an owner where every owner has no email', () => {
    expect(rows.map((r) => isPaperOnly(r))).toEqual([true, false, false, false])
    expect(buildLabels(rows, { onlyPaper: true }).labels.map((l) => l.propertyId)).toEqual(['a'])
  })

  it('treats a whitespace-only email as no email', () => {
    expect(isPaperOnly(row({ owners: [owner('Pat', '   ')] }))).toBe(true)
  })

  const ca: PaperRule = { consentApplies: (st) => st === 'CA', granted: new Set(['u-yes']) }
  const caOwner = (name: string, email: string | null, userId: string | null) => ({ ...owner(name, email), userId })

  it('in a consent state, an owner without consent is paper', () => {
    const r = row({ state: 'CA', owners: [caOwner('Pat', 'p@example.test', 'u-no')] })
    expect(isPaperOnly(r)).toBe(false)
    expect(isPaperOnly(r, ca)).toBe(true)
  })

  it('in a consent state, an owner with consent is not paper', () => {
    expect(isPaperOnly(row({ state: 'CA', owners: [caOwner('Pat', 'p@example.test', 'u-yes')] }), ca)).toBe(false)
  })

  it('in a consent state, an owner with no portal account is paper', () => {
    expect(isPaperOnly(row({ state: 'CA', owners: [caOwner('Pat', 'p@example.test', null)] }), ca)).toBe(true)
  })

  it('co-owners: one consented and one did not keeps the home off the list only if every owner is reachable', () => {
    const both = row({ state: 'CA', owners: [caOwner('A', 'a@example.test', 'u-yes'), caOwner('B', 'b@example.test', 'u-no')] })
    expect(isPaperOnly(both, ca)).toBe(false)
    const none = row({ state: 'CA', owners: [caOwner('A', 'a@example.test', 'u-no'), caOwner('B', null, 'u-yes')] })
    expect(isPaperOnly(none, ca)).toBe(true)
  })

  it('outside a consent state only a missing email makes paper', () => {
    expect(isPaperOnly(row({ state: 'GA', owners: [caOwner('Pat', 'p@example.test', null)] }), ca)).toBe(false)
  })

  it('judges a mixed-state org home by home', () => {
    const rows = [
      row({ propertyId: 'ca', state: 'CA', owners: [caOwner('A', 'a@example.test', 'u-no')] }),
      row({ propertyId: 'ga', state: 'GA', owners: [caOwner('B', 'b@example.test', 'u-no')] }),
    ]
    expect(buildLabels(rows, { onlyPaper: true, rule: ca }).labels.map((l) => l.propertyId)).toEqual(['ca'])
  })

  it('without the filter prints every home that has a street', () => {
    expect(buildLabels(rows).labels.map((l) => l.propertyId)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('dedupe', () => {
  it('merges identical labels from several lots, keeping first-seen order', () => {
    const mail = { text: 'PO Box 9, Tampa FL 33601', source: 'on_file' as const }
    const rows = [
      row({ propertyId: 'a', mailing: mail }),
      row({ propertyId: 'b', address: '9 Other Rd, Atlanta, GA 30301' }),
      row({ propertyId: 'c', mailing: { text: 'po box  9, TAMPA FL 33601', source: 'on_file' } }),
    ]
    const set = buildLabels(rows)
    expect(set.labels.map((l) => l.propertyId)).toEqual(['a', 'b'])
    expect(set.duplicates).toBe(1)
  })

  it('does not merge different owners at one address', () => {
    const rows = [row({ propertyId: 'a' }), row({ propertyId: 'b', owners: [owner('Sam Lee', null)] })]
    expect(buildLabels(rows).duplicates).toBe(0)
  })
})

describe('fit', () => {
  it('uses 10pt for ordinary labels', () => {
    expect(fitFont(['Pat Lee', '105 Springwood Pkwy', 'Atlanta, GA 30067'])).toEqual({ fontPt: 10, shortened: false })
  })

  it('steps down to 9pt then 8pt as lines get longer', () => {
    const [s10, s9, s8] = FONT_STEPS
    expect(fitFont(['x'.repeat(s10.chars * 2 + 1), 's', 'c']).fontPt).toBe(9)
    expect(fitFont(['n', 'x'.repeat(s10.chars + 1), 'c']).fontPt).toBe(9)
    expect(fitFont(['n', 'x'.repeat(s9.chars + 1), 'c']).fontPt).toBe(8)
    expect(fitFont(['n', 'x'.repeat(s8.chars), 'c'])).toEqual({ fontPt: 8, shortened: false })
  })

  it('lets a name use two lines before stepping down', () => {
    expect(fitFont(['x'.repeat(FONT_STEPS[0].chars * 2), 's', 'c']).fontPt).toBe(10)
  })

  it('flags a 60-character name that fits no step on two lines', () => {
    // 60 fits two lines at 8pt (66), so it is small but not cut.
    expect(fitFont(['A'.repeat(60), 's', 'c'])).toEqual({ fontPt: 8, shortened: false })
    expect(fitFont(['A'.repeat(80), 's', 'c'])).toEqual({ fontPt: 8, shortened: true })
    expect(fitFont(['n', 's', 'C'.repeat(FONT_STEPS[2].chars + 1)])).toEqual({ fontPt: 8, shortened: true })
  })

  it('reports a long street as shortened and keeps the city line', () => {
    const l = labelFor(row({ address: `${'1234 Extraordinarily Long Boulevard Name '.repeat(2).trim()}, Atlanta, GA 30309` }))
    expect(l?.shortened).toBe(true)
    expect(l?.fontPt).toBe(8)
    expect(l?.lines[l.lines.length - 1]).toBe('Atlanta, GA 30309')
  })

  it('counts shortened labels for the page notice', () => {
    const long = row({ propertyId: 'x', owners: [owner('B'.repeat(90), null)] })
    const set = buildLabels([row(), long])
    expect(set.shortened).toBe(1)
  })
})

describe('pagination', () => {
  it('splits into sheets of 30 with a short last sheet', () => {
    const items = Array.from({ length: 65 }, (_, i) => i)
    const sheets = paginate(items)
    expect(LABELS_PER_SHEET).toBe(30)
    expect(sheets.map((s) => s.length)).toEqual([30, 30, 5])
    expect(sheets.flat()).toEqual(items)
  })

  it('handles empty, exact and single-label lists', () => {
    expect(paginate([])).toEqual([])
    expect(paginate(Array.from({ length: 30 }, (_, i) => i)).length).toBe(1)
    expect(paginate(Array.from({ length: 31 }, (_, i) => i)).length).toBe(2)
    expect(paginate([1]).length).toBe(1)
  })
})
