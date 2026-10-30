import { describe, expect, it } from 'vitest'
import { GA_MEMBERS } from './notice-law'
import { applyAgenda, buildStandardAgenda, MAX_AGENDA_ACTION_ITEMS } from './agenda-template'

const ITEMS = [
  { title: 'Get a second pool bid', assignee: 'Dana', dueDate: '2026-11-15' },
  { title: 'Repaint the mailbox kiosk' },
]

describe('buildStandardAgenda', () => {
  it('regular meeting: the standard items in order, nothing else', () => {
    expect(buildStandardAgenda({ meetingType: 'regular', state: 'GA' })).toBe(
      [
        '1. Call to order',
        '2. Confirm quorum',
        '3. Approve last meeting’s minutes',
        '4. Officer and treasurer reports',
        '5. Old business',
        '6. New business',
        '7. Owner comments',
        '8. Adjourn',
      ].join('\n'),
    )
  })

  it('Georgia annual meeting: adds the owners’ report under § 44-3-230', () => {
    const text = buildStandardAgenda({ meetingType: 'annual', state: 'GA', includeOwnersReport: true })
    expect(text).toContain('5. Report to the owners (O.C.G.A. § 44-3-230)')
    expect(GA_MEMBERS.cite).toContain('§ 44-3-230')
    expect(text).toContain('6. Old business')
    expect(text.endsWith('9. Adjourn')).toBe(true)
  })

  it('Georgia annual meeting: the line is skipped when the box is off, and for a condo', () => {
    expect(buildStandardAgenda({ meetingType: 'annual', state: 'GA', includeOwnersReport: false })).not.toContain('Report to the owners')
    expect(
      buildStandardAgenda({ meetingType: 'annual', state: 'GA', associationType: 'condo', includeOwnersReport: true }),
    ).not.toContain('Report to the owners')
  })

  it('non-Georgia annual meeting: no owners’ report line even if asked', () => {
    for (const state of ['FL', 'CA', null]) {
      const text = buildStandardAgenda({ meetingType: 'annual', state, includeOwnersReport: true })
      expect(text).not.toContain('44-3-230')
      expect(text).toBe(buildStandardAgenda({ meetingType: 'regular', state }))
    }
  })

  it('a Georgia regular meeting never gets the owners’ report', () => {
    expect(buildStandardAgenda({ meetingType: 'regular', state: 'GA', includeOwnersReport: true })).not.toContain('Report to the owners')
  })

  it('owner comments can be left out', () => {
    expect(buildStandardAgenda({ meetingType: 'regular', state: 'GA', includeOwnerComments: false })).not.toContain('Owner comments')
  })

  it('open action items are listed under Old business when included', () => {
    const text = buildStandardAgenda({ meetingType: 'regular', state: 'GA', openActionItems: ITEMS })
    expect(text).toContain(
      '5. Old business\n   - Get a second pool bid (Dana, due 2026-11-15)\n   - Repaint the mailbox kiosk\n6. New business',
    )
  })

  it('open action items are left out when excluded', () => {
    const text = buildStandardAgenda({ meetingType: 'regular', state: 'GA', openActionItems: [] })
    expect(text).not.toContain('pool bid')
    expect(text).not.toContain('   - ')
  })

  it('a long list is cut and says how many more', () => {
    const many = Array.from({ length: MAX_AGENDA_ACTION_ITEMS + 3 }, (_, i) => ({ title: `Item ${i + 1}` }))
    const text = buildStandardAgenda({ meetingType: 'regular', state: null, openActionItems: many })
    expect(text).toContain('   - and 3 more open action items')
    expect(text).not.toContain(`Item ${MAX_AGENDA_ACTION_ITEMS + 1}`)
    expect(text.length).toBeLessThan(4000)
  })

  it('uses no em dashes', () => {
    expect(buildStandardAgenda({ meetingType: 'annual', state: 'GA', includeOwnersReport: true, openActionItems: ITEMS })).not.toContain('—')
  })
})

describe('applyAgenda', () => {
  const agenda = '1. Call to order\n2. Adjourn'

  it('replace swaps out what is there', () => {
    expect(applyAgenda('Pool bids\nBudget', agenda, 'replace')).toBe(agenda)
  })

  it('append keeps the existing text and adds the agenda after a blank line', () => {
    expect(applyAgenda('Pool bids\nBudget\n', agenda, 'append')).toBe(`Pool bids\nBudget\n\n${agenda}`)
  })

  it('an empty field just gets the agenda either way', () => {
    expect(applyAgenda('  \n', agenda, 'append')).toBe(agenda)
    expect(applyAgenda('', agenda, 'replace')).toBe(agenda)
  })
})
