import { describe, expect, it } from 'vitest'
import { buildLatestActivity, relativeDate } from './resident-activity'
import { residentStatusLabel } from '@/components/resident/status'

const t = (id: string, created_at: string, status = 'open') => ({ id, subject: `T ${id}`, status, created_at })
const a = (id: string, submitted_at: string, board_response_at: string | null = null, status = 'submitted') => ({ id, summary: `A ${id}`, status, submitted_at, board_response_at })
const r = (id: string, submitted_at: string, status = 'submitted') => ({ id, description: `R ${id}`, status, submitted_at })

describe('buildLatestActivity', () => {
  it('merges and sorts across the three types, newest first', () => {
    const out = buildLatestActivity({
      tickets: [t('t1', '2026-10-01T00:00:00Z')],
      arc: [a('a1', '2026-10-03T00:00:00Z')],
      reports: [r('r1', '2026-10-02T00:00:00Z')],
    })
    expect(out.map((i) => i.id)).toEqual(['a1', 'r1', 't1'])
    expect(out.map((i) => i.href)).toEqual(['/resident/arc/a1', '/resident/violations/r1', '/resident/tickets/t1'])
  })

  it('caps at 5', () => {
    const tickets = Array.from({ length: 4 }, (_, i) => t(`t${i}`, `2026-10-0${i + 1}T00:00:00Z`))
    const reports = Array.from({ length: 4 }, (_, i) => r(`r${i}`, `2026-09-0${i + 1}T00:00:00Z`))
    const out = buildLatestActivity({ tickets, arc: [], reports })
    expect(out).toHaveLength(5)
    expect(out[0]!.id).toBe('t3')
  })

  it('sorts an ARC request by its board response when that is newer', () => {
    const out = buildLatestActivity({
      tickets: [t('t1', '2026-10-05T00:00:00Z')],
      arc: [a('a1', '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z', 'approved')],
      reports: [],
    })
    expect(out[0]!.id).toBe('a1')
  })

  it('treats failed (null) lists as empty and returns [] with no activity (empty state)', () => {
    expect(buildLatestActivity({ tickets: null, arc: null, reports: null })).toEqual([])
    expect(buildLatestActivity({ tickets: [], arc: [], reports: [] })).toEqual([])
  })
})

describe('status mapping', () => {
  it('uses the shared resident vocabulary per type', () => {
    expect(residentStatusLabel('ticket', 'in_progress')).toBe('In progress')
    expect(residentStatusLabel('arc', 'in_review')).toBe('In review')
    expect(residentStatusLabel('report', 'opened_as_violation')).toBe('Action taken')
  })
})

describe('relativeDate', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  it('reads plainly', () => {
    expect(relativeDate('2026-10-30T11:59:40Z', now)).toBe('just now')
    expect(relativeDate('2026-10-30T11:00:00Z', now)).toBe('1 hour ago')
    expect(relativeDate('2026-10-27T12:00:00Z', now)).toBe('3 days ago')
    expect(relativeDate('2026-08-01T12:00:00Z', now)).toBe('Aug 1, 2026')
  })
})
