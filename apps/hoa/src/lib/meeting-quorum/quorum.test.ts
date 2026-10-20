import { describe, expect, it } from 'vitest'
import {
  EMPTY_KIT,
  applyKitChange,
  chaseList,
  countQuorum,
  isValidQuorumPct,
  kitEligibility,
  kitIsOpen,
  kitMeetingLabel,
  parseQuorumPct,
  printableHomes,
  printableName,
  proxyReminderText,
  quorumNeeded,
  sharesWorthPrinting,
  type QuorumKit,
} from './quorum'
import { proxyLaw } from './law'

// BL-122: the quorum math, proxy/check-in tracking state and the printable
// rows (names and addresses only).

const NOW = '2026-10-20T15:00:00.000Z'
const LATER = '2026-11-02T18:30:00.000Z'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const homes = (n: number) => Array.from({ length: n }, (_, i) => ({ propertyId: id(i + 1), votes: 1 }))

function kit(over: Partial<QuorumKit> = {}): QuorumKit {
  return { ...EMPTY_KIT, homes: {}, ...over }
}

describe('quorum percent', () => {
  it('accepts 0 < pct ≤ 100 with at most two decimals', () => {
    expect(isValidQuorumPct(30)).toBe(true)
    expect(isValidQuorumPct(33.33)).toBe(true)
    expect(isValidQuorumPct(100)).toBe(true)
    expect(isValidQuorumPct(0)).toBe(false)
    expect(isValidQuorumPct(-5)).toBe(false)
    expect(isValidQuorumPct(100.01)).toBe(false)
    expect(isValidQuorumPct(33.333)).toBe(false)
    expect(isValidQuorumPct(Number.NaN)).toBe(false)
    expect(isValidQuorumPct('30')).toBe(false)
  })

  it('parses what the board types', () => {
    expect(parseQuorumPct('25')).toBe(25)
    expect(parseQuorumPct(' 25% ')).toBe(25)
    expect(parseQuorumPct('33.33')).toBe(33.33)
    expect(parseQuorumPct('')).toBeNull()
    expect(parseQuorumPct('abc')).toBeNull()
    expect(parseQuorumPct('0')).toBeNull()
    expect(parseQuorumPct('150')).toBeNull()
    expect(parseQuorumPct('1e2')).toBeNull()
  })
})

describe('quorumNeeded', () => {
  it('rounds up: 30% of 80 homes is 24, of 81 is 25 (24.3 → 25)', () => {
    expect(quorumNeeded(80, 30)).toBe(24)
    expect(quorumNeeded(81, 30)).toBe(25)
  })

  it('has no float drift on two-decimal percents', () => {
    // 33.33% of 300 = 99.99 → 100; 25% of 4 = 1 exactly.
    expect(quorumNeeded(300, 33.33)).toBe(100)
    expect(quorumNeeded(4, 25)).toBe(1)
    expect(quorumNeeded(10, 10)).toBe(1)
    expect(quorumNeeded(0, 30)).toBe(0)
  })
})

describe('countQuorum', () => {
  it('no percent entered: counts, but needed / reached stay null (the field is required)', () => {
    const c = countQuorum(homes(10), kit())
    expect(c).toMatchObject({ totalHomes: 10, totalVotes: 10, representedVotes: 0, pct: null, needed: null, reached: null, shortBy: null })
  })

  it('present + proxies, each home once; a proxy home whose owner also came counts as present', () => {
    const k = kit({
      quorumPct: 30,
      homes: {
        [id(1)]: { proxy: null, presentAt: NOW },
        [id(2)]: { proxy: { kind: 'general', at: NOW }, presentAt: null },
        [id(3)]: { proxy: { kind: 'limited', at: NOW }, presentAt: LATER },
      },
    })
    const c = countQuorum(homes(10), k)
    expect(c.presentVotes).toBe(2)
    expect(c.proxyOnlyVotes).toBe(1)
    expect(c.representedVotes).toBe(3)
    expect(c.proxiesReceived).toBe(2)
    expect(c.needed).toBe(3)
    expect(c.reached).toBe(true)
    expect(c.shortBy).toBe(0)
  })

  it('short by the difference until reached', () => {
    const k = kit({ quorumPct: 25, homes: { [id(1)]: { proxy: null, presentAt: NOW } } })
    const c = countQuorum(homes(80), k)
    expect(c.needed).toBe(20)
    expect(c.reached).toBe(false)
    expect(c.shortBy).toBe(19)
  })

  it('ignores entries for homes no longer on the roster', () => {
    const k = kit({ quorumPct: 50, homes: { [id(99)]: { proxy: null, presentAt: NOW } } })
    const c = countQuorum(homes(2), k)
    expect(c.representedVotes).toBe(0)
    expect(c.ignoredEntries).toBe(1)
  })

  it('an empty roster never reports quorum reached', () => {
    expect(countQuorum([], kit({ quorumPct: 30 })).reached).toBe(false)
  })
})

describe('applyKitChange (proxy tracking state)', () => {
  it('records a proxy with its time, keeps the first time on a repeat, and changes kind', () => {
    let k = applyKitChange(kit(), { kind: 'proxy', propertyId: id(1), proxy: 'general' }, NOW)
    expect(k.homes[id(1)]).toEqual({ proxy: { kind: 'general', at: NOW }, presentAt: null })
    k = applyKitChange(k, { kind: 'proxy', propertyId: id(1), proxy: 'general' }, LATER)
    expect(k.homes[id(1)]!.proxy!.at).toBe(NOW)
    k = applyKitChange(k, { kind: 'proxy', propertyId: id(1), proxy: 'limited' }, LATER)
    expect(k.homes[id(1)]!.proxy).toEqual({ kind: 'limited', at: LATER })
  })

  it('check-in keeps the proxy; clearing both removes the entry', () => {
    let k = applyKitChange(kit(), { kind: 'proxy', propertyId: id(1), proxy: 'general' }, NOW)
    k = applyKitChange(k, { kind: 'present', propertyId: id(1), present: true }, LATER)
    expect(k.homes[id(1)]).toEqual({ proxy: { kind: 'general', at: NOW }, presentAt: LATER })
    k = applyKitChange(k, { kind: 'present', propertyId: id(1), present: false }, LATER)
    k = applyKitChange(k, { kind: 'proxy', propertyId: id(1), proxy: null }, LATER)
    expect(k.homes).toEqual({})
  })

  it('never mutates the kit it was given', () => {
    const before = kit()
    applyKitChange(before, { kind: 'present', propertyId: id(1), present: true }, NOW)
    applyKitChange(before, { kind: 'quorum_pct', pct: 25 }, NOW)
    expect(before).toEqual(kit())
  })

  it('sets the percent and the members’-meeting flag', () => {
    expect(applyKitChange(kit(), { kind: 'quorum_pct', pct: 25 }, NOW).quorumPct).toBe(25)
    expect(applyKitChange(kit(), { kind: 'member_meeting', value: true }, NOW).memberMeeting).toBe(true)
  })
})

describe('chaseList', () => {
  it('lists homes with neither a proxy nor a check-in, in roster order', () => {
    const k = kit({
      homes: {
        [id(2)]: { proxy: { kind: 'general', at: NOW }, presentAt: null },
        [id(3)]: { proxy: null, presentAt: NOW },
      },
    })
    expect(chaseList(homes(4), k).map((h) => h.propertyId)).toEqual([id(1), id(4)])
  })
})

describe('eligibility', () => {
  it('annual always; special once confirmed; board meetings never', () => {
    expect(kitEligibility('annual', kit())).toBe('annual')
    expect(kitEligibility('special', kit())).toBe('special_unconfirmed')
    expect(kitEligibility('special', kit({ memberMeeting: true }))).toBe('special_confirmed')
    expect(kitEligibility('regular', kit({ memberMeeting: true }))).toBe('not_member_meeting')
    expect(kitEligibility('emergency', kit())).toBe('not_member_meeting')
    expect(kitEligibility(null, kit())).toBe('not_member_meeting')
    expect(kitIsOpen('annual')).toBe(true)
    expect(kitIsOpen('special_confirmed')).toBe(true)
    expect(kitIsOpen('special_unconfirmed')).toBe(false)
    expect(kitIsOpen('not_member_meeting')).toBe(false)
    expect(kitMeetingLabel('annual')).toBe('Annual meeting')
    expect(kitMeetingLabel('special')).toBe('Special meeting of the members')
  })
})

describe('printable rows', () => {
  const rows = [
    {
      propertyId: id(1),
      address: '104 Example Way',
      unitNumber: null,
      lotNumber: '1',
      owners: [
        { name: 'Ana Rivera', share: '50%', email: 'ana@example.test', phone: '(555) 010-0001' },
        { name: 'Ben Rivera', share: '50%', email: 'ben@example.test', phone: '(555) 010-0002' },
      ],
    },
    { propertyId: id(2), address: '108 Example Way', unitNumber: '2B', lotNumber: null, owners: [{ name: 'cara@example.test', share: '100%', email: null, phone: null }] },
    { propertyId: id(3), address: '', unitNumber: null, lotNumber: '3', owners: [{ name: '555-010-0003', share: '100%' }] },
  ]

  it('carries names, addresses, lots and shares — never an email or phone', () => {
    const out = printableHomes(rows)
    const text = JSON.stringify(out)
    expect(text).not.toMatch(/@/)
    expect(text).not.toMatch(/555/)
    expect(out[0]).toEqual({
      propertyId: id(1),
      home: '104 Example Way',
      lot: '1',
      owners: [
        { name: 'Ana Rivera', share: '50%' },
        { name: 'Ben Rivera', share: '50%' },
      ],
      votes: 1,
    })
    expect(out[1]!.home).toBe('108 Example Way, Unit 2B')
    expect(out[1]!.owners[0]!.name).toBe('Name not recorded')
    expect(out[2]!.home).toBe('Address not recorded')
    expect(out[2]!.owners[0]!.name).toBe('Name not recorded')
  })

  it('printableName keeps ordinary names', () => {
    expect(printableName('  Dana O’Neil ')).toBe('Dana O’Neil')
    expect(printableName(null)).toBe('Name not recorded')
  })

  it('prints shares only when they say something', () => {
    expect(sharesWorthPrinting(printableHomes(rows))).toBe(true)
    expect(sharesWorthPrinting(printableHomes([rows[1]!]))).toBe(false)
  })
})

describe('reminder text', () => {
  it('asks for a proxy without naming anyone or promising anything is sent', () => {
    const r = proxyReminderText({ associationName: 'Maple HOA', meetingDate: 'Jan 15, 2027', meetingLabel: 'Annual meeting' })
    expect(r.subject).toContain('annual meeting on Jan 15, 2027')
    expect(r.body).toContain('Maple HOA')
    expect(r.body).toContain('quorum')
  })
})

describe('proxyLaw', () => {
  it('Florida cites § 720.306 and gives 30% as context', () => {
    const fl = proxyLaw('fl')
    expect(fl.verified).toBe(true)
    expect(fl.statuteQuorumPct).toBe(30)
    expect(fl.requiresTimeAndPlace).toBe(true)
    expect(fl.lines.join(' ')).toContain('§ 720.306(8)(a)')
  })

  it('California cites § 5130 and puts directions on a detachable page', () => {
    const ca = proxyLaw('CA')
    expect(ca.lines.join(' ')).toContain('§ 5130')
    expect(ca.detachableDirections).toBe(true)
    expect(ca.statuteQuorumPct).toBeNull()
  })

  it('anywhere else: no citation, check your bylaws', () => {
    for (const s of ['TX', 'GA', null]) {
      const n = proxyLaw(s)
      expect(n.verified).toBe(false)
      expect(n.lines.join(' ')).not.toContain('§')
      expect(n.lines.join(' ')).toContain('Check your bylaws')
    }
  })
})
