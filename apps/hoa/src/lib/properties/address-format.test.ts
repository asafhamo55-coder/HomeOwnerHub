import { describe, expect, it } from 'vitest'
import {
  formatAddress,
  formatAddressFields,
  formatAddressLine,
  formatAddressLines,
  formatState,
  formatStreet,
  formatStreetOnly,
  formatUnit,
  formatZip,
} from './address-format'

describe('formatStreet', () => {
  it.each([
    ['1234 Peachtree Street Northeast', '1234 Peachtree St NE'],
    ['1234 PEACHTREE STREET NORTHEAST', '1234 Peachtree St NE'],
    ['1234 peachtree street ne', '1234 Peachtree St NE'],
    ['105 Springwood Parkway', '105 Springwood Pkwy'],
    ['9 Oak Avenue', '9 Oak Ave'],
    ['9 Oak Av.', '9 Oak Ave'],
    ['22 Rose Road', '22 Rose Rd'],
    ['22 Rose Drive', '22 Rose Dr'],
    ['22 Rose Lane', '22 Rose Ln'],
    ['22 Rose Court', '22 Rose Ct'],
    ['22 Rose Circle', '22 Rose Cir'],
    ['22 Rose Boulevard', '22 Rose Blvd'],
    ['22 Rose Place', '22 Rose Pl'],
    ['22 Rose Terrace', '22 Rose Ter'],
    ['22 Rose Trail', '22 Rose Trl'],
    ['22 Rose Way', '22 Rose Way'],
    ['22 Rose Highway', '22 Rose Hwy'],
    ['12 Court Street', '12 Court St'],
    ['123 North Main Street', '123 N Main St'],
    ['123 North Avenue', '123 North Ave'],
    ['123 East Ave', '123 East Ave'],
    ['123 E Main St', '123 E Main St'],
    ['77 Main Street Southwest', '77 Main St SW'],
    ['77 Main St S.W.', '77 Main St SW'],
    ['500 MLK Jr Drive', '500 MLK Jr Dr'],
    ['14 McDonald Street', '14 McDonald St'],
    ['14 DeKalb Industrial Way', '14 DeKalb Industrial Way'],
    ["14 o'neil lane", "14 O'Neil Ln"],
    ['5 1st Street', '5 1st St'],
    ['5 22ND STREET', '5 22nd St'],
    ['12a Elm Street', '12A Elm St'],
    ['  12   Elm    Street  ', '12 Elm St'],
    ['PO BOX 12', 'PO Box 12'],
    ['P.O. Box 12', 'PO Box 12'],
    ['Street', 'Street'],
    ['12 Street', '12 Street'],
    ['', ''],
  ])('%s -> %s', (input, out) => {
    expect(formatStreet(input)).toBe(out)
  })

  it('moves an inline unit to its own part', () => {
    expect(formatStreet('1234 Peachtree Street NE Apartment 5')).toBe('1234 Peachtree St NE, Apt 5')
    expect(formatStreet('12 Elm St Suite 200')).toBe('12 Elm St, Ste 200')
    expect(formatStreet('12 Elm St #4b')).toBe('12 Elm St, #4B')
    expect(formatStreet('12 Elm St # 4')).toBe('12 Elm St, #4')
    expect(formatStreet('12 Elm St Unit 7')).toBe('12 Elm St, Unit 7')
  })

  it('handles null and undefined', () => {
    expect(formatStreet(null)).toBe('')
    expect(formatStreet(undefined)).toBe('')
  })
})

describe('review fixes', () => {
  it.each([
    ['123 Main St Apt #4', '123 Main St, Apt 4'],
    ['123 Main St Unit #4', '123 Main St, Unit 4'],
    ['123 Main St Apt # 4', '123 Main St, Apt 4'],
    ['123 Main St, Apt #4', '123 Main St, Apt 4'],
    ['123 Main St #4', '123 Main St, #4'],
    ['123 Main St # 4', '123 Main St, #4'],
    ['14 DEKALB INDUSTRIAL WAY', '14 DeKalb Industrial Way'],
    ['14 dekalb way', '14 DeKalb Way'],
    ['14 MCDONALD STREET', '14 McDonald St'],
    ['14 MACARTHUR BLVD', '14 MacArthur Blvd'],
    ['14 MACON ROAD', '14 Macon Rd'],
    ['500 MLK JR DRIVE', '500 MLK Jr Dr'],
    ['12 GA-400 SERVICE ROAD', '12 GA-400 Service Rd'],
    ['12 us-41', '12 US-41'],
    ['9 sr 9', '9 SR 9'],
    ['75 I-75 Frontage Road', '75 I-75 Frontage Rd'],
    ['3 Avenue of the Americas', '3 Avenue of the Americas'],
    ['3 AVENUE OF THE AMERICAS', '3 Avenue of the Americas'],
    ['100 The Lake', '100 The Lake'],
    ['100 THE LAKE', '100 The Lake'],
    ['100 Lake', '100 Lake'],
    ['100 Blue Lake', '100 Blue Lk'],
  ])('%s -> %s', (input, out) => {
    expect(formatAddressLine(input)).toBe(out)
    expect(formatAddressLine(out)).toBe(out)
  })
})

describe('formatUnit', () => {
  it.each([
    ['apartment 5', 'Apt 5'],
    ['APT 5B', 'Apt 5B'],
    ['suite 200', 'Ste 200'],
    ['Unit 7', 'Unit 7'],
    ['unit 7', 'Unit 7'],
    ['# 5', '#5'],
    ['#5', '#5'],
    ['5', '#5'],
    ['12B', '#12B'],
    ['Lot 12', 'Lot 12'],
    ['Rear', 'Rear'],
    ['Back building', 'Back building'],
    ['', ''],
  ])('%s -> %s', (input, out) => {
    expect(formatUnit(input)).toBe(out)
  })
})

describe('formatState and formatZip', () => {
  it('maps names and codes', () => {
    expect(formatState('Georgia')).toBe('GA')
    expect(formatState('georgia')).toBe('GA')
    expect(formatState('ga')).toBe('GA')
    expect(formatState('GA')).toBe('GA')
    expect(formatState('North Carolina')).toBe('NC')
    expect(formatState('District of Columbia')).toBe('DC')
    expect(formatState('Narnia')).toBe('Narnia')
    expect(formatState('')).toBe('')
  })
  it('shapes ZIPs', () => {
    expect(formatZip('30309')).toBe('30309')
    expect(formatZip('30309-1234')).toBe('30309-1234')
    expect(formatZip('303091234')).toBe('30309-1234')
    expect(formatZip('30309 1234')).toBe('30309-1234')
    expect(formatZip('3030')).toBe('3030')
    expect(formatZip('ABC')).toBe('ABC')
  })
})

describe('formatAddressLine', () => {
  it.each([
    ['1234 Peachtree Street Northeast, Apartment 5, Atlanta, Georgia 30309', '1234 Peachtree St NE, Apt 5, Atlanta, GA 30309'],
    ['1234 PEACHTREE STREET NE APT 5, ATLANTA, GA 30309', '1234 Peachtree St NE, Apt 5, Atlanta, GA 30309'],
    ['105 springwood parkway, atlanta, ga 30067', '105 Springwood Pkwy, Atlanta, GA 30067'],
    ['105 Springwood Pkwy, Atlanta GA 30067', '105 Springwood Pkwy, Atlanta, GA 30067'],
    ['105 Springwood Pkwy, Atlanta, GA, 30067', '105 Springwood Pkwy, Atlanta, GA 30067'],
    ['105 Springwood Pkwy, Atlanta, GA 300671234', '105 Springwood Pkwy, Atlanta, GA 30067-1234'],
    // A lone tail with no ZIP is a state only as a typed 2-letter code after street and city.
    ['105 Springwood Pkwy, Atlanta, Georgia', '105 Springwood Pkwy, Atlanta, Georgia'],
    ['105 Springwood Pkwy, Atlanta, GA', '105 Springwood Pkwy, Atlanta, GA'],
    ['105 Springwood Pkwy, Atlanta, ga', '105 Springwood Pkwy, Atlanta, Ga'],
    ['123 Main St, Washington', '123 Main St, Washington'],
    ['123 Main St, In', '123 Main St, In'],
    ['123 Main St, Or', '123 Main St, Or'],
    ['123 Main St, Salem, OR', '123 Main St, Salem, OR'],
    ['105 Springwood Pkwy, Atlanta', '105 Springwood Pkwy, Atlanta'],
    ['105 Springwood Pkwy, Marietta, North Carolina 28101', '105 Springwood Pkwy, Marietta, NC 28101'],
    ['105 Springwood Pkwy', '105 Springwood Pkwy'],
    // One segment is never read as city, state and ZIP.
    ['42 Oak Street IN 46201', '42 Oak Street IN 46201'],
    ['', ''],
  ])('%s', (input, out) => {
    expect(formatAddressLine(input)).toBe(out)
  })

  it('adds a separate unit once', () => {
    expect(formatAddressLine('105 Springwood Pkwy, Atlanta, GA 30067', '5B')).toBe('105 Springwood Pkwy, #5B, Atlanta, GA 30067')
    expect(formatAddressLine('105 Springwood Pkwy', 'Apt 5')).toBe('105 Springwood Pkwy, Apt 5')
    expect(formatAddressLine('105 Springwood Pkwy Apt 5', 'apartment 5')).toBe('105 Springwood Pkwy, Apt 5')
  })

  it('keeps unrecognized parts as typed', () => {
    expect(formatAddressLine('Lot 4 Behind The Mill')).toBe('Lot 4 Behind the Mill')
    expect(formatAddressLine('12 Elm St, Building C, Smalltown')).toBe('12 Elm St, Bldg C, Smalltown')
    expect(formatAddressLine('12 Elm St, Behind The Mill, Smalltown')).toBe('12 Elm St, Behind the Mill, Smalltown')
  })
})

describe('formatAddressLines and parts', () => {
  it('splits into two lines', () => {
    expect(formatAddressLines('1234 Peachtree Street NE, Apartment 5, Atlanta, Georgia 30309')).toEqual([
      '1234 Peachtree St NE, Apt 5',
      'Atlanta, GA 30309',
    ])
    expect(formatAddressLines('105 Springwood Parkway')).toEqual(['105 Springwood Pkwy', ''])
  })
  it('formatStreetOnly returns the street without city or unit', () => {
    expect(formatStreetOnly('105 Springwood Parkway, Atlanta, GA 30067')).toBe('105 Springwood Pkwy')
    expect(formatStreetOnly('105 Springwood Parkway Apt 2')).toBe('105 Springwood Pkwy')
  })
  it('formats separate fields', () => {
    expect(
      formatAddressFields({ line1: '1234 peachtree street northeast', line2: 'apartment 5', city: 'ATLANTA', state: 'georgia', zip: '303091234' }),
    ).toEqual({ line1: '1234 Peachtree St NE', line2: 'Apt 5', city: 'Atlanta', state: 'GA', zip: '30309-1234' })
    expect(formatAddress(null)).toEqual({ line1: '', line2: '', city: '', state: '', zip: '' })
  })
})

describe('idempotence and junk', () => {
  const inputs = [
    '1234 Peachtree Street Northeast, Apartment 5, Atlanta, Georgia 30309',
    '105 SPRINGWOOD PARKWAY, ATLANTA, GA 30067',
    '12 Court Street',
    '123 north main street apt 4',
    'PO BOX 12',
    '5 22ND STREET #3',
    'Lot 4 Behind The Mill',
    '42 Oak Street IN 46201',
    '500 MLK Jr Drive, Atlanta',
    "14 o'neil lane, st. louis, missouri 63101",
    ',,, ,',
    '#',
    '12',
    'NE',
    'Atlanta, GA',
    '30309',
    '1 A St',
    '99 Main Street, Apt',
    '!@# $%^ &*()',
    '12 Elm St, , Atlanta,,GA 30309,',
  ]
  it.each(inputs)('formatAddressLine is idempotent: %s', (input) => {
    const once = formatAddressLine(input)
    expect(formatAddressLine(once)).toBe(once)
  })
  it.each(inputs)('formatStreet is idempotent: %s', (input) => {
    const once = formatStreet(input)
    expect(formatStreet(once)).toBe(once)
  })
  it('never leaves double spaces or edge commas', () => {
    for (const input of inputs) {
      const out = formatAddressLine(input)
      expect(out).not.toMatch(/\s{2,}/)
      expect(out).not.toMatch(/^,|,$|,,/)
    }
  })
  it('leaves junk as typed, trimmed', () => {
    expect(formatAddressLine('  !@# $%^  ')).toBe('!@# $%^')
  })
})
