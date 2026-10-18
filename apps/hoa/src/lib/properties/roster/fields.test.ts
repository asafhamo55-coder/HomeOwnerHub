import { describe, expect, it } from 'vitest'
import { autoMap, detectPreset, normalizeHeader, ROSTER_FIELDS, TEMPLATE_HEADERS, templateCsv } from './fields'

// The CINC preset follows the column names of a CINC Systems homeowner
// export as we know them; no customer file is used here (synthetic only).
const CINC = [
  'Account #',
  'Homeowner Name',
  'Property Address',
  'Unit',
  'Property City',
  'Property State',
  'Property Zip',
  'Mailing Address 1',
  'Mailing City',
  'Mailing State',
  'Mailing Zip',
  'Email Address',
  'Home Phone',
  'Cell Phone',
  'Rental',
  'Current Balance',
]

const col = (headers: string[], name: string) => headers.indexOf(name)

describe('normalizeHeader', () => {
  it('lowercases and drops everything but letters and digits', () => {
    expect(normalizeHeader('  Property Address #1 ')).toBe('propertyaddress1')
    expect(normalizeHeader('E-mail')).toBe('email')
  })
})

describe('detectPreset', () => {
  it('recognises a CINC Systems export', () => {
    expect(detectPreset(CINC)).toBe('cinc')
  })
  it('recognises our own template', () => {
    expect(detectPreset([...TEMPLATE_HEADERS])).toBe('template')
  })
  it('anything else is generic', () => {
    expect(detectPreset(['Address', 'Owner', 'Email'])).toBe('generic')
  })
})

describe('autoMap', () => {
  it('maps every CINC column to its field', () => {
    const { mapping, preset } = autoMap(CINC)
    expect(preset).toBe('cinc')
    expect(mapping).toEqual({
      address: col(CINC, 'Property Address'),
      unit: col(CINC, 'Unit'),
      city: col(CINC, 'Property City'),
      state: col(CINC, 'Property State'),
      zip: col(CINC, 'Property Zip'),
      owner_name: col(CINC, 'Homeowner Name'),
      owner_email: col(CINC, 'Email Address'),
      // CINC exports both; the cell phone is the one that reaches people.
      owner_phone: col(CINC, 'Cell Phone'),
      mailing_address: col(CINC, 'Mailing Address 1'),
      mailing_city: col(CINC, 'Mailing City'),
      mailing_state: col(CINC, 'Mailing State'),
      mailing_zip: col(CINC, 'Mailing Zip'),
      tenure: col(CINC, 'Rental'),
      balance: col(CINC, 'Current Balance'),
    })
  })

  it('maps the template exactly', () => {
    const { mapping } = autoMap([...TEMPLATE_HEADERS])
    for (const [i, h] of TEMPLATE_HEADERS.entries()) {
      const field = ROSTER_FIELDS.find((f) => f.label === h)
      expect(field, h).toBeDefined()
      expect(mapping[field!.key]).toBe(i)
    }
  })

  it('maps common spreadsheet headings and never uses one column twice', () => {
    const headers = ['Street Address', 'Lot #', 'Town', 'ST', 'Postal Code', 'First Name', 'Last Name', 'E-mail', 'Mobile', 'Occupancy', 'Notes']
    const { mapping } = autoMap(headers)
    expect(mapping).toMatchObject({
      address: 0,
      unit: 1,
      city: 2,
      state: 3,
      zip: 4,
      owner_first_name: 5,
      owner_last_name: 6,
      owner_email: 7,
      owner_phone: 8,
      tenure: 9,
    })
    const used = Object.values(mapping)
    expect(new Set(used).size).toBe(used.length)
  })

  it('a mailing address is never taken for the property address', () => {
    const { mapping } = autoMap(['Mailing Address', 'Address'])
    expect(mapping.address).toBe(1)
    expect(mapping.mailing_address).toBe(0)
  })

  it('leaves unknown columns unmapped', () => {
    expect(autoMap(['Favourite colour']).mapping).toEqual({})
  })

  it('an explicit preset wins over detection', () => {
    expect(autoMap(['Homeowner', 'Address'], 'generic').preset).toBe('generic')
  })
})

describe('templateCsv', () => {
  it('is built by lib/csv (BOM, CRLF) with the template headers and a synthetic example', () => {
    const csv = templateCsv()
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.split('\r\n')[0]).toBe('﻿' + TEMPLATE_HEADERS.join(','))
    expect(csv).toContain('example.test')
  })
})
