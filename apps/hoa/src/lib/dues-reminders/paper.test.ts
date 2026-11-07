import { describe, expect, it, vi } from 'vitest'
import type { PaperRule } from '@/lib/properties/roster/labels'
import type { OwnerRosterRow } from '@/lib/properties/statutory-roster/model'
import type { ReminderCharge } from './types'

vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }))

const { buildPaperReminders } = await import('./paper')

type Owner = OwnerRosterRow['owners'][number]
const owner = (name: string, email: string | null, userId: string | null = null): Owner => ({
  name,
  email,
  phone: null,
  userId,
  share: '100%',
  since: null,
  sharingOptOut: null,
})

function row(id: string, owners: Owner[], over: Partial<OwnerRosterRow> = {}): OwnerRosterRow {
  return {
    propertyId: id,
    address: `${id.length + 100} Oak Street, Atlanta, GA 30301`,
    unitNumber: null,
    lotNumber: null,
    state: 'GA',
    owners,
    ownerSource: 'ownership_history',
    sharesWarning: null,
    mailing: { text: '', source: 'property_address' },
    ...over,
  }
}

const charge = (id: string, balance: number, pastDue = false, daysLate = 0): ReminderCharge => ({
  id,
  assessmentType: 'regular',
  dueDate: '2026-10-01',
  amount: balance,
  paid: 0,
  balance,
  pastDue,
  daysLate,
})

const owing = (entries: Record<string, ReminderCharge[]>) => new Map(Object.entries(entries))

describe('buildPaperReminders selection', () => {
  it('includes only paper-only homes that owe money', () => {
    const rows = [
      row('a', [owner('Pat Lee', null)]),
      row('b', [owner('Sam Roe', 'sam@example.org')]),
      row('c', [owner('Kim Wu', null)]),
      row('d', [owner('Ann Ng', null), owner('Bo Ng', 'bo@example.org')]),
    ]
    const { letters } = buildPaperReminders(rows, owing({ a: [charge('1', 100)], b: [charge('2', 100)], d: [charge('4', 100)] }))
    expect(letters.map((l) => l.addressee)).toEqual(['Pat Lee'])
  })

  it('applies consent per home state, fail closed on no account', () => {
    const rule: PaperRule = { consentApplies: (s) => s === 'CA', granted: new Set(['u-yes']) }
    const rows = [
      row('a', [owner('Has Consent', 'a@x.org', 'u-yes')], { state: 'CA' }),
      row('b', [owner('No Consent', 'b@x.org', 'u-no')], { state: 'CA' }),
      row('c', [owner('No Account', 'c@x.org', null)], { state: 'CA' }),
      row('d', [owner('Georgia Email', 'd@x.org', null)], { state: 'GA' }),
    ]
    const charges = owing({ a: [charge('1', 1)], b: [charge('2', 1)], c: [charge('3', 1)], d: [charge('4', 1)] })
    const { letters } = buildPaperReminders(rows, charges, rule)
    expect(letters.map((l) => l.addressee).sort()).toEqual(['No Account', 'No Consent'])
  })

  it('counts paper homes with a balance but no street', () => {
    const rows = [row('a', [owner('Pat Lee', null)], { address: '' })]
    expect(buildPaperReminders(rows, owing({ a: [charge('1', 5)] }))).toEqual({ letters: [], noAddress: 1 })
  })

  it('never issues a letter for a home with nothing owed', () => {
    const rows = [row('a', [owner('Pat Lee', null)])]
    expect(buildPaperReminders(rows, owing({ a: [] })).letters).toEqual([])
    expect(buildPaperReminders(rows, owing({})).letters).toEqual([])
  })
})

describe('buildPaperReminders letters', () => {
  it('uses the same totals as the emailed reminder and the label address block', () => {
    const rows = [row('a', [owner('Pat Lee', null), owner('Sam Lee', null)], { unitNumber: '5' })]
    const { letters } = buildPaperReminders(rows, owing({ a: [charge('1', 200, true, 40), charge('2', 50.25)] }))
    const l = letters[0]!
    expect(l.addressLines).toEqual(['Pat Lee & Sam Lee', '101 Oak St, #5', 'Atlanta, GA 30301'])
    expect(l.packet.totalDue).toBe(250.25)
    expect(l.packet.pastDueTotal).toBe(200)
    expect(l.packet.oldestDaysLate).toBe(40)
    expect(l.packet.chargeCount).toBe(2)
    expect(l.packet.email).toBe('')
  })

  it('puts one owner of two lots on one letter and orders the worst arrears first', () => {
    const mailing = { text: 'PO BOX 9, OCALA FL 34470', source: 'on_file' as const }
    const rows = [
      row('a', [owner('Pat Lee', null)], { mailing }),
      row('bb', [owner('Pat Lee', null)], { mailing }),
      row('ccc', [owner('Kim Wu', null)]),
    ]
    const { letters } = buildPaperReminders(
      rows,
      owing({ a: [charge('1', 100)], bb: [charge('2', 200)], ccc: [charge('3', 900, true, 10)] }),
    )
    expect(letters).toHaveLength(2)
    expect(letters[0]!.addressee).toBe('Kim Wu')
    const pat = letters[1]!
    expect(pat.packet.properties).toHaveLength(2)
    expect(pat.packet.totalDue).toBe(300)
    expect(pat.addressLines).toEqual(['Pat Lee', 'PO Box 9', 'Ocala, FL 34470'])
  })
})
