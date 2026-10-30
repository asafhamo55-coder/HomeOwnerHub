import { describe, expect, it } from 'vitest'
import { annualProgress, deriveAnnualSteps, type AnnualStepFacts } from './annual-steps'

const base: AnnualStepFacts = {
  meetingId: 'm1',
  meetingType: 'annual',
  status: 'draft',
  held: false,
  state: 'GA',
  notice: null,
}
const keys = (f: AnnualStepFacts) => deriveAnnualSteps(f).map((s) => s.key)

describe('deriveAnnualSteps', () => {
  it('is empty for non-annual meetings', () => {
    expect(deriveAnnualSteps({ ...base, meetingType: 'regular' })).toEqual([])
  })
  it('before the meeting: notice todo, minutes wait', () => {
    const s = deriveAnnualSteps(base)
    expect(keys(base)).toEqual(['notice', 'quorum', 'election', 'report', 'minutes'])
    expect(s[0]).toMatchObject({ status: 'todo', done: false, href: '/communications/new?meeting=m1' })
    expect(s[4]).toMatchObject({ status: 'todo', hint: 'After the meeting.' })
    expect(annualProgress(s)).toEqual({ done: 0, total: 5 })
  })
  it('a sent notice is done and links to it', () => {
    const s = deriveAnnualSteps({ ...base, notice: { communicationId: 'c9' } })
    expect(s[0]).toMatchObject({ done: true, href: '/communications/c9' })
  })
  it('an unreadable notice is Check, never done', () => {
    expect(deriveAnnualSteps({ ...base, notice: 'failed' })[0]).toMatchObject({ status: 'check', done: false })
  })
  it('after the meeting: approved minutes are done', () => {
    const s = deriveAnnualSteps({ ...base, held: true, status: 'approved', notice: { communicationId: 'c9' } })
    expect(s[4]).toMatchObject({ done: true, status: 'done' })
    expect(annualProgress(s)).toEqual({ done: 2, total: 5 })
    expect(deriveAnnualSteps({ ...base, held: true })[4].hint).toBe('Approve the minutes.')
  })
  it('quorum, election and report have no signal, so they read Check', () => {
    const s = deriveAnnualSteps(base)
    for (const i of [1, 2, 3]) expect(s[i]).toMatchObject({ status: 'check', done: false })
  })
  it('Georgia cites § 44-3-230(a); other states do not', () => {
    expect(deriveAnnualSteps(base)[3].label).toContain('§ 44-3-230(a)')
    const fl = deriveAnnualSteps({ ...base, state: 'FL' })[3]
    expect(fl.label).toBe('Annual report saved')
    expect(fl.hint).not.toContain('Georgia')
    expect(deriveAnnualSteps({ ...base, state: null })[3].label).toBe('Annual report saved')
  })
  it('drops the election step when there is none', () => {
    expect(keys({ ...base, hasElection: false })).not.toContain('election')
    expect(keys({ ...base, hasElection: true })).toContain('election')
    expect(keys({ ...base, hasElection: null })).toContain('election')
  })
})
