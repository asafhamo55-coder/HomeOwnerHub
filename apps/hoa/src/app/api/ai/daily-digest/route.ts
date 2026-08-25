import { NextResponse } from 'next/server'
import {
  generateDigestSuggestion,
  acceptSuggestion,
  generateBoardInsights,
  acceptInsights,
  MAX_INSIGHTS,
} from '@homeowner-portal/ai'
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
import {
  getApprovalsInbox,
  getAtRiskThisWeek,
  getLeaseSummary,
  getNextMeeting,
  getResidentQueueCounts,
} from '@/lib/dashboard/queries'
import { getDashboardKpis } from '@/lib/dashboard/charts'
import { buildBoardSignals, type BoardSignal } from '@/lib/dashboard/board-signals'

/** A board signal plus the model's reasoning, or null when it had none. */
type DigestBoardInsight = BoardSignal & { why: string | null }

/**
 * Regenerates the digest's AI suggestion line.
 *
 * An AI outage is NOT an error here. The card's real content — the bullets
 * and the board insights — is computed in SQL, so this always returns 200
 * with the facts and simply omits the suggestion. The previous version
 * returned 503 and the card rendered a warning banner in place of content
 * it already had.
 *
 * The insight list degrades the same way but one step further: with no
 * model, the top signals by severity still ship, each with `why: null`.
 * Losing the reasoning is a smaller loss than losing the finding.
 */
export async function POST() {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  const [triage, approvals, nextMeeting, atRisk, lease, residentQueues, kpis] =
    await Promise.all([
      getTriageSnapshot(supabase, org.id),
      getApprovalsInbox(org.id),
      getNextMeeting(org.id),
      getAtRiskThisWeek(org.id),
      getLeaseSummary(org.id),
      getResidentQueueCounts(org.id),
      getDashboardKpis(org.id),
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

  const insights = await buildInsights(org.name, {
    atRisk,
    approvals,
    lease,
    residentQueues,
    kpis,
    triage,
  })

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

  return NextResponse.json({ suggestion, bullets, insights, generatedAt })
}

/**
 * Rank the community's firing signals for the board.
 *
 * The model only ever sees `kind` and a finished headline, and only ever
 * returns `kind` and a clause. Headline, link and severity are re-attached
 * from OUR signal by kind, so every figure the board reads came out of
 * SQL. A model that names a kind we did not offer is dropped by
 * `acceptInsights` and lands nowhere.
 */
async function buildInsights(
  hoaName: string,
  input: Parameters<typeof buildBoardSignals>[0],
): Promise<DigestBoardInsight[]> {
  const signals = buildBoardSignals(input)
  if (signals.length === 0) return []

  const fallback: DigestBoardInsight[] = signals
    .slice(0, MAX_INSIGHTS)
    .map((signal) => ({ ...signal, why: null }))

  try {
    const raw = await generateBoardInsights({
      hoaName,
      signals: signals.map(({ kind, headline }) => ({ kind, headline })),
    })
    const chosen = acceptInsights(
      raw,
      signals.map((s) => s.kind),
    )
    if (chosen.length === 0) return fallback

    const byKind = new Map(signals.map((s) => [s.kind, s]))
    return chosen.flatMap((c) => {
      const signal = byKind.get(c.kind as BoardSignal['kind'])
      return signal ? [{ ...signal, why: c.why }] : []
    })
  } catch (err) {
    // Log the type only — never the model output, which quotes community
    // detail back at us.
    console.error(
      '[daily-digest] insight generation failed',
      err instanceof Error ? err.name : 'UnknownError',
    )
    return fallback
  }
}
