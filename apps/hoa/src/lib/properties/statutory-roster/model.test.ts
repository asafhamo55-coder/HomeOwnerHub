import { describe, expect, it } from 'vitest'
import { csvDocument } from '@/lib/csv'
import {
  buildOwnerRoster,
  buildVoterList,
  delinquencyAsOf,
  isOwnerOn,
  mailingAddressFromNotes,
  ownerRosterCsv,
  parseRosterParams,
  buildReport,
  reportCounts,
  reportTable,
  rosterCsvHref,
  rosterFilename,
  shareLabel,
  voterListCsv,
  buildRecordsCopy,
  recordsCopyCsv,
  recordsEmailRule,
  reportAsOf,
  SHARING_OPT_OUT_STORED,
  type RosterInput,
  type RosterOwnership,
} from './model'
import { recordsCopyLaw } from './law'

// Fixture names and addresses are invented.
const ZONE = 'America/New_York'

function input(over: Partial<RosterInput> = {}): RosterInput {
  return {
    homes: [
      {
        propertyId: 'p1',
        address: '12 Oak Lane',
        unitNumber: null,
        unitId: 'u1',
        unitIds: ['u1'],
        lotNumber: '7',
        unitNotes: null,
        state: 'FL',
        recordOwner: { name: 'Record Owner', email: 'record@example.test', phone: null },
      },
    ],
    ownerships: [],
    residents: [],
    charges: [],
    payments: [],
    timeZone: ZONE,
    ...over,
  }
}

describe('isOwnerOn — ownership periods are [valid_from, valid_to)', () => {
  const o = { validFrom: '2025-03-01', validTo: '2026-06-15' }
  it('includes the first day', () => expect(isOwnerOn(o, '2025-03-01')).toBe(true))
  it('excludes the day before', () => expect(isOwnerOn(o, '2025-02-28')).toBe(false))
  it('excludes the closing day (the buyer’s first day)', () => expect(isOwnerOn(o, '2026-06-15')).toBe(false))
  it('includes the day before closing', () => expect(isOwnerOn(o, '2026-06-14')).toBe(true))
  it('an open period runs on', () => expect(isOwnerOn({ validFrom: '2020-01-01', validTo: null }, '2099-01-01')).toBe(true))
  it('reads timestamps by their date', () => expect(isOwnerOn({ validFrom: '2025-03-01T00:00:00+00:00', validTo: null }, '2025-03-01')).toBe(true))
})

describe('shareLabel — co-owner shares', () => {
  it('a recorded share', () => expect(shareLabel(50, 2)).toBe('50%'))
  it('trims a decimal share', () => expect(shareLabel(33.33, 3)).toBe('33.33%'))
  it('a sole owner with no share recorded owns it all', () => expect(shareLabel(null, 1)).toBe('100%'))
  it('co-owners with no share recorded say so', () => expect(shareLabel(null, 2)).toBe('Share not recorded'))
})

describe('mailingAddressFromNotes', () => {
  it('reads the import / sale note', () => expect(mailingAddressFromNotes('Mailing address: PO Box 9, Tampa FL')).toBe('PO Box 9, Tampa FL'))
  it('reads it from a joined unit note', () =>
    expect(mailingAddressFromNotes('single family · occupancy: owner · Mailing address: 4 Elm St, Ocala FL')).toBe('4 Elm St, Ocala FL'))
  it('nothing on file', () => expect(mailingAddressFromNotes('gate code 1234')).toBeNull())
  it('null notes', () => expect(mailingAddressFromNotes(null)).toBeNull())
})

describe('buildOwnerRoster — eligibility as of the date', () => {
  const sale = input({
    ownerships: [
      { unitId: 'u1', ownerName: 'Seller One', ownerEmail: 's@example.test', ownerPhone: '555-0100', ownershipPct: null, validFrom: '2019-05-01', validTo: '2026-06-15' },
      { unitId: 'u1', ownerName: 'Buyer A', ownerEmail: 'a@example.test', ownerPhone: null, ownershipPct: 60, validFrom: '2026-06-15', validTo: null },
      { unitId: 'u1', ownerName: 'Buyer B', ownerEmail: null, ownerPhone: '555-0101', ownershipPct: 40, validFrom: '2026-06-15', validTo: null },
    ],
  })

  it('before the sale: the seller alone, 100%', () => {
    const r = buildOwnerRoster(sale, '2026-06-14')
    expect(r.rows[0].owners.map((o) => [o.name, o.share])).toEqual([['Seller One', '100%']])
    expect(r.rows[0].ownerSource).toBe('ownership_history')
  })

  it('on the settlement day: the buyers, largest share first', () => {
    const r = buildOwnerRoster(sale, '2026-06-15')
    expect(r.rows[0].owners.map((o) => [o.name, o.share])).toEqual([
      ['Buyer A', '60%'],
      ['Buyer B', '40%'],
    ])
    expect(r.rows[0].sharesWarning).toBeNull()
  })

  it('flags shares that do not add up to 100', () => {
    const odd = input({
      ownerships: [
        { unitId: 'u1', ownerName: 'A', ownerEmail: null, ownerPhone: null, ownershipPct: 50, validFrom: '2020-01-01', validTo: null },
        { unitId: 'u1', ownerName: 'B', ownerEmail: null, ownerPhone: null, ownershipPct: 30, validFrom: '2020-01-01', validTo: null },
      ],
    })
    expect(buildOwnerRoster(odd, '2026-01-01').rows[0].sharesWarning).toBe('Shares add up to 80%')
  })

  it('before any recorded ownership: no owner on record, not the record owner', () => {
    const r = buildOwnerRoster(sale, '2019-04-30')
    expect(r.rows[0].owners).toEqual([])
    expect(r.rows[0].ownerSource).toBe('none')
    expect(r.counts.noOwner).toBe(1)
  })

  it('no ownership history at all: falls back to the home record, and says so', () => {
    const r = buildOwnerRoster(input(), '2026-10-18')
    expect(r.rows[0].owners.map((o) => o.name)).toEqual(['Record Owner'])
    expect(r.rows[0].ownerSource).toBe('home_record')
    expect(r.counts.fromHomeRecord).toBe(1)
  })

  it('mailing address: the owner household’s note first, else the property address (labelled)', () => {
    const withNote = input({
      residents: [{ propertyId: 'p1', role: 'owner', notes: 'Mailing address: PO Box 9, Tampa FL', movedOutAt: null }],
    })
    expect(buildOwnerRoster(withNote, '2026-10-18').rows[0].mailing).toEqual({ text: 'PO Box 9, Tampa FL', source: 'on_file' })
    expect(buildOwnerRoster(input(), '2026-10-18').rows[0].mailing).toEqual({ text: '12 Oak Lane', source: 'property_address' })
  })

  it('ignores a moved-out household’s mailing note and a tenant’s', () => {
    const r = buildOwnerRoster(
      input({
        residents: [
          { propertyId: 'p1', role: 'owner', notes: 'Mailing address: Old Box', movedOutAt: '2026-01-01' },
          { propertyId: 'p1', role: 'tenant', notes: 'Mailing address: Tenant Box', movedOutAt: null },
        ],
      }),
      '2026-10-18',
    )
    expect(r.rows[0].mailing.source).toBe('property_address')
  })

  it('sorts homes by address then unit', () => {
    const two = input({
      homes: [
        { ...input().homes[0], propertyId: 'p2', address: 'B Street 2', unitId: null, unitIds: [] },
        { ...input().homes[0], propertyId: 'p1', address: 'A Street 1' },
      ],
    })
    expect(buildOwnerRoster(two, '2026-10-18').rows.map((r) => r.propertyId)).toEqual(['p1', 'p2'])
  })
})

describe('delinquencyAsOf — days past due on the date', () => {
  const charge = (id: string, dueDate: string, amount: number, status = 'open') => ({ id, unitId: 'u1', amount, dueDate, status })

  it('nothing owed', () => {
    expect(delinquencyAsOf([], [], '2026-10-18', ZONE)).toEqual({ daysPastDue: 0, oldestDueDate: null, pastDueCents: 0 })
  })

  it('counts from the oldest unpaid due date', () => {
    const d = delinquencyAsOf([charge('a', '2026-07-01', 200), charge('b', '2026-08-01', 200)], [], '2026-10-18', ZONE)
    expect(d).toEqual({ daysPastDue: 109, oldestDueDate: '2026-07-01', pastDueCents: 40000 })
  })

  it('a charge due on the date is not yet past due', () => {
    expect(delinquencyAsOf([charge('a', '2026-10-18', 200)], [], '2026-10-18', ZONE).daysPastDue).toBe(0)
  })

  it('a payment made after the date does not count (paid now, owed then)', () => {
    const d = delinquencyAsOf(
      [charge('a', '2026-01-01', 200, 'paid')],
      [{ assessmentId: 'a', unitId: 'u1', amount: 200, paidAt: '2026-05-02T15:00:00Z' }],
      '2026-04-15',
      ZONE,
    )
    expect(d.daysPastDue).toBe(104)
  })

  it('a payment by the date (association day) clears the charge', () => {
    // 2026-04-16T02:00Z is still 15 April in New York.
    const d = delinquencyAsOf(
      [charge('a', '2026-01-01', 200, 'paid')],
      [{ assessmentId: 'a', unitId: 'u1', amount: 200, paidAt: '2026-04-16T02:00:00Z' }],
      '2026-04-15',
      ZONE,
    )
    expect(d.daysPastDue).toBe(0)
  })

  it('a partial payment leaves the charge past due', () => {
    const d = delinquencyAsOf([charge('a', '2026-01-01', 200, 'partial')], [{ assessmentId: 'a', unitId: 'u1', amount: 150, paidAt: '2026-02-01' }], '2026-06-01', ZONE)
    expect(d).toEqual({ daysPastDue: 151, oldestDueDate: '2026-01-01', pastDueCents: 5000 })
  })

  it('an unapplied unit payment covers the oldest charges first', () => {
    const d = delinquencyAsOf(
      [charge('a', '2026-01-01', 200), charge('b', '2026-02-01', 200)],
      [{ assessmentId: null, unitId: 'u1', amount: 200, paidAt: '2026-03-01' }],
      '2026-06-01',
      ZONE,
    )
    expect(d.oldestDueDate).toBe('2026-02-01')
    expect(d.pastDueCents).toBe(20000)
  })

  it('waived and written-off charges never count', () => {
    const d = delinquencyAsOf([charge('a', '2026-01-01', 200, 'waived'), charge('b', '2026-01-01', 200, 'written_off')], [], '2026-06-01', ZONE)
    expect(d.daysPastDue).toBe(0)
  })
})

describe('buildVoterList — one vote per home, FL suspension flag', () => {
  const owned = { unitId: 'u1', ownerName: 'Pat Owner', ownerEmail: null, ownerPhone: null, ownershipPct: null, validFrom: '2020-01-01', validTo: null }
  const owing = (due: string) => input({ ownerships: [owned], charges: [{ id: 'c', unitId: 'u1', amount: 300, dueDate: due, status: 'open' }] })

  it('exactly 90 days past due is not "more than 90"', () => {
    const v = buildVoterList(owing('2026-07-20'), '2026-10-18')
    expect(v.rows[0].delinquency.daysPastDue).toBe(90)
    expect(v.rows[0].flag).toBe('none')
  })

  it('91 days past due in Florida: may be suspended, never suspended', () => {
    const v = buildVoterList(owing('2026-07-19'), '2026-10-18')
    expect(v.rows[0].flag).toBe('may_be_suspended')
    expect(v.rows[0].votes).toBe(1)
    expect(v.counts.mayBeSuspended).toBe(1)
  })

  it('California: no suspension flag however late', () => {
    const ca = owing('2025-01-01')
    ca.homes[0].state = 'CA'
    const v = buildVoterList(ca, '2026-10-18')
    expect(v.rows[0].flag).toBe('none')
    expect(v.rows[0].delinquency.daysPastDue).toBeGreaterThan(90)
  })

  it('one vote per home whatever the number of co-owners', () => {
    const co = input({
      ownerships: [
        { ...owned, ownerName: 'A', ownershipPct: 50 },
        { ...owned, ownerName: 'B', ownershipPct: 50 },
      ],
    })
    const v = buildVoterList(co, '2026-10-18')
    expect(v.rows[0].votes).toBe(1)
    expect(v.rows[0].owners.map((o) => o.name)).toEqual(['A', 'B'])
    expect(v.counts.totalVotes).toBe(1)
    expect(v.votingRule).toEqual({ kind: 'one_per_home', stored: false })
  })

  it('a home with no owner on record keeps its vote and is counted', () => {
    const v = buildVoterList(input({ homes: [{ ...input().homes[0], recordOwner: null }] }), '2026-10-18')
    expect(v.rows[0].votes).toBe(1)
    expect(v.counts.noOwner).toBe(1)
  })

  it('FL quorum: 30% of voting interests, and the figure if every flagged home were suspended', () => {
    const homes = Array.from({ length: 10 }, (_, i) => ({ ...input().homes[0], propertyId: `p${i}`, unitId: `u${i}`, unitIds: [`u${i}`] }))
    const charges = [0, 1, 2].map((i) => ({ id: `c${i}`, unitId: `u${i}`, amount: 100, dueDate: '2026-01-01', status: 'open' }))
    const v = buildVoterList(input({ homes, charges }), '2026-10-18')
    expect(v.quorum).toEqual({ state: 'FL', pct: 30, totalVotes: 10, needed: 3, ifAllFlaggedSuspended: { totalVotes: 7, needed: 3 } })
  })

  it('no quorum figure outside Florida', () => {
    const ca = input()
    ca.homes[0].state = 'CA'
    expect(buildVoterList(ca, '2026-10-18').quorum).toBeNull()
  })
})

describe('CSV columns', () => {
  const r = input({
    ownerships: [
      { unitId: 'u1', ownerName: 'A', ownerEmail: 'a@example.test', ownerPhone: '555', ownershipPct: 50, validFrom: '2020-01-01', validTo: null },
      { unitId: 'u1', ownerName: '=B', ownerEmail: null, ownerPhone: null, ownershipPct: 50, validFrom: '2021-02-03', validTo: null },
    ],
  })

  it('owner roster', () => {
    const { header, rows } = ownerRosterCsv(buildOwnerRoster(r, '2026-10-18'))
    expect(header).toEqual([
      'Property address',
      'Unit',
      'Lot',
      'Owners (share)',
      'Owner since',
      'Mailing address',
      'Mailing address source',
      'Owner emails',
      'Owner phones',
      'Owner source',
    ])
    expect(rows[0]).toEqual([
      '12 Oak Lane',
      '',
      '7',
      'A (50%); =B (50%)',
      '2020-01-01; 2021-02-03',
      '12 Oak Lane',
      'Property address (no other mailing address on file)',
      'A: a@example.test',
      'A: 555',
      'Ownership history',
    ])
  })

  it('voter list', () => {
    const { header, rows } = voterListCsv(buildVoterList(r, '2026-10-18'))
    expect(header).toEqual(['Property address', 'Unit', 'Lot', 'Votes', 'Eligible owners', 'Days past due', 'Past due', 'Flag'])
    expect(rows[0]).toEqual(['12 Oak Lane', '', '7', 1, 'A (50%); =B (50%)', 0, '0.00', ''])
  })
})

describe('reportTable — written through lib/csv.ts', () => {
  it('neutralises a formula in an owner name and writes BOM + CRLF', () => {
    const r = input({
      ownerships: [{ unitId: 'u1', ownerName: '=HYPERLINK("x")', ownerEmail: null, ownerPhone: null, ownershipPct: null, validFrom: '2020-01-01', validTo: null }],
    })
    const { header, rows } = reportTable(buildReport('owners', r, '2026-10-18'))
    const csv = csvDocument(header, rows)
    expect(csv.startsWith('﻿Property address,')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"") (100%)"`)
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('counts for the audit are numbers only', () => {
    expect(reportCounts(buildReport('voters', input(), '2026-10-18'))).toEqual({ homes: 1, noOwner: 0, mayBeSuspended: 0 })
    expect(reportCounts(buildReport('owners', input(), '2026-10-18'))).toEqual({ homes: 1, owners: 1, noOwner: 0 })
  })

  it('file names carry the as-of date', () => {
    expect(rosterFilename('voters', '2026-10-18')).toBe('voter-list-as-of-2026-10-18.csv')
    expect(rosterCsvHref('owners', '2026-10-18')).toBe('/properties/roster/export?kind=owners&asOf=2026-10-18')
  })
})

describe('parseRosterParams', () => {
  it('defaults the date to the association’s today and no kind', () => {
    expect(parseRosterParams({}, '2026-10-18')).toEqual({ kind: null, asOf: '2026-10-18', dateError: null })
  })
  it('accepts a kind and a real date', () => {
    expect(parseRosterParams({ kind: 'voters', asOf: '2026-03-01' }, '2026-10-18')).toEqual({ kind: 'voters', asOf: '2026-03-01', dateError: null })
  })
  it('rejects a date that does not exist', () => {
    expect(parseRosterParams({ kind: 'owners', asOf: '2026-02-30' }, '2026-10-18')).toEqual({ kind: 'owners', asOf: '2026-10-18', dateError: 'That date does not exist. Showing today instead.' })
  })
  it('ignores an unknown kind', () => {
    expect(parseRosterParams({ kind: 'everyone' }, '2026-10-18').kind).toBeNull()
  })
  it('accepts the records-request copy', () => {
    expect(parseRosterParams({ kind: 'records', asOf: '2026-03-01' }, '2026-10-18').kind).toBe('records')
  })
})

describe('buildRecordsCopy — the roster an owner may be given', () => {
  const own = (over: Partial<RosterOwnership>): RosterOwnership => ({
    unitId: 'u1',
    ownerName: 'Ann Able',
    ownerEmail: 'ann@example.test',
    ownerPhone: '555-0100',
    ownershipPct: 50,
    validFrom: '2020-01-01',
    validTo: null,
    ...over,
  })
  const withState = (state: string, ownerships: RosterOwnership[]) => {
    const i = input({ ownerships, charges: [{ id: 'c1', unitId: 'u1', amount: 900, dueDate: '2025-01-01', status: 'open' }] })
    i.homes[0].state = state
    return i
  }
  const two = [own({}), own({ ownerName: 'Bo Baker', ownerEmail: 'bo@example.test', ownerPhone: '555-0101' })]

  it('nothing stores a § 5220 opt-out yet', () => expect(SHARING_OPT_OUT_STORED).toBe(false))

  it('email rule per state: only California can include email; FL, TX, GA and unknown omit it', () => {
    expect(recordsEmailRule('CA')).toBe('unless_opted_out')
    expect(recordsEmailRule('ca')).toBe('unless_opted_out')
    for (const s of ['FL', 'TX', 'GA', 'NY', null]) expect(recordsEmailRule(s)).toBe('omit')
  })

  it('FL: names, property and mailing address, never email (§ 720.303(5))', () => {
    const c = buildRecordsCopy(withState('FL', two), '2026-10-18')
    expect(c.rows[0]).toMatchObject({ ownerNames: ['Ann Able', 'Bo Baker'], emails: [], emailNote: 'state_excludes', lotNumber: '7' })
    expect(c.counts).toMatchObject({ homes: 1, owners: 2, emailsIncluded: 0, emailsLeftOut: 2, ownersWithheld: 0 })
  })

  it('TX and GA: email left out (no verified records text in the app)', () => {
    for (const s of ['TX', 'GA']) {
      const c = buildRecordsCopy(withState(s, two), '2026-10-18')
      expect(c.rows[0].emails).toEqual([])
      expect(c.rows[0].emailNote).toBe('state_excludes')
    }
  })

  it('CA with no opt-out recorded (today): email left out, owners kept, flagged for the board check', () => {
    const c = buildRecordsCopy(withState('CA', two), '2026-10-18')
    expect(c.rows[0].ownerNames).toEqual(['Ann Able', 'Bo Baker'])
    expect(c.rows[0].emails).toEqual([])
    expect(c.rows[0].emailNote).toBe('opt_out_unknown')
    expect(c.counts.caHomes).toBe(1)
  })

  it('CA: an owner recorded as not opted out has their email; one who opted out is left off', () => {
    const c = buildRecordsCopy(withState('CA', [own({ sharingOptOut: false }), own({ ownerName: 'Bo Baker', ownerEmail: 'bo@example.test', sharingOptOut: true })]), '2026-10-18')
    expect(c.rows[0].ownerNames).toEqual(['Ann Able'])
    expect(c.rows[0].emails).toEqual(['ann@example.test'])
    expect(c.counts).toMatchObject({ owners: 1, emailsIncluded: 1, ownersWithheld: 1, homesWithheld: 0 })
  })

  it('CA: a home whose every owner opted out is left off entirely (§ 5220 covers the property address)', () => {
    const c = buildRecordsCopy(withState('CA', [own({ sharingOptOut: true })]), '2026-10-18')
    expect(c.rows).toEqual([])
    expect(c.counts).toMatchObject({ homes: 0, ownersWithheld: 1, homesWithheld: 1 })
  })

  it('FL: a recorded opt-out does not remove an owner from the official roster', () => {
    const c = buildRecordsCopy(withState('FL', [own({ sharingOptOut: true })]), '2026-10-18')
    expect(c.rows[0].ownerNames).toEqual(['Ann Able'])
    expect(c.counts.ownersWithheld).toBe(0)
  })

  it('a home with no owner on the date stays on the copy, labelled', () => {
    const i = withState('FL', [])
    i.homes[0].recordOwner = null
    const c = buildRecordsCopy(i, '2026-10-18')
    expect(c.rows[0].ownerNames).toEqual([])
    expect(c.counts.noOwner).toBe(1)
    expect(recordsCopyCsv(c).rows[0][0]).toBe('No owner on record on this date')
  })

  it('CSV: no phone, share or balance column — and no phone or amount anywhere in the file', () => {
    const report = buildReport('records', withState('CA', [own({ sharingOptOut: false }), own({ ownerName: 'Bo Baker', ownerEmail: 'bo@example.test' })]), '2026-10-18')
    const { header, rows } = reportTable(report)
    expect(header).toEqual(['Owner names', 'Property address', 'Unit', 'Lot / parcel', 'Mailing address', 'Mailing address source', 'Email'])
    expect(rows[0]).toEqual([
      'Ann Able; Bo Baker',
      '12 Oak Lane',
      '',
      '7',
      '12 Oak Lane',
      'Property address (no other mailing address on file)',
      'ann@example.test',
    ])
    const csv = csvDocument(header, rows)
    expect(csv).not.toMatch(/555-01|900|50%|bo@example/)
  })

  it('audit counts are numbers only, and the copy has its own file name and as-of', () => {
    const report = buildReport('records', withState('FL', two), '2026-10-18')
    const counts = reportCounts(report)
    expect(counts).toEqual({ homes: 1, owners: 2, noOwner: 0, emailsIncluded: 0, ownersWithheld: 0, homesWithheld: 0 })
    expect(Object.values(counts).every((v) => typeof v === 'number')).toBe(true)
    expect(reportAsOf(report)).toBe('2026-10-18')
    expect(rosterFilename('records', '2026-10-18')).toBe('owner-roster-records-copy-as-of-2026-10-18.csv')
  })
})

describe('recordsCopyLaw — citations only from verified text', () => {
  it('FL and CA are verified; TX and GA are marked unverified', () => {
    expect(recordsCopyLaw('FL')?.verified).toBe(true)
    expect(recordsCopyLaw('CA')?.verified).toBe(true)
    expect(recordsCopyLaw('TX')?.verified).toBe(false)
    expect(recordsCopyLaw('GA')?.verified).toBe(false)
    expect(recordsCopyLaw('NY')).toBeNull()
  })
  it('CA cites § 5200(a)(9) and § 5220', () => {
    const text = recordsCopyLaw('CA')!.lines.join(' ')
    expect(text).toContain('§ 5200(a)(9)')
    expect(text).toContain('§ 5220')
  })
})
