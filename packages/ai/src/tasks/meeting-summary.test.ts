import { describe, expect, it, vi } from 'vitest'

const { runMain } = vi.hoisted(() => ({ runMain: vi.fn(async (..._args: unknown[]) => 'minutes') }))
vi.mock('../agents/main', () => ({ runMain }))

import { MEETING_SUMMARY_MAX_TOKENS, MEETING_TRANSCRIPT_MAX_CHARS, summarizeMeeting } from './meeting-summary'

// BL-108: the route accepts a 500k-char transcript, but the model sees at
// most MEETING_TRANSCRIPT_MAX_CHARS of it. The per-call cost estimate in
// apps/hoa ai-limits.ts is derived from this cut, so it is pinned here.
describe('summarizeMeeting input cap', () => {
  it('sends only the first 30,000 characters of the transcript, with max_tokens 2,000', async () => {
    expect(MEETING_TRANSCRIPT_MAX_CHARS).toBe(30_000)
    const transcript = 'a'.repeat(MEETING_TRANSCRIPT_MAX_CHARS) + 'TAIL'.repeat(100_000)
    await summarizeMeeting({ hoaName: 'X', meetingDate: '2026-10-01', transcript })
    const [messages, opts] = runMain.mock.calls[0] as unknown as [Array<{ content: string }>, { max_tokens: number }]
    const content = messages[0]!.content
    expect(content).toContain('a'.repeat(MEETING_TRANSCRIPT_MAX_CHARS))
    expect(content).not.toContain('TAIL')
    expect(content.length).toBeLessThan(MEETING_TRANSCRIPT_MAX_CHARS + 1_000)
    expect(opts.max_tokens).toBe(MEETING_SUMMARY_MAX_TOKENS)
    expect(MEETING_SUMMARY_MAX_TOKENS).toBe(2000)
  })
})
