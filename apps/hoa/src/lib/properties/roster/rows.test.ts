import { describe, expect, it } from 'vitest'
import { parseBalance, parseTenure, toRosterRows, validateRosterRow } from './rows'

// Synthetic rows only.
const headers = ['Address', 'Unit', 'Zip', 'First', 'Last', 'Email', 'Phone', 'Mail To', 'Mail City', 'Mail State', 'Mail Zip', 'Rental', 'Balance']
const mapping = {
  address: 0,
  unit: 1,
  zip: 2,
  owner_first_name: 3,
  owner_last_name: 4,
  owner_email: 5,
  owner_phone: 6,
  mailing_address: 7,
  mailing_city: 8,
  mailing_state: 9,
  mailing_zip: 10,
  tenure: 11,
  balance: 12,
}

describe('toRosterRows', () => {
  it('builds one roster row per file row, keeping the spreadsheet row number', () => {
    const [row] = toRosterRows(
      headers,
      [{ n: 7, cells: ['  1  Test   Way ', 'Lot 4', '2134', 'Owner', 'One', ' ONE@example.test; two@example.test', '555-0100', 'PO Box 1', 'Elsewhere', 'NY', '10001', 'Yes', '$1,234.50'] }],
      mapping,
    )
    expect(row).toEqual({
      row: 7,
      address: '1 Test Way',
      unit: 'Lot 4',
      city: null,
      state: null,
      zip: '02134', // Excel drops the leading zero of a numeric ZIP
      ownerName: 'Owner One',
      ownerEmail: 'one@example.test',
      ownerPhone: '555-0100',
      mailingAddress: 'PO Box 1, Elsewhere, NY 10001',
      tenure: 'leased', // a yes/no "Rental" column
      balance: 1234.5,
      issue: null,
    })
  })

  it('a row with an issue keeps its data and says why', () => {
    const [row] = toRosterRows(['Address', 'Email'], [{ n: 2, cells: ['', 'not-an-email'] }], { address: 0, owner_email: 1 })
    expect(row.issue).toBe('The address is missing.')
  })
})

describe('validateRosterRow', () => {
  const ok = { address: '1 Test Way', unit: null, city: null, state: null, zip: null, ownerName: null, ownerEmail: null, ownerPhone: null, mailingAddress: null }
  it('accepts a bare address', () => {
    expect(validateRosterRow(ok)).toBeNull()
  })
  it.each([
    [{ address: '' }, 'The address is missing.'],
    [{ address: '=HYPERLINK("x")' }, 'The address is a spreadsheet formula, not an address.'],
    [{ address: 'x'.repeat(201) }, 'The address is too long (200 characters at most).'],
    [{ ownerEmail: 'nope' }, 'The owner email isn’t a valid email address.'],
    [{ ownerName: '@SUM(A1)' }, 'The owner name is a spreadsheet formula, not a name.'],
    [{ zip: '1234567890123456789012' }, 'The ZIP is too long (20 characters at most).'],
  ])('%o → %s', (patch, reason) => {
    expect(validateRosterRow({ ...ok, ...patch })).toBe(reason)
  })
  it('a phone may start with +', () => {
    expect(validateRosterRow({ ...ok, ownerPhone: '+1 555 0100' })).toBeNull()
  })
})

describe('parseTenure', () => {
  it.each([
    ['Owner-occupied', 'Tenure', 'owner_occupied'],
    ['Owner', 'Occupancy', 'owner_occupied'],
    ['Rented', 'Occupancy', 'leased'],
    ['Tenant', 'Occupancy', 'leased'],
    ['Leased', 'Tenure', 'leased'],
    ['Y', 'Rental', 'leased'],
    ['No', 'Is Rental', 'owner_occupied'],
    ['TRUE', 'Tenant Occupied', 'leased'],
    ['Yes', 'Owner Occupied', 'owner_occupied'],
    ['', 'Tenure', null],
    ['Vacant', 'Tenure', 'unknown'],
  ] as const)('%s under "%s" → %s', (value, header, want) => {
    expect(parseTenure(value, header)).toBe(want)
  })
})

describe('parseBalance', () => {
  it.each([
    ['$1,234.50', 1234.5],
    ['(25.00)', -25],
    ['-3', -3],
    ['12.5000000001', 12.5],
    ['', null],
    ['n/a', null],
  ] as const)('%s → %s', (v, want) => {
    expect(parseBalance(v)).toBe(want)
  })
})
