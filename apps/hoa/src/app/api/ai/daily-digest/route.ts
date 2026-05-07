import { NextResponse } from 'next/server'
import { generateDailyDigest } from '@homeownerhub/ai'
import { getCurrentOrg } from '@/lib/orgs'
import { getDashboardStats } from '@/lib/dashboard/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// On-demand digest regeneration. The cron-driven version runs at 7am via
// Inngest (added in a later checkpoint); this endpoint backs the dashboard's
// "Refresh" button so a board member can grab a fresh summary mid-day.
export async function POST() {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const stats = await getDashboardStats(org.id)

  let content: string
  try {
    content = await generateDailyDigest({
      hoaName: org.name,
      openViolations: stats.openViolations,
      overdueViolations: stats.overdueViolations,
      overdueAmount: stats.overdueDuesAmount,
      pendingApprovals: stats.pendingApprovals,
      upcomingMeetings: [],
    })
  } catch (err) {
    console.error('[daily-digest] AI generation failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          'The AI service is not reachable right now. Try again in a few minutes, or write your own summary in the dashboard.',
      },
      { status: 503 },
    )
  }

  if (!content?.trim()) {
    return NextResponse.json({ error: 'empty_response' }, { status: 502 })
  }

  // Upsert into hoa_digests (org_id is PK, so this overwrites the previous digest).
  const supabase = await getSupabaseServerClient()
  const { error: upsertError } = await supabase
    .from('hoa_digests')
    .upsert({
      org_id: org.id,
      content: content.trim(),
      generated_at: new Date().toISOString(),
    })

  if (upsertError) {
    console.error('[daily-digest] upsert failed', upsertError)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ content: content.trim(), generatedAt: new Date().toISOString() })
}
