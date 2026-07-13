import { runCloud } from '../agents/cloud'

export async function generateDailyDigest(params: {
  hoaName: string
  openViolations: number
  overdueViolations: number
  overdueAmount: number
  pendingApprovals: number
  /** Resident support tickets still open or in progress. */
  openTickets: number
  /** ARC applications submitted or in review, awaiting a board decision. */
  openArcRequests: number
  /** Resident-reported concerns awaiting board review. */
  openConcerns: number
  upcomingMeetings: string[]
}): Promise<string> {
  return runCloud(
    'You are the HOA Hub assistant. Write brief, actionable morning digests for HOA board members.',
    `HOA: ${params.hoaName}
Open violations: ${params.openViolations} (${params.overdueViolations} overdue)
Dues overdue: $${params.overdueAmount}
Items needing board approval: ${params.pendingApprovals}
Open resident support tickets: ${params.openTickets}
ARC applications awaiting review: ${params.openArcRequests}
Resident-reported concerns awaiting review: ${params.openConcerns}
Upcoming meetings: ${params.upcomingMeetings.join(', ') || 'none this week'}

Write a 3–5 sentence morning briefing. Lead with the most urgent item, and be
sure to state how many resident support tickets, ARC applications, and
resident-reported concerns are waiting on the board. Plain text only.`,
    { max_tokens: 260 },
  )
}
