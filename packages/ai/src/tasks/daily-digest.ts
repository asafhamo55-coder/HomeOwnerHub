import { runCloud } from '../agents/cloud'

export async function generateDailyDigest(params: {
  hoaName: string
  openViolations: number
  overdueViolations: number
  overdueAmount: number
  pendingApprovals: number
  upcomingMeetings: string[]
}): Promise<string> {
  return runCloud(
    'You are the HOA Hub assistant. Write brief, actionable morning digests for HOA board members.',
    `HOA: ${params.hoaName}
Open violations: ${params.openViolations} (${params.overdueViolations} overdue)
Dues overdue: $${params.overdueAmount}
Items needing board approval: ${params.pendingApprovals}
Upcoming meetings: ${params.upcomingMeetings.join(', ') || 'none this week'}

Write a 2–4 sentence morning briefing. Lead with the most urgent item. Plain text only.`,
    { max_tokens: 200 },
  )
}
