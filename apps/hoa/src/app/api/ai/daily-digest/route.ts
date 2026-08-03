import { NextResponse } from 'next/server'
import { generateDigestSuggestion, acceptSuggestion } from '@homeowner-portal/ai'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import {
  buildBullets,
  countNewSince,
  formatNextMeeting,
  readBaseline,
  todayISO,
  writeSnapshot,
} from '@/lib/dashboard/digest-facts'
import { getApprovalsInbox, getNextMeeting } from '@/lib/dashboard/queries'
import { getDashboardKpis } from '@/lib/dashboard/charts'

/**
 * Regenerates the digest's AI suggestion line.
 *
 * An AI outage is NOT an error here. The card's real content — the bullets
 * — is computed in SQL, so this always returns 200 with the facts and
 * simply omits the suggestion. The previous version returned 503 and the
 * card rendered a warning banner in place of content it already had.
 */
export async function POST() {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  const [triage, approvals, nextMeeting] = await Promise.all([
    getTriageSnapshot(supabase, org.id),
    getApprovalsInbox(org.id),
    getNextMeeting(org.id),
  ])

  const today = todayISO()
  const baseline = await readBaseline(supabase, org.id, today)
  const newSinceBaseline =
    baseline !== null ? await countNewSince(supabase, org.id, baseline.capturedAt) : null

  const bullets = buildBullets({
    newSinceBaseline,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting),
  })

  // Record today's numbers for tomorrow's comparison. Never blocks the
  // response — a failed write is logged inside writeSnapshot.
  const kpis = await getDashboardKpis(org.id)
  await writeSnapshot(supabase, org.id, today, {
    needsReply: triage.needsReply.count,
    oldestWaitingDays: triage.needsReply.oldestWaitingDays,
    untriaged: triage.untriaged.count,
    approvalsPending: approvals.totalCount,
    duesOutstandingUsd: Math.round(kpis.duesOutstandingUsd.value),
  })

  let suggestion: string | null = null
  try {
    const raw = await generateDigestSuggestion({
      hoaName: org.name,
      needsReply: triage.needsReply.count,
      oldestWaitingDays: triage.needsReply.oldestWaitingDays,
      approvalsPending: approvals.totalCount,
      threadSubjects: triage.threads.map((t) => t.subject ?? '(no subject)').slice(0, 5),
    })
    suggestion = acceptSuggestion(raw)
  } catch (err) {
    // Log the type only — never the model output, which renders thread
    // subjects.
    console.error(
      '[daily-digest] suggestion generation failed',
      err instanceof Error ? err.name : 'UnknownError',
    )
  }

  const generatedAt = new Date().toISOString()

  if (suggestion !== null) {
    const { error } = await supabase
      .from('hoa_digests')
      .upsert({ org_id: org.id, content: suggestion, generated_at: generatedAt })
    if (error) {
      // Persisting is a convenience, not the product. Never fail the
      // response over it.
      console.error('[daily-digest] upsert failed', { code: error.code, message: error.message })
    }
  }

  return NextResponse.json({ suggestion, bullets, generatedAt })
}
