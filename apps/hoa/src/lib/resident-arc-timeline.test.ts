import { describe, expect, it } from 'vitest'
import { arcTimelineSteps } from './resident-arc-timeline'

const base: { submitted_at: string; board_response_at: string | null } = {
  submitted_at: '2026-10-01T10:00:00Z',
  board_response_at: null,
}
const run = (status: string, extra: Partial<typeof base> = {}) =>
  arcTimelineSteps({ ...base, ...extra, status }).map((s) => `${s.id}:${s.state}`)

describe('arcTimelineSteps', () => {
  it('submitted', () =>
    expect(run('submitted')).toEqual(['submitted:current', 'in_review:upcoming', 'decision:upcoming']))
  it('in_review has no date', () => {
    expect(run('in_review')).toEqual(['submitted:done', 'in_review:current', 'decision:upcoming'])
    expect(arcTimelineSteps({ ...base, status: 'in_review' })[1].at).toBeNull()
  })
  it('approved carries the decision date', () => {
    const at = '2026-10-10T00:00:00Z'
    expect(run('approved', { board_response_at: at })).toEqual(['submitted:done', 'in_review:done', 'approved:current'])
    expect(arcTimelineSteps({ ...base, status: 'approved', board_response_at: at })[2].at).toBe(at)
  })
  it('denied', () =>
    expect(run('denied')).toEqual(['submitted:done', 'in_review:done', 'denied:current']))
  it('withdrawn skips the decision', () =>
    expect(run('withdrawn')).toEqual(['submitted:done', 'withdrawn:current']))
  it('unknown status degrades to Submitted only', () =>
    expect(run('something_new')).toEqual(['submitted:current']))
})
