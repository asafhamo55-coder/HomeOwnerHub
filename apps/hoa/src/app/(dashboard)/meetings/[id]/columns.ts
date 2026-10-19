/**
 * hoa_meeting_minutes columns for the meeting page. notice_posted_at
 * (BL-050, migration 0064) is named only once M1_APPLIED, so with the flag
 * off the read is exactly today's on either schema.
 */
const BASE =
  'id, meeting_date, meeting_type, attendees, ai_summary, raw_transcript, motions, status, approved_at, approved_by, created_at'

export function meetingDetailColumns(m1: boolean): string {
  return m1 ? `${BASE}, notice_posted_at` : BASE
}
