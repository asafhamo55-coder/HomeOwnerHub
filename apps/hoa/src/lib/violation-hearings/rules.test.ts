import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import { FL_305_COMMITTEE, FL_RELATIVES_NOT_CHECKED, NOT_LOADED, checkFine, type DriftCitation } from '../compliance/statute-drift'
import {
  ALL_HEARING_CITATIONS,
  CA_5855_CONTENTS,
  CA_5855_CURE,
  CA_5855_DECISION,
  CA_5855_NOTICE,
  CHECK_GOVERNING_DOCUMENTS,
  FL_305_ATTEND,
  FL_305_CURED,
  FL_305_FINDINGS,
  FL_305_NOTICE,
  FL_305_NOTICE_CONTENTS,
  FL_305_PAY_DATE,
  addDays,
  buildHearingNoticeDraft,
  hearingDigestCounts,
  hearingDigestLines,
  hearingFineFacts,
  hearingFromRow,
  normalisePersonName,
  panelRosterConflicts,
  hearingShapeErrors,
  hearingSteps,
  parsePanel,
  residentHearingView,
  type HearingRecord,
} from './rules'

// ─── every quote is verbatim, in the section it cites ────────────────

const REPO_ROOT = resolve(__dirname, '../../../../..')
const fixture = (name: string) => readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law', name), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ')
const caText = fixture('ca-civ-davis-stirling-2026.txt')
const caSection = (n: string) => {
  const start = caText.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = caText.indexOf('\n=== ', start + 10)
  return squash(caText.slice(start, end === -1 ? undefined : end))
}
const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const fl305 = squash(fl.find((r) => r.code_citation === 'Fla. Stat. § 720.305')!.body)
const ca5855 = caSection('5855')

function sectionFor(c: DriftCitation): string {
  if (c.cite.startsWith('Fla. Stat. § 720.305')) return fl305
  if (c.cite.startsWith('Cal. Civ. Code § 5855')) return ca5855
  throw new Error(`no section mapped for ${c.cite}`)
}

describe('hearing citations are verbatim from the fixtures', () => {
  it.each(ALL_HEARING_CITATIONS.map((c) => [`${c.cite} ${c.quote.slice(0, 30)}`, c] as const))('%s', (_n, c) => {
    expect(sectionFor(c)).toContain(squash(c.quote))
  })

  it('pinpoints: each quote sits in the subdivision it names', () => {
    const b = fl305.indexOf('(b) A fine or suspension levied by the board')
    const c = fl305.indexOf('(c) If the committee')
    expect(fl305).toContain(`(b) ${FL_305_NOTICE.quote}`)
    for (const q of [FL_305_NOTICE_CONTENTS, FL_305_ATTEND]) {
      const at = fl305.indexOf(q.quote)
      expect(at).toBeGreaterThan(b)
      expect(at).toBeLessThan(c)
    }
    expect(fl305).toContain(`(d) ${FL_305_FINDINGS.quote}`)
    expect(fl305).toContain(`(e) ${FL_305_CURED.quote}`)
    expect(fl305).toContain(`(f) ${FL_305_PAY_DATE.quote}`)
    expect(ca5855).toContain(`(a)${CA_5855_NOTICE.quote}`)
    expect(ca5855).toContain(`(b)${CA_5855_CONTENTS.quote}`)
    expect(ca5855).toContain(`(c)${CA_5855_CURE.quote}`)
    expect(ca5855).toContain(`(f)${CA_5855_DECISION.quote}`)
  })
})

// ─── the record ──────────────────────────────────────────────────────

const base: HearingRecord = {
  id: 'h-1',
  violationId: 'v-1',
  status: 'scheduled',
  requestedAt: null,
  residentStatement: null,
  hearingOn: '2026-11-20',
  hearingTime: '18:30',
  location: 'Clubhouse',
  panel: [],
  noticeSentOn: null,
  outcome: null,
  decidedOn: null,
  findingsSentOn: null,
  paymentDueOn: null,
}
const committee = [
  { name: 'A', role: 'member' as const },
  { name: 'B', role: 'member' as const },
  { name: 'C', role: 'member' as const },
]
const heldFl: HearingRecord = {
  ...base,
  status: 'held',
  panel: committee,
  noticeSentOn: '2026-11-01',
  outcome: 'upheld',
  decidedOn: '2026-11-20',
  findingsSentOn: '2026-11-24',
  paymentDueOn: '2026-12-31',
}

describe('parsing', () => {
  it('drops malformed panel entries and caps names', () => {
    expect(parsePanel([{ name: ' A ', role: 'member' }, { name: '', role: 'board' }, { name: 'X', role: 'chair' }, 'junk', null])).toEqual([
      { name: 'A', role: 'member' },
    ])
    expect(parsePanel({})).toEqual([])
  })

  it('a row with an unknown status is not a hearing', () => {
    expect(hearingFromRow({ id: 'h', violation_id: 'v', status: 'pending' })).toBeNull()
  })

  it('the resident sees the day and place only after the notice went out', () => {
    const row = { status: 'scheduled', hearing_on: '2026-11-20', hearing_time: '18:30', location: 'Clubhouse', notice_sent_on: null }
    expect(residentHearingView(row)).toMatchObject({ hearingOn: null, location: null })
    expect(residentHearingView({ ...row, notice_sent_on: '2026-11-01' })).toMatchObject({ hearingOn: '2026-11-20', location: 'Clubhouse' })
    expect(residentHearingView(null)).toBeNull()
  })
})

describe('hearingShapeErrors (the 0068 CHECK, as messages)', () => {
  it('scheduled needs a date, held needs an outcome, an outcome needs held', () => {
    expect(hearingShapeErrors({ ...base, hearingOn: null })).toHaveProperty('hearingOn')
    expect(hearingShapeErrors({ ...base, status: 'held' })).toHaveProperty('outcome')
    expect(hearingShapeErrors({ ...base, outcome: 'upheld' })).toHaveProperty('outcome')
    expect(hearingShapeErrors({ ...base, status: 'requested', hearingOn: null })).toEqual({})
  })

  it('days in order', () => {
    expect(hearingShapeErrors({ ...base, noticeSentOn: '2026-11-21' })).toHaveProperty('noticeSentOn')
    expect(hearingShapeErrors({ ...heldFl, paymentDueOn: '2026-11-23' })).toHaveProperty('paymentDueOn')
    expect(hearingShapeErrors(heldFl)).toEqual({})
  })
})

// ─── the checklist ───────────────────────────────────────────────────

const stateOf = (c: ReturnType<typeof hearingSteps>, code: string) => c.steps.find((s) => s.code === code)?.state

describe('hearingSteps — Florida § 720.305(2)', () => {
  it('a hearing that meets every step is all done', () => {
    const c = hearingSteps('FL', heldFl, '2026-12-01')
    expect(c.steps.map((s) => [s.code, s.state])).toEqual([
      ['notice', 'done'],
      ['committee', 'done'],
      ['within', 'done'],
      ['decision', 'done'],
      ['findings', 'done'],
      ['payment', 'done'],
    ])
  })

  it('notice: under 14 days is a problem; unsent and too close is late; else due by hearing − 14', () => {
    expect(stateOf(hearingSteps('FL', { ...base, noticeSentOn: '2026-11-10' }, '2026-11-10'), 'notice')).toBe('problem')
    expect(stateOf(hearingSteps('FL', base, '2026-11-07'), 'notice')).toBe('late')
    const c = hearingSteps('FL', base, '2026-11-01')
    expect(stateOf(c, 'notice')).toBe('todo')
    expect(c.steps[0]!.detail).toContain(addDays('2026-11-20', -14))
  })

  it('committee: a board member on it, or fewer than three, is flagged', () => {
    expect(stateOf(hearingSteps('FL', { ...base, panel: [...committee.slice(0, 2), { name: 'D', role: 'board' }] }, '2026-11-01'), 'committee')).toBe('problem')
    expect(stateOf(hearingSteps('FL', { ...base, panel: committee.slice(0, 2) }, '2026-11-01'), 'committee')).toBe('problem')
    expect(stateOf(hearingSteps('FL', base, '2026-11-01'), 'committee')).toBe('todo')
  })

  it('held more than 90 days after the notice is a problem', () => {
    expect(stateOf(hearingSteps('FL', { ...base, noticeSentOn: '2026-08-01' }, '2026-11-01'), 'within')).toBe('problem')
  })

  it('findings after 7 days are a problem; missing past the deadline is late', () => {
    expect(stateOf(hearingSteps('FL', { ...heldFl, findingsSentOn: '2026-11-28' }, '2026-12-01'), 'findings')).toBe('problem')
    expect(stateOf(hearingSteps('FL', { ...heldFl, findingsSentOn: null, paymentDueOn: null }, '2026-11-28'), 'findings')).toBe('late')
  })

  it('payment due under 30 days after the findings is a problem; a dismissed fine has no payment step', () => {
    expect(stateOf(hearingSteps('FL', { ...heldFl, paymentDueOn: '2026-12-10' }, '2026-12-01'), 'payment')).toBe('problem')
    expect(stateOf(hearingSteps('FL', { ...heldFl, outcome: 'dismissed', paymentDueOn: null }, '2026-12-01'), 'payment')).toBeUndefined()
  })
})

describe('hearingSteps — California § 5855', () => {
  const heldCa: HearingRecord = { ...heldFl, panel: [], findingsSentOn: '2026-12-02' }
  it('10 days’ notice, the decision, the written decision within 14 days of the action', () => {
    const c = hearingSteps('CA', heldCa, '2026-12-05')
    expect(c.steps.map((s) => [s.code, s.state])).toEqual([
      ['notice', 'done'],
      ['decision', 'done'],
      ['findings', 'done'],
    ])
    expect(stateOf(hearingSteps('CA', { ...heldCa, noticeSentOn: '2026-11-15' }, '2026-12-05'), 'notice')).toBe('problem')
    expect(stateOf(hearingSteps('CA', { ...heldCa, findingsSentOn: '2026-12-10' }, '2026-12-10'), 'findings')).toBe('problem')
  })
})

describe('hearingSteps — other states', () => {
  it('no loaded text: no steps, "check your governing documents"', () => {
    for (const s of ['TX', 'GA', null]) {
      const c = hearingSteps(s, heldFl, '2026-12-01')
      expect(c.steps).toEqual([])
      expect(c.note).toBe(CHECK_GOVERNING_DOCUMENTS)
    }
  })
})

// ─── BL-130: the fine check reads the hearing ────────────────────────

describe('checkFine with the hearing (BL-130 × BL-133)', () => {
  const codes = (state: string, hearing: Parameters<typeof checkFine>[0]['hearing']) =>
    checkFine({ state, dailyFineCents: 5_000, hearing }).findings.map((f) => `${f.code}:${f.severity}`)

  it('hearing undefined (flag off) reads exactly as before 0068', () => {
    const before = checkFine({ state: 'FL', dailyFineCents: 5_000 })
    expect(checkFine({ state: 'FL', dailyFineCents: 5_000, hearing: undefined })).toEqual(before)
    expect(before.findings.find((f) => f.code === 'fl_hearing_committee')!.message).toContain('no hearing record yet')
  })

  it('BL-140: null (hearings on, none recorded) blocks in FL and CA, attorney-advised override only', () => {
    expect(codes('FL', null)).toContain('fl_hearing_committee:block')
    expect(codes('CA', null)).toContain('ca_hearing_not_recorded:block')
    for (const [state, code] of [['FL', 'fl_hearing_committee'], ['CA', 'ca_hearing_not_recorded']] as const) {
      const f = checkFine({ state, dailyFineCents: 5_000, hearing: null }).findings.find((x) => x.code === code)!
      expect(f.overrideReasons).toEqual(['attorney_advised'])
    }
  })

  it('BL-140: other states are not gated by a missing hearing', () => {
    expect(codes('TX', null).some((c) => c.endsWith(':block'))).toBe(false)
    expect(codes('GA', null).some((c) => c.endsWith(':block'))).toBe(false)
  })

  it('FL: a held, approved hearing with 14 days’ notice and three non-directors clears the gate', () => {
    expect(codes('FL', hearingFineFacts(heldFl)).filter((c) => c.startsWith('fl_hearing'))).toEqual([])
  })

  it('BL-140 FL: each missing statutory step blocks on its own', () => {
    const gate = (h: HearingRecord) =>
      checkFine({ state: 'FL', dailyFineCents: 5_000, hearing: hearingFineFacts(h) }).findings.find((x) => x.code === 'fl_hearing_committee')
    // notice: unrecorded, and under 14 days
    expect(gate({ ...heldFl, noticeSentOn: null })!.severity).toBe('block')
    expect(gate({ ...heldFl, noticeSentOn: '2026-11-10' })!.message).toContain('at least 14 days’ notice (10 recorded)')
    // held more than 90 days after the notice
    expect(gate({ ...heldFl, noticeSentOn: '2026-08-01' })!.message).toContain('within 90 days of the notice (111 recorded)')
    // panel: a director on it, or fewer than three
    expect(gate({ ...heldFl, panel: [...committee, { name: 'D', role: 'board' }] })!.severity).toBe('block')
    expect(gate({ ...heldFl, panel: committee.slice(0, 2) })!.message).toContain('(2 recorded)')
    // outcome not recorded
    expect(gate({ ...heldFl, status: 'scheduled', outcome: null, decidedOn: null, findingsSentOn: null, paymentDueOn: null })!.message).toContain(
      'the hearing held, with the committee’s vote',
    )
  })

  it('BL-140 FL: a panel member marked as an owner who is on the board roster blocks; no roster = not checked', () => {
    const roster = ['Ann Board', 'Zed Admin']
    const conflicted = { ...heldFl, panel: [{ name: 'board, ann', role: 'member' as const }, ...committee] }
    const facts = hearingFineFacts(conflicted, roster)!
    expect(facts.rosterConflicts).toBe(1)
    const f = checkFine({ state: 'FL', dailyFineCents: 5_000, hearing: facts }).findings.find((x) => x.code === 'fl_hearing_committee')!
    expect(f.severity).toBe('block')
    expect(f.message).toContain('1 panel member marked as owner matches a board member or admin by name')
    expect(f.citations[0]).toBe(FL_305_COMMITTEE)
    expect(hearingFineFacts(conflicted)!.rosterConflicts).toBeUndefined()
    expect(hearingFineFacts(heldFl, roster)!.rosterConflicts).toBe(0)
  })

  it('FL: a hearing that falls short blocks and says what is missing', () => {
    const facts = hearingFineFacts({ ...heldFl, panel: [...committee.slice(0, 2), { name: 'D', role: 'board' }] })
    const f = checkFine({ state: 'FL', dailyFineCents: 5_000, hearing: facts }).findings.find((x) => x.code === 'fl_hearing_committee')!
    expect(f.message).toContain('no officers, directors or employees')
    expect(f.message).toContain('at least three committee members (2 recorded)')
  })

  it('FL: a committee that did not approve the fine blocks it (§ 720.305(2)(c))', () => {
    const check = checkFine({ state: 'FL', dailyFineCents: 5_000, hearing: hearingFineFacts({ ...heldFl, outcome: 'dismissed' }) })
    const block = check.findings.find((f) => f.code === 'fl_hearing_no_fine')!
    expect(block.severity).toBe('block')
    expect(block.citations[0]!.cite).toBe('Fla. Stat. § 720.305(2)(c)')
    expect(block.overrideReasons).toEqual(['attorney_advised'])
  })

  it('CA: a held hearing with 10 days’ notice resolves § 5855(g); a dismissal blocks', () => {
    const heldCa = { ...heldFl, panel: [], noticeSentOn: '2026-11-08' }
    expect(codes('CA', hearingFineFacts(heldCa)).filter((c) => c.startsWith('ca_hearing'))).toEqual([])
    expect(codes('CA', hearingFineFacts({ ...heldCa, noticeSentOn: '2026-11-15' }))).toContain('ca_hearing_not_recorded:block')
    expect(codes('CA', hearingFineFacts({ ...heldCa, noticeSentOn: null }))).toContain('ca_hearing_not_recorded:block')
    expect(codes('CA', hearingFineFacts({ ...heldCa, status: 'scheduled', outcome: null }))).toContain('ca_hearing_not_recorded:block')
    expect(codes('CA', hearingFineFacts({ ...heldCa, outcome: 'dismissed' }))).toContain('ca_hearing_no_fine:block')
  })

  it('a cancelled hearing counts as none', () => {
    expect(hearingFineFacts({ ...heldFl, status: 'cancelled', outcome: null })).toBeNull()
  })
})

// ─── the notice draft ────────────────────────────────────────────────

describe('buildHearingNoticeDraft', () => {
  const input = {
    state: 'FL',
    associationName: 'Palm <Grove> HOA',
    violationType: 'trash_bins',
    description: 'Bins left out <b>',
    ruleCited: 'CC&R 4.2',
    hearingOn: '2026-11-20',
    hearingTime: '18:30',
    location: 'Clubhouse',
  }

  it('FL: the statutory contents, escaped', () => {
    const d = buildHearingNoticeDraft(input)
    expect(d.subject).toBe('Notice of hearing: trash bins')
    expect(d.bodyHtml).toContain('Friday, November 20, 2026 at 6:30 PM')
    expect(d.bodyHtml).toContain('telephone or other electronic means')
    expect(d.bodyHtml).toContain('What to do to fix it')
    expect(d.bodyHtml).toContain('720.305(2)')
    expect(d.bodyHtml).toContain('Palm &lt;Grove&gt; HOA')
    expect(d.bodyHtml).not.toContain('<b>')
  })

  it('CA: the right to attend and address the board, and executive session', () => {
    const d = buildHearingNoticeDraft({ ...input, state: 'CA' })
    expect(d.bodyHtml).toContain('may address the board')
    expect(d.bodyHtml).toContain('executive session')
    expect(d.bodyHtml).toContain('section 5855')
  })

  it('missing date, time or place leave brackets for the board', () => {
    const d = buildHearingNoticeDraft({ ...input, state: 'TX', hearingOn: null, hearingTime: null, location: null })
    expect(d.bodyHtml).toContain('[hearing date] at [time]')
    expect(d.bodyHtml).toContain('[place]')
    expect(d.bodyHtml).not.toContain('720.305')
  })
})

// ─── BL-140: the panel against the board roster ──────────────────────

describe('panel vs board roster (BL-140, § 720.305(2)(b))', () => {
  it('names compare by words, ignoring case, punctuation, accents and order', () => {
    expect(normalisePersonName('Smith, Jane')).toBe(normalisePersonName('  jane   SMITH '))
    expect(normalisePersonName('José Ruiz')).toBe(normalisePersonName('jose ruiz'))
    expect(normalisePersonName('...')).toBe('')
  })

  it('only members marked as owners are matched; an empty roster finds nothing', () => {
    const panel = [{ name: 'Jane Smith', role: 'member' as const }, { name: 'Bob Lee', role: 'board' as const }, { name: 'Ann', role: 'member' as const }]
    expect(panelRosterConflicts(panel, ['smith jane', 'Bob Lee'])).toEqual([{ name: 'Jane Smith', role: 'member' }])
    expect(panelRosterConflicts(panel, [])).toEqual([])
    expect(panelRosterConflicts(panel, ['', '  '])).toEqual([])
  })

  it('the FL checklist flags a roster match as a problem and names the panel member', () => {
    const h: HearingRecord = { ...heldFl, panel: [...committee, { name: 'Jane Smith', role: 'member' }] }
    const step = hearingSteps('FL', h, '2026-12-01', ['Jane Smith']).steps.find((s) => s.code === 'committee')!
    expect(step.state).toBe('problem')
    expect(step.detail).toContain('Jane Smith is marked as an owner but matches a board member or admin')
    expect(step.citations).toEqual([FL_305_COMMITTEE])
  })

  it('a clean roster check says family ties are not checked; no roster says it was not checked', () => {
    expect(hearingSteps('FL', heldFl, '2026-12-01', ['Someone Else']).steps.find((s) => s.code === 'committee')!.detail).toContain('can’t check family ties')
    expect(hearingSteps('FL', heldFl, '2026-12-01').steps.find((s) => s.code === 'committee')!.detail).toContain('Not checked against the board roster')
  })

  it('relatives are listed as not checked for Florida fines, quoting the statute’s list', () => {
    expect(NOT_LOADED.FL!.fine).toContain(FL_RELATIVES_NOT_CHECKED)
    expect(FL_305_COMMITTEE.quote).toContain('or the spouse, parent, child, brother, or sister of an officer, director, or employee')
  })
})

// ─── BL-140: digest timers ───────────────────────────────────────────

describe('hearingDigestCounts (BL-140)', () => {
  const today = '2026-11-10'

  it('a request waiting more than 7 days counts in every state; 7 days or fewer does not', () => {
    const req = (requestedAt: string): HearingRecord => ({ ...base, status: 'requested', hearingOn: null, requestedAt })
    for (const st of ['FL', 'CA', 'TX', null]) {
      expect(hearingDigestCounts(st, [req('2026-11-02T15:00:00Z'), req('2026-11-03T15:00:00Z')], today).requestsWaiting).toBe(1)
    }
  })

  it('FL notice: due within 3 days, or already late while the hearing is still ahead', () => {
    // hearing 11-20: FL notice by 11-06 (late on 11-10); hearing 11-26: by 11-12 (due soon)
    const counts = hearingDigestCounts('FL', [base, { ...base, hearingOn: '2026-11-26' }, { ...base, hearingOn: '2026-12-30' }], today)
    expect(counts).toMatchObject({ noticeLate: 1, noticeDueSoon: 1 })
    // notice sent: nothing
    expect(hearingDigestCounts('FL', [{ ...base, noticeSentOn: '2026-11-01' }], today).noticeLate).toBe(0)
    // a hearing date already past is not a notice to send
    expect(hearingDigestCounts('FL', [{ ...base, hearingOn: '2026-11-01' }], today).noticeLate).toBe(0)
  })

  it('CA notice is 10 days', () => {
    // hearing 11-20: CA notice by 11-10 → due soon (today), not late
    expect(hearingDigestCounts('CA', [base], today)).toMatchObject({ noticeLate: 0, noticeDueSoon: 1 })
  })

  it('FL findings within 7 days of the hearing; CA written decision within 14 days, only when a fine passed', () => {
    const held = (hearingOn: string, outcome: HearingRecord['outcome'] = 'upheld'): HearingRecord => ({
      ...heldFl,
      hearingOn,
      noticeSentOn: null,
      decidedOn: hearingOn,
      outcome,
      findingsSentOn: null,
      paymentDueOn: null,
    })
    // FL: 11-01 + 7 = 11-08 (late); 11-05 + 7 = 11-12 (due soon); 11-01 dismissed still needs findings
    expect(hearingDigestCounts('FL', [held('2026-11-01'), held('2026-11-05'), held('2026-11-01', 'dismissed')], today)).toMatchObject({
      findingsLate: 2,
      findingsDueSoon: 1,
    })
    // CA: 10-20 + 14 = 11-03 (late); dismissed needs no written decision
    expect(hearingDigestCounts('CA', [held('2026-10-20'), held('2026-10-20', 'dismissed')], today)).toMatchObject({ findingsLate: 1, findingsDueSoon: 0 })
    // findings recorded: nothing
    expect(hearingDigestCounts('FL', [{ ...held('2026-11-01'), findingsSentOn: '2026-11-05' }], today).findingsLate).toBe(0)
  })

  it('states with no loaded text count only requests; cancelled never counts', () => {
    expect(hearingDigestCounts('TX', [base, { ...heldFl, findingsSentOn: null, hearingOn: '2026-10-01' }], today)).toEqual({
      requestsWaiting: 0,
      noticeLate: 0,
      noticeDueSoon: 0,
      findingsLate: 0,
      findingsDueSoon: 0,
    })
    expect(hearingDigestCounts('FL', [{ ...base, status: 'cancelled' }], today).noticeLate).toBe(0)
  })

  it('lines are counts only', () => {
    const lines = hearingDigestLines({ requestsWaiting: 2, noticeLate: 1, noticeDueSoon: 0, findingsLate: 1, findingsDueSoon: 3 })
    expect(lines).toEqual([
      '2 owner hearing requests waiting more than 7 days to be scheduled',
      '1 hearing notice not sent in time for the scheduled hearing; move the hearing date',
      '1 hearing decision not recorded as sent within the statutory window',
      '3 hearing decisions to send within 3 days',
    ])
  })
})
