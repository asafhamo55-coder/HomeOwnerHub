import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('meeting page DOM order', () => {
  it('renders the agenda or minutes before the meeting kit', () => {
    const agenda = src.indexOf("isUpcoming ? 'Agenda' : 'Minutes'")
    const kit = src.indexOf('data-testid="meeting-kit"')
    expect(agenda).toBeGreaterThan(-1)
    expect(kit).toBeGreaterThan(agenda)
  })

  it('keeps action items in the main column and the kit cards in the rail', () => {
    const kit = src.indexOf('data-testid="meeting-kit"')
    expect(src.indexOf('<ActionItemsSection')).toBeLessThan(kit)
    for (const tag of ['<MeetingNoticeSection', '<QuorumKitCard', '<ElectionCard', '<AnnualReportCard']) {
      expect(src.indexOf(tag)).toBeGreaterThan(kit)
    }
  })
})
