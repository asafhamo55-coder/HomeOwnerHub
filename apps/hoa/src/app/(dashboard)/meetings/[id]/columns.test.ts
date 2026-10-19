import { describe, expect, it } from 'vitest'
import { meetingDetailColumns } from './columns'

describe('meetingDetailColumns (BL-050)', () => {
  it('flag off: today’s columns, no M1 column', () => {
    expect(meetingDetailColumns(false)).toBe(
      'id, meeting_date, meeting_type, attendees, ai_summary, raw_transcript, motions, status, approved_at, approved_by, created_at',
    )
    expect(meetingDetailColumns(false)).not.toContain('notice_posted_at')
  })

  it('flag on: adds notice_posted_at', () => {
    expect(meetingDetailColumns(true)).toContain('notice_posted_at')
  })
})
