import { describe, expect, it } from 'vitest'
import {
  BOARD_CONTACTS_KEY,
  MAX_BOARD_CONTACTS,
  boardContactSchema,
  readBoardContacts,
  saveBoardContactsSchema,
  telHref,
  withBoardContacts,
} from './association-contacts'

const A1 = '11111111-1111-4111-8111-111111111111'
const ok = { label: 'President', name: 'Pat Example', phone: '(555) 010-0100', email: 'pat@example.org', emergencyLine: '' }

describe('boardContactSchema', () => {
  it('accepts a full entry and defaults the optional fields', () => {
    expect(boardContactSchema.parse(ok)).toEqual(ok)
    expect(boardContactSchema.parse({ label: 'Gate', phone: '555 010 0199' })).toMatchObject({ name: '', email: '', emergencyLine: '' })
  })
  it('trims and requires a label', () => {
    expect(boardContactSchema.parse({ ...ok, label: '  Treasurer  ' }).label).toBe('Treasurer')
    expect(boardContactSchema.safeParse({ ...ok, label: '   ' }).success).toBe(false)
  })
  it('requires at least one way to reach or name someone', () => {
    expect(boardContactSchema.safeParse({ label: 'Gate' }).success).toBe(false)
    expect(boardContactSchema.safeParse({ label: 'Gate', emergencyLine: 'After hours 555 0100' }).success).toBe(true)
  })
  it('rejects a bad phone and a bad email, and over-long text', () => {
    expect(boardContactSchema.safeParse({ ...ok, phone: 'call me' }).success).toBe(false)
    expect(boardContactSchema.safeParse({ ...ok, phone: '12345' }).success).toBe(false)
    expect(boardContactSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false)
    expect(boardContactSchema.safeParse({ ...ok, name: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('saveBoardContactsSchema', () => {
  it('caps the number of entries', () => {
    const many = Array.from({ length: MAX_BOARD_CONTACTS + 1 }, () => ok)
    expect(saveBoardContactsSchema.safeParse({ associationId: A1, contacts: many }).success).toBe(false)
    expect(saveBoardContactsSchema.safeParse({ associationId: A1, contacts: many.slice(0, MAX_BOARD_CONTACTS) }).success).toBe(true)
  })
  it('requires a uuid association and allows clearing the list', () => {
    expect(saveBoardContactsSchema.safeParse({ associationId: 'x', contacts: [] }).success).toBe(false)
    expect(saveBoardContactsSchema.safeParse({ associationId: A1, contacts: [] }).success).toBe(true)
  })
})

describe('readBoardContacts / withBoardContacts', () => {
  it('reads valid entries, drops invalid ones, and caps', () => {
    const cs = { [BOARD_CONTACTS_KEY]: [ok, { label: '' }, 'junk', ...Array.from({ length: 20 }, () => ok)] }
    const got = readBoardContacts(cs)
    expect(got[0]).toEqual(ok)
    expect(got).toHaveLength(MAX_BOARD_CONTACTS)
  })
  it('returns [] for missing or malformed storage', () => {
    expect(readBoardContacts(null)).toEqual([])
    expect(readBoardContacts({})).toEqual([])
    expect(readBoardContacts({ [BOARD_CONTACTS_KEY]: 'x' })).toEqual([])
  })
  it('keeps every other compliance_settings key on write', () => {
    const out = withBoardContacts({ pay_by_zelle: { keep: 1 } }, [ok])
    expect(out.pay_by_zelle).toEqual({ keep: 1 })
    expect(out[BOARD_CONTACTS_KEY]).toEqual([ok])
  })
  it('builds a tel link from digits', () => {
    expect(telHref('(555) 010-0100')).toBe('tel:5550100100')
    expect(telHref('+1 555 010 0100')).toBe('tel:+15550100100')
  })
})
