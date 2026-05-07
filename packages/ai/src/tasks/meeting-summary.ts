import { runMain } from '../agents/main'

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
${params.transcript.slice(0, 30_000)}

Output structure (plain text, no markdown):
1. Attendees (extract from transcript if mentioned, otherwise "see sign-in sheet")
2. Topics Discussed (bullets, 1 line each)
3. Decisions Made (bullets, with vote counts if mentioned)
4. Action Items (bullets: "Owner — task — due date")
5. Next Meeting (if mentioned)`,
      },
    ],
    { temperature: 0.2, max_tokens: 2000 },
  )
}
