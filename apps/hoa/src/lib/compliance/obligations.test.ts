import { describe, expect, it } from 'vitest'
import { signComplianceAck, withComplianceAck, type ComplianceAssociationInput } from './deadlines'
import { directorCertRows } from './director-certs'
import { ALL_COMPLIANCE_QUOTES } from './law'
import {
  buildComplianceOverview,
  complianceSummary,
  nextGaRenewal,
  type ComplianceInput,
  type ComplianceObligation,
  type DoneWithEvidence,
} from './obligations'

// BL-145. Today is 2026-10-21 unless a case says otherwise. Fictional ids only.

const SECRET = 'test-secret'
const GA = '11111111-1111-4111-8111-111111111111'
const TX = '22222222-2222-4222-8222-222222222222'
const FL = '33333333-3333-4333-8333-333333333333'
const CA = '44444444-4444-4444-8444-444444444444'
const OH = '55555555-5555-4555-8555-555555555555'
const DOC = '66666666-6666-4666-8666-666666666666'

function assoc(id: string, state: string | null, name = `HOA ${id.slice(0, 4)}`): ComplianceAssociationInput {
  return { id, name, state, governingLawState: null, complianceSettings: {} }
}

function input(over: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    today: '2026-10-21',
    associations: [assoc(GA, 'GA')],
    secret: SECRET,
    done: new Map(),
    documentNames: new Map(),
    annualMeetings: { lastHeld: null, next: null, nextNoticeSentOn: null },
    directorCerts: { kind: 'not_applicable' },
    caBudgets: new Map(),
    ...over,
  }
}

const done = (assocId: string, code: string, documentId: string | null = null, doneAt = '2026-10-02T15:00:00Z'): DoneWithEvidence =>
  new Map([[assocId, new Map([[code, { doneAt, documentId }]])]])

function find(o: ReturnType<typeof buildComplianceOverview>, keySuffix: string): ComplianceObligation {
  const hit = o.groups.flatMap((g) => g.obligations).find((x) => x.key.endsWith(keySuffix))
  if (!hit) throw new Error(`no obligation ${keySuffix}`)
  return hit
}

describe('Georgia comes first and gets the fullest list', () => {
  it('orders Georgia associations before every other state, then by name', () => {
    const o = buildComplianceOverview(
      input({ associations: [assoc(TX, 'TX', 'Alamo'), assoc(OH, 'OH', 'Buckeye'), assoc(GA, 'Georgia', 'Zelkova'), assoc(FL, 'FL', 'Sunny')] }),
    )
    expect(o.groups.map((g) => g.state)).toEqual(['GA', 'FL', 'TX', null])
  })

  it('a Georgia association: registration, upkeep, annual meeting, records, statement, condo note, elections — in that order', () => {
    const o = buildComplianceOverview(input())
    expect(o.groups[0]!.obligations.map((x) => x.key.split(':')[1])).toEqual([
      'ga-sos-registration-2027',
      'ga-registration-upkeep',
      'ga-annual-meeting',
      'ga-records',
      'ga-statement-of-amounts-due',
      'ga-condominium',
      'director-elections',
    ])
  })

  it('the registration is markable, dated Jan 1, 2027, and upcoming before then', () => {
    const r = find(buildComplianceOverview(input()), 'ga-sos-registration-2027')
    expect(r).toMatchObject({ kind: 'deadline', deadlineCode: 'ga-sos-registration-2027', tone: 'upcoming', dueOn: '2027-01-01', done: null })
    expect(r.label).toBe('Takes effect in 72 days (Jan 1, 2027)')
    expect(r.official?.href).toContain('sos.ga.gov')
  })

  it('within 30 days it turns amber; once in effect and not done it is overdue and in the banner', () => {
    expect(find(buildComplianceOverview(input({ today: '2026-12-15' })), 'ga-sos-registration-2027').tone).toBe('soon')
    const o = buildComplianceOverview(input({ today: '2027-01-02' }))
    const r = find(o, 'ga-sos-registration-2027')
    expect(r.tone).toBe('overdue')
    expect(r.label).toBe('In effect since Jan 1, 2027')
    expect(o.overdue.map((x) => x.key)).toContain(r.key)
  })

  it('done by a row: "Done <day>", with the evidence document and its name', () => {
    const o = buildComplianceOverview(
      input({ today: '2027-02-01', done: done(GA, 'ga-sos-registration-2027', DOC), documentNames: new Map([[DOC, 'SoS filing receipt']]) }),
    )
    const r = find(o, 'ga-sos-registration-2027')
    expect(r.tone).toBe('done')
    expect(r.label).toBe('Done Oct 2, 2026')
    expect(r.done).toEqual({ doneAt: '2026-10-02T15:00:00Z', evidence: { documentId: DOC, name: 'SoS filing receipt' } })
    expect(o.overdue).toEqual([])
  })

  it('an evidence document whose name did not load still links', () => {
    const r = find(buildComplianceOverview(input({ done: done(GA, 'ga-sos-registration-2027', DOC) })), 'ga-sos-registration-2027')
    expect(r.done?.evidence).toEqual({ documentId: DOC, name: 'Attached document' })
  })

  it('done by a verified legacy acknowledgment counts too (no evidence); a forged one does not', () => {
    const signed = withComplianceAck(
      {},
      'ga-sos-registration-2027',
      signComplianceAck(GA, 'ga-sos-registration-2027', { doneAt: '2026-10-01T12:00:00Z', doneBy: null }, SECRET),
    )
    const ok = find(buildComplianceOverview(input({ associations: [{ ...assoc(GA, 'GA'), complianceSettings: signed }], done: null })), 'ga-sos-registration-2027')
    expect(ok.done).toEqual({ doneAt: '2026-10-01T12:00:00Z', evidence: null })
    const forged = find(
      buildComplianceOverview(input({ associations: [{ ...assoc(GA, 'GA'), complianceSettings: signed }], secret: 'other-secret' })),
      'ga-sos-registration-2027',
    )
    expect(forged.done).toBeNull()
  })

  it('another association’s row does not mark this one done', () => {
    const r = find(buildComplianceOverview(input({ done: done(TX, 'ga-sos-registration-2027') })), 'ga-sos-registration-2027')
    expect(r.done).toBeNull()
  })

  it('upkeep: first renewal Dec 31, 2027 before the law starts; then each Dec 31, amber in December', () => {
    expect(nextGaRenewal('2026-10-21')).toBe('2027-12-31')
    expect(nextGaRenewal('2028-03-01')).toBe('2028-12-31')
    expect(find(buildComplianceOverview(input()), 'ga-registration-upkeep')).toMatchObject({ tone: 'standing', label: 'First renewal due Dec 31, 2027' })
    expect(find(buildComplianceOverview(input({ today: '2027-12-10' })), 'ga-registration-upkeep')).toMatchObject({
      tone: 'soon',
      label: 'Renewal due Dec 31, 2027 (in 21 days)',
    })
  })
})

describe('Georgia annual meeting (§ 44-3-230(a))', () => {
  const meeting = (m: ComplianceInput['annualMeetings']) => find(buildComplianceOverview(input({ annualMeetings: m })), 'ga-annual-meeting')

  it('none recorded: unknown, with a link to schedule one', () => {
    expect(meeting({ lastHeld: null, next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'unknown',
      label: 'No annual meeting recorded in HomeownerHub',
      link: { href: '/meetings/schedule' },
    })
  })

  it('held within the year: upcoming; amber within 60 days of the anniversary; overdue past it', () => {
    expect(meeting({ lastHeld: '2026-03-03', next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'upcoming',
      label: 'Last held Mar 3, 2026 · a year on is Mar 3, 2027',
      dueOn: '2027-03-03',
    })
    expect(meeting({ lastHeld: '2025-12-01', next: null, nextNoticeSentOn: null }).tone).toBe('soon')
    expect(meeting({ lastHeld: '2025-03-03', next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'overdue',
      label: 'No annual meeting since Mar 3, 2025',
    })
  })

  it('scheduled: the notice is due 21 days before; amber within 14 days of that; overdue once past and not sent', () => {
    const next = { id: 'mtg-1', date: '2026-12-15' }
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: null })).toMatchObject({
      tone: 'upcoming',
      dueOn: '2026-11-24',
      label: 'Send the notice by Nov 24, 2026 for the Dec 15, 2026 annual meeting',
      link: { href: '/meetings/mtg-1' },
    })
    expect(meeting({ lastHeld: null, next: { id: 'mtg-1', date: '2026-11-20' }, nextNoticeSentOn: null }).tone).toBe('soon')
    expect(meeting({ lastHeld: null, next: { id: 'mtg-1', date: '2026-11-05' }, nextNoticeSentOn: null })).toMatchObject({
      tone: 'overdue',
      label: 'Notice was due Oct 15, 2026 for the Nov 5, 2026 annual meeting',
    })
  })

  it('notice sent in time: upcoming; sent late: amber and says so; unreadable: says it couldn’t check', () => {
    const next = { id: 'mtg-1', date: '2026-12-15' }
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: '2026-11-01' })).toMatchObject({
      tone: 'upcoming',
      label: 'Annual meeting Dec 15, 2026 · notice sent Nov 1, 2026',
    })
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: '2026-12-01' })).toMatchObject({
      tone: 'soon',
      label: 'Annual meeting Dec 15, 2026 · notice sent Dec 1, 2026, after Nov 24, 2026',
    })
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: 'failed' }).label).toContain('couldn’t check whether it went out')
  })

  it('a failed meetings read says so; it never reads as fine', () => {
    expect(meeting(null)).toMatchObject({ tone: 'failed', label: 'Couldn’t load your meetings' })
  })

  it('carries the scope caveat: only property submitted to the Act', () => {
    const m = meeting({ lastHeld: null, next: null, nextNoticeSentOn: null })
    expect(m.appliesTo).toContain('submitted to the Georgia Property Owners’ Association Act')
    expect(m.quotes.map((q) => q.cite)).toContain('O.C.G.A. § 44-3-235(a)')
  })
})

describe('other states', () => {
  it('Texas: the management certificate is markable and standing until done, plus the elections note', () => {
    const o = buildComplianceOverview(input({ associations: [assoc(TX, 'TX')] }))
    const t = find(o, 'tx-management-certificate')
    expect(t).toMatchObject({ tone: 'unknown', label: 'Not marked as filed yet', deadlineCode: 'tx-management-certificate', dueOn: null })
    expect(o.groups[0]!.obligations.map((x) => x.kind)).toEqual(['deadline', 'not_loaded'])
  })

  it('Florida: the director tracker summarised on its association only', () => {
    const rows = directorCertRows(
      [
        { userId: 'u1', name: null },
        { userId: 'u2', name: null },
      ],
      new Map([['u1', { electedOn: '2026-05-01', certifiedOn: null, documentUrl: null, updatedAt: '2026-05-02T00:00:00Z', updatedBy: null }]]),
      '2026-10-21',
    )
    const o = buildComplianceOverview(
      input({ associations: [assoc(FL, 'FL'), assoc(OH, 'FL', 'Second FL')], directorCerts: { kind: 'ok', associationId: FL, rows } }),
    )
    expect(find(o, `${FL}:fl-director-certificates`)).toMatchObject({ tone: 'overdue', label: '1 director overdue or expired' })
    expect(o.groups.find((g) => g.associationId === OH)!.obligations.map((x) => x.kind)).toEqual(['not_loaded'])
    const failed = buildComplianceOverview(input({ associations: [assoc(FL, 'FL')], directorCerts: { kind: 'failed' } }))
    expect(find(failed, 'fl-director-certificates').tone).toBe('failed')
  })

  it('California: the § 5300(a) window from the budget checklist', () => {
    const at = (today: string, sent = false) =>
      find(
        buildComplianceOverview(
          input({
            today,
            associations: [assoc(CA, 'CA')],
            caBudgets: new Map([[CA, { kind: 'ok', budgetId: 'b-1', earliest: '2026-10-02', latest: '2026-12-01', sent }]]),
          }),
        ),
        'ca-annual-budget-report',
      )
    expect(at('2026-09-01')).toMatchObject({ tone: 'upcoming', label: 'Window opens Oct 2, 2026 · closes Dec 1, 2026' })
    expect(at('2026-10-21')).toMatchObject({ tone: 'soon', label: 'Send by Dec 1, 2026 (41 days left)', link: { href: '/accounting/budget/b-1' } })
    expect(at('2026-12-02')).toMatchObject({ tone: 'overdue' })
    expect(at('2026-12-02', true)).toMatchObject({ tone: 'done', label: 'Budget report sent' })
    const notLoaded = find(buildComplianceOverview(input({ associations: [assoc(CA, 'CA')] })), 'ca-annual-budget-report')
    expect(notLoaded).toMatchObject({ tone: 'standing', label: 'See the budget’s adoption checklist' })
  })

  it('any other state: one "check your governing documents" row and nothing quoted', () => {
    const o = buildComplianceOverview(input({ associations: [assoc(OH, 'OH')] }))
    expect(o.groups[0]!.obligations).toHaveLength(1)
    expect(o.groups[0]!.obligations[0]).toMatchObject({ kind: 'not_loaded', quotes: [] })
    expect(o.groups[0]!.obligations[0]!.steps[0]).toContain('Check your governing documents')
  })
})

describe('only checked statute text is ever shown', () => {
  it('every quote on every obligation is one of law.ts’s checked quotes', () => {
    const o = buildComplianceOverview(
      input({
        associations: [assoc(GA, 'GA'), assoc(TX, 'TX'), assoc(FL, 'FL'), assoc(CA, 'CA'), assoc(OH, 'OH')],
        directorCerts: { kind: 'ok', associationId: FL, rows: [] },
      }),
    )
    const checked = new Set(ALL_COMPLIANCE_QUOTES)
    for (const ob of o.groups.flatMap((g) => g.obligations)) for (const q of ob.quotes) expect(checked.has(q), `${ob.key} ${q.cite}`).toBe(true)
  })
})

describe('complianceSummary (monthly report, board packet)', () => {
  it('counts open and overdue and picks overdue first, then the soonest date', () => {
    const o = buildComplianceOverview(
      input({ today: '2027-01-02', annualMeetings: { lastHeld: '2026-03-03', next: null, nextNoticeSentOn: null } }),
    )
    expect(complianceSummary(o)).toEqual({
      open: 2,
      overdue: 1,
      done: 0,
      next: { title: 'Register with the Georgia Secretary of State', label: 'In effect since Jan 1, 2027', associationName: 'HOA 1111' },
      nothingTracked: false,
    })
  })

  it('nothing loaded for any state', () => {
    expect(complianceSummary(buildComplianceOverview(input({ associations: [assoc(OH, 'OH')] })))).toMatchObject({
      open: 0,
      overdue: 0,
      next: null,
      nothingTracked: true,
    })
  })
})
