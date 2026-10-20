import { runMain } from '../agents/main'

/**
 * The most transcript the model ever sees, in characters. The HOA route
 * accepts up to MAX_DOCUMENT_TEXT (500,000) so a long paste is not refused,
 * but only this much reaches the prompt — which is what bounds the per-call
 * cost (apps/hoa ai-limits.ts AI_CALL_COST_ESTIMATE_USD.meeting_summary,
 * BL-108).
 */
export const MEETING_TRANSCRIPT_MAX_CHARS = 30_000

/** The completion budget per summary (also in the BL-108 cost estimate). */
export const MEETING_SUMMARY_MAX_TOKENS = 2000

export async function summarizeMeeting(params: {
  hoaName: string
  meetingDate: string
  transcript: string
}): Promise<string> {
  return runMain(
    [
      {
        role: 'user',
        content: `Summarize this HOA board meeting transcript into formal minutes.

HOA: ${params.hoaName}
Date: ${params.meetingDate}

Transcript:
${params.transcript.slice(0, MEETING_TRANSCRIPT_MAX_CHARS)}

Output structure (plain text, no markdown):
1. Attendees (extract from transcript if mentioned, otherwise "see sign-in sheet")
2. Topics Discussed (bullets, 1 line each)
3. Decisions Made (bullets, with vote counts if mentioned)
4. Action Items (bullets: "Owner — task — due date")
5. Next Meeting (if mentioned)`,
      },
    ],
    { temperature: 0.2, max_tokens: MEETING_SUMMARY_MAX_TOKENS },
  )
}
