import { describe, expect, it } from 'vitest'
import {
  EMPTY_RECORD,
  adoptionAgenda,
  adoptionCountdown,
  adoptionJurisdiction,
  agendaMentionsAssessments,
  buildAdoptionKit,
  caReportWindow,
  flNoticeDeadlines,
  flNoticeDueBy,
  inBudgetSeason,
  nextStep,
  type AdoptionInput,
} from './model'
import { CA_BUDGET_REPORT, CA_MEETING_NOTICE_NOT_LOADED, CHECK_GOVERNING_DOCS, FL_ASSESSMENT_STATEMENT, FL_SPECIAL_ASSESSMENT } from './law'

const BUDGET = '11111111-1111-4111-8111-111111111111'
const MEETING = '22222222-2222-4222-8222-222222222222'

function input(over: Partial<AdoptionInput> = {}): AdoptionInput {
  return {
    state: 'FL',
    today: '2026-10-21',
    budget: { id: BUDGET, status: 'draft', periodStart: '2027-01-01' },
    meeting: null,
    noticeDay: null,
    record: { ...EMPTY_RECORD },
    ...over,
  }
}

const meeting = (date: string, agenda: string | null = adoptionAgenda('Operating · FY 2027')) => ({
  id: MEETING,
  date,
  type: 'regular',
  status: 'draft',
  agenda,
})

const step = (i: AdoptionInput, id: string) => buildAdoptionKit(i).steps.find((s) => s.id === id)!

describe('jurisdiction', () => {
  it('FL and CA by state, anything else generic', () => {
    expect(adoptionJurisdiction('fl')).toBe('FL')
    expect(adoptionJurisdiction(' CA ')).toBe('CA')
    expect(adoptionJurisdiction('TX')).toBe('generic')
    expect(adoptionJurisdiction(null)).toBe('generic')
  })
})

describe('Florida notice deadline math (§ 720.303(2)(c)1–2)', () => {
  it('48 hours posted, 7 days mailed, 14 days for special assessments', () => {
    expect(flNoticeDeadlines('2026-11-18')).toEqual({ postedBy: '2026-11-16', mailedBy: '2026-11-11', specialBy: '2026-11-04' })
  })

  it('crosses month and year boundaries', () => {
    expect(flNoticeDeadlines('2027-01-05')).toEqual({ postedBy: '2027-01-03', mailedBy: '2026-12-29', specialBy: '2026-12-22' })
    expect(flNoticeDeadlines('2028-03-01').mailedBy).toBe('2028-02-23') // leap year
  })

  it('due-by: 7 days without special assessments, 14 with', () => {
    expect(flNoticeDueBy('2026-12-10', false)).toBe('2026-12-03')
    expect(flNoticeDueBy('2026-12-10', true)).toBe('2026-11-26')
  })

  it('countdown to the notice deadline once a meeting is linked and no notice has gone out', () => {
    const i = input({ meeting: meeting('2026-11-18'), record: { ...EMPTY_RECORD, meetingId: MEETING } })
    expect(adoptionCountdown(i, 'FL', null)).toEqual({ label: 'Send the meeting notice by', date: '2026-11-11', daysLeft: 21, tone: 'info' })
    const special = { ...i, record: { ...i.record, special: true } }
    expect(adoptionCountdown(special, 'FL', null)).toMatchObject({ date: '2026-11-04', daysLeft: 14 })
  })

  it('countdown turns warning inside a week and danger once passed', () => {
    const i = input({ meeting: meeting('2026-10-30'), record: { ...EMPTY_RECORD, meetingId: MEETING } })
    expect(adoptionCountdown(i, 'FL', null)).toMatchObject({ date: '2026-10-23', daysLeft: 2, tone: 'warning' })
    const late = input({ meeting: meeting('2026-10-25'), record: { ...EMPTY_RECORD, meetingId: MEETING } })
    expect(adoptionCountdown(late, 'FL', null)).toMatchObject({ date: '2026-10-18', daysLeft: -3, tone: 'danger' })
  })

  it('no meeting yet: counts down to the budget year', () => {
    expect(adoptionCountdown(input(), 'FL', null)).toEqual({ label: 'Budget year starts', date: '2027-01-01', daysLeft: 72, tone: 'info' })
  })

  it('a notice sent late is flagged with how many days ahead it went', () => {
    const i = input({ meeting: meeting('2026-11-18'), noticeDay: '2026-11-14', record: { ...EMPTY_RECORD, meetingId: MEETING } })
    const s = step(i, 'notice')
    expect(s.state).toBe('warn')
    expect(s.detail[0]).toContain('4 days before the meeting')
    expect(s.detail[0]).toContain('posted at least 48 hours ahead')
  })

  it('a notice sent in time is done', () => {
    const i = input({ meeting: meeting('2026-11-18'), noticeDay: '2026-11-01', record: { ...EMPTY_RECORD, meetingId: MEETING } })
    expect(step(i, 'notice').state).toBe('done')
  })

  it('special assessments: 10 days ahead is late even if posted', () => {
    const i = input({ meeting: meeting('2026-11-18'), noticeDay: '2026-11-08', record: { ...EMPTY_RECORD, meetingId: MEETING, special: true } })
    const s = step(i, 'notice')
    expect(s.state).toBe('warn')
    expect(s.detail[0]).not.toContain('48 hours')
    expect(s.citations).toContain(FL_SPECIAL_ASSESSMENT)
  })

  it('an agenda that never mentions assessments is flagged (the notice is prefilled from it)', () => {
    expect(agendaMentionsAssessments(adoptionAgenda('Operating · FY 2027'))).toBe(true)
    expect(agendaMentionsAssessments('1. Approve the budget')).toBe(false)
    expect(agendaMentionsAssessments(null)).toBe(false)
    const i = input({ meeting: meeting('2026-11-18', '1. Approve the budget'), record: { ...EMPTY_RECORD, meetingId: MEETING } })
    const s = step(i, 'notice')
    expect(s.state).toBe('warn')
    expect(s.citations[0]).toBe(FL_ASSESSMENT_STATEMENT)
    expect(s.href).toBe(`/communications/new?meeting=${MEETING}`)
  })
})

describe('California § 5300(a) window math', () => {
  it('calendar year: 2026-10-02 to 2026-12-01 (the research’s worked example)', () => {
    expect(caReportWindow('2027-01-01', '2026-10-21')).toEqual({
      fiscalYearEnd: '2026-12-31',
      earliest: '2026-10-02',
      latest: '2026-12-01',
      status: 'within',
    })
  })

  it('a July fiscal year', () => {
    expect(caReportWindow('2027-07-01', '2026-10-21')).toMatchObject({ fiscalYearEnd: '2027-06-30', earliest: '2027-04-01', latest: '2027-05-31', status: 'early' })
  })

  it('edges: the first and last days are inside', () => {
    expect(caReportWindow('2027-01-01', '2026-10-01')!.status).toBe('early')
    expect(caReportWindow('2027-01-01', '2026-10-02')!.status).toBe('within')
    expect(caReportWindow('2027-01-01', '2026-12-01')!.status).toBe('within')
    expect(caReportWindow('2027-01-01', '2026-12-02')!.status).toBe('late')
  })

  it('no period, no window', () => {
    expect(caReportWindow(null, '2026-10-21')).toBeNull()
  })

  it('countdown: opens / closes / closed, until the owner notice is recorded', () => {
    const ca = (today: string, ownerNoticeOn: string | null = null) => {
      const i = input({ state: 'CA', today, record: { ...EMPTY_RECORD, ownerNoticeOn } })
      return adoptionCountdown(i, 'CA', caReportWindow('2027-01-01', today))
    }
    expect(ca('2026-09-20')).toEqual({ label: '§ 5300 budget report window opens', date: '2026-10-02', daysLeft: 12, tone: 'info' })
    expect(ca('2026-10-21')).toEqual({ label: '§ 5300 budget report window closes', date: '2026-12-01', daysLeft: 41, tone: 'info' })
    expect(ca('2026-11-28')).toMatchObject({ daysLeft: 3, tone: 'warning' })
    expect(ca('2026-12-05')).toEqual({ label: '§ 5300 budget report window closed', date: '2026-12-01', daysLeft: -4, tone: 'danger' })
    expect(ca('2026-10-21', '2026-10-20')).toMatchObject({ label: 'Budget year starts' })
  })

  it('owner notice outside the window is flagged; inside is done', () => {
    const base = { state: 'CA', budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' } } as const
    const early = step(input({ ...base, record: { ...EMPTY_RECORD, ownerNoticeOn: '2026-09-30' } }), 'owner_notice')
    expect(early.state).toBe('warn')
    expect(early.citations).toEqual([CA_BUDGET_REPORT])
    expect(step(input({ ...base, record: { ...EMPTY_RECORD, ownerNoticeOn: '2026-10-15' } }), 'owner_notice').state).toBe('done')
    const late = step(input({ ...base, today: '2026-12-10' }), 'owner_notice')
    expect(late.state).toBe('warn')
    expect(late.detail[0]).toContain('window has closed')
  })

  it('the meeting notice period itself is not loaded: check your governing documents', () => {
    const i = input({ state: 'CA', meeting: meeting('2026-11-18'), record: { ...EMPTY_RECORD, meetingId: MEETING } })
    const s = step(i, 'notice')
    expect(s.detail).toContain(CA_MEETING_NOTICE_NOT_LOADED)
    expect(s.citations).toEqual([])
  })
})

describe('other states', () => {
  it('no statute quoted anywhere; check your governing documents', () => {
    const i = input({ state: 'TX', meeting: meeting('2026-11-18'), budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' }, record: { ...EMPTY_RECORD, meetingId: MEETING } })
    const kit = buildAdoptionKit(i)
    expect(kit.steps.flatMap((s) => s.citations)).toEqual([])
    expect(kit.steps.find((s) => s.id === 'notice')!.detail).toContain(CHECK_GOVERNING_DOCS)
    expect(kit.steps.find((s) => s.id === 'owner_notice')!.detail).toContain(CHECK_GOVERNING_DOCS)
    expect(kit.caWindow).toBeNull()
  })
})

describe('the checklist', () => {
  it('a fresh draft: schedule first, the rest waits, the hand-off links to dues (flag off)', () => {
    const kit = buildAdoptionKit(input({ duesRatesLive: false }))
    expect(kit.steps.map((s) => [s.id, s.state])).toEqual([
      ['meeting', 'todo'],
      ['notice', 'waiting'],
      ['approve', 'waiting'],
      ['record', 'waiting'],
      ['owner_notice', 'waiting'],
      ['rate', 'next'],
    ])
    expect(kit.steps[0]!.href).toBe(`/meetings/schedule?budget=${BUDGET}`)
    expect(kit.steps[5]!.href).toBe('/dues/new')
    expect(nextStep(kit)!.id).toBe('meeting')
    expect(kit.complete).toBe(false)
  })

  it('all done: complete, no countdown', () => {
    const kit = buildAdoptionKit(
      input({
        today: '2026-11-20',
        budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' },
        meeting: { ...meeting('2026-11-18'), status: 'approved', agenda: null },
        noticeDay: '2026-11-01',
        record: { meetingId: MEETING, special: false, adoptedOn: '2026-11-18', ownerNoticeOn: '2026-11-19' },
      }),
    )
    // Held meeting (minutes approved): the agenda is no longer readable,
    // and the notice went out in time, so the step is done.
    expect(kit.steps.find((s) => s.id === 'notice')!.state).toBe('done')
    expect(kit.complete).toBe(true)
    const ok = buildAdoptionKit(
      input({
        today: '2026-11-20',
        budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' },
        meeting: meeting('2026-11-18'),
        noticeDay: '2026-11-01',
        record: { meetingId: MEETING, special: false, adoptedOn: '2026-11-18', ownerNoticeOn: '2026-11-19' },
      }),
    )
    expect(ok.complete).toBe(true)
    expect(ok.countdown).toBeNull()
    expect(nextStep(ok)).toBeNull()
  })

  it('adoption date that isn’t the meeting date is flagged', () => {
    const s = step(
      input({ budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' }, meeting: meeting('2026-11-18'), record: { ...EMPTY_RECORD, meetingId: MEETING, adoptedOn: '2026-11-17' } }),
      'record',
    )
    expect(s.state).toBe('warn')
  })

  it('a held meeting with no notice from HomeownerHub is flagged, with no composer link', () => {
    const s = step(input({ today: '2026-11-20', meeting: meeting('2026-11-18'), record: { ...EMPTY_RECORD, meetingId: MEETING } }), 'notice')
    expect(s.state).toBe('warn')
    expect(s.href).toBeNull()
  })

  it('a failed notice read says so rather than "not sent"', () => {
    const s = step(input({ meeting: meeting('2026-11-18'), noticeDay: 'failed', record: { ...EMPTY_RECORD, meetingId: MEETING } }), 'notice')
    expect(s.detail[0]).toBe('Couldn’t check whether a notice was sent.')
  })
})

describe('budget season', () => {
  const b = (status: string, periodStart: string | null) => ({ status, periodStart })
  it('draft or approved, from 120 days before the budget year to 30 days into it', () => {
    expect(inBudgetSeason(b('draft', '2027-01-01'), '2026-09-03')).toBe(true) // 120 days
    expect(inBudgetSeason(b('draft', '2027-01-01'), '2026-09-02')).toBe(false) // 121
    expect(inBudgetSeason(b('approved', '2027-01-01'), '2027-01-31')).toBe(true) // 30 in
    expect(inBudgetSeason(b('approved', '2027-01-01'), '2027-02-01')).toBe(false)
  })
  it('never for archived budgets or a budget with no period', () => {
    expect(inBudgetSeason(b('archived', '2027-01-01'), '2026-10-21')).toBe(false)
    expect(inBudgetSeason(b('draft', null), '2026-10-21')).toBe(false)
  })
})

describe('BL-137: the hand-off to the dues-rate schedule', () => {
  it('flag off: links to Add a due, as before', () => {
    const s = step(input({ duesRatesLive: false, budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' } }), 'rate')
    expect(s.href).toBe('/dues/new')
  })

  it('flag on: an approved budget opens Dues rates pre-filled from it; a draft waits', () => {
    const approved = step(input({ duesRatesLive: true, budget: { id: BUDGET, status: 'approved', periodStart: '2027-01-01' } }), 'rate')
    expect(approved).toMatchObject({ state: 'next', href: `/dues/rates?budget=${BUDGET}`, hrefLabel: 'Set the new dues rate' })
    const draft = step(input({ duesRatesLive: true }), 'rate')
    expect(draft.href).toBeNull()
    expect(draft.state).toBe('next')
  })
})
