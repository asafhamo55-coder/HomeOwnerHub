import { describe, expect, it } from 'vitest'
import { LABELS_PER_SHEET, addressee, buildLabels, isPaperOnly, labelFor, paginate } from './labels'
import type { OwnerRosterRow } from '../statutory-roster/model'

function row(over: Partial<OwnerRosterRow> & { email?: string | null; names?: string[] } = {}): OwnerRosterRow {
  const { email = null, names = ['Pat Lee'], ...rest } = over
  return {
    propertyId: 'p1',
    address: '105 springwood parkway, atlanta, georgia 30067',
    unitNumber: null,
    lotNumber: null,
    state: 'GA',
    owners: names.map((name) => ({ name, email, phone: null, share: '100%', since: null, sharingOptOut: null })),
    ownerSource: 'ownership_history',
    sharesWarning: null,
    mailing: { text: '105 springwood parkway, atlanta, georgia 30067', source: 'property_address' },
    ...rest,
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
    expect(addressee(row({ names: ['Pat Lee', 'Sam Lee'] }).owners)).toBe('Pat Lee & Sam Lee')
    expect(addressee(row({ names: ['Name not recorded'] }).owners)).toBe('Current Resident')
    expect(addressee([])).toBe('Current Resident')
  })

  it('skips a home with no street', () => {
    expect(labelFor(row({ address: '', mailing: { text: '', source: 'property_address' } }))).toBeNull()
  })
})

describe('email-less filter', () => {
  const rows = [
    row({ propertyId: 'a', email: null }),
    row({ propertyId: 'b', email: 'b@example.test' }),
    row({ propertyId: 'c', owners: [] }),
    row({ propertyId: 'd', names: ['One', 'Two'], owners: [
      { name: 'One', email: null, phone: null, share: '50%', since: null, sharingOptOut: null },
      { name: 'Two', email: 'two@example.test', phone: null, share: '50%', since: null, sharingOptOut: null },
    ] }),
  ]

  it('keeps only homes with an owner and no owner email', () => {
    expect(rows.map(isPaperOnly)).toEqual([true, false, false, false])
    expect(buildLabels(rows, { onlyWithoutEmail: true }).map((l) => l.propertyId)).toEqual(['a'])
  })

  it('without the filter prints every home that has a street', () => {
    expect(buildLabels(rows).map((l) => l.propertyId)).toEqual(['a', 'b', 'c', 'd'])
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
