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
  getStaleApprovalCount,
} from '@/lib/dashboard/queries'
import { getDashboardKpis } from '@/lib/dashboard/charts'
import {
  buildBoardSignals,
  STALE_APPROVAL_DAYS,
  type BoardSignal,
} from '@/lib/dashboard/board-signals'

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
  const [triage, approvals, nextMeeting, atRisk, lease, residentQueues, kpis, staleApprovals] =
    await Promise.all([
      getTriageSnapshot(supabase, org.id),
      getApprovalsInbox(org.id),
      getNextMeeting(org.id),
      getAtRiskThisWeek(org.id),
      getLeaseSummary(org.id),
      getResidentQueueCounts(org.id),
      getDashboardKpis(org.id),
      getStaleApprovalCount(org.id, STALE_APPROVAL_DAYS),
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

  // The two model calls are independent — neither consumes the other's
  // output — so they run concurrently. Serially they doubled the latency
  // of a button a board member is watching. Each keeps its own try/catch,
  // so one model failure still cannot take out the other half.
  const [suggestion, insights] = await Promise.all([
    buildSuggestion(org.name, triage, approvals.totalCount),
    buildInsights(org.name, {
      atRisk,
      staleApprovals,
      lease,
      residentQueues,
      kpis,
      triage,
    }),
  ])

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

/** The digest's one suggestion sentence, or null if the model is unusable. */
async function buildSuggestion(
  hoaName: string,
  triage: Awaited<ReturnType<typeof getTriageSnapshot>>,
  approvalsPending: number,
): Promise<string | null> {
  try {
    const raw = await generateDigestSuggestion({
      hoaName,
      needsReply: triage.needsReply.count,
      oldestWaitingDays: triage.needsReply.oldestWaitingDays,
      approvalsPending,
      threadSubjects: triage.threads.map((t) => t.subject ?? '(no subject)').slice(0, 5),
    })
    return acceptSuggestion(raw)
  } catch (err) {
    // Log the type only — never the model output, which renders thread
    // subjects.
    console.error(
      '[daily-digest] suggestion generation failed',
      err instanceof Error ? err.name : 'UnknownError',
    )
    return null
  }
}

/**
 * Rank the community's firing signals for the board.
 *
 * The model only ever sees `kind` and a finished headline, and only ever
 * returns `kind` and a clause. Headline, link and severity are re-attached
 * from OUR signal by kind, so every figure the board reads came out of
 * SQL. A model that names a kind we did not offer is dropped by
 * `acceptInsights` and lands nowhere.
 *
 * What the model may NOT do is suppress a red signal. It is asked to skip
 * what a manager handles routinely, which is a judgement worth having —
 * but a reply naming one `info` signal used to replace the whole list, so
 * an elapsed cure deadline could vanish from the card because the model
 * found the lease waiting list more interesting. Worse, a model that wrote
 * four good insights and ran long on all four produced zero accepted
 * entries, and four red findings disappeared on a formatting technicality.
 * Reds are therefore unioned back in unconditionally.
 */
async function buildInsights(
  hoaName: string,
  input: Parameters<typeof buildBoardSignals>[0],
): Promise<DigestBoardInsight[]> {
  const signals = buildBoardSignals(input)
  if (signals.length === 0) return []

  const withoutWhy = (signal: BoardSignal): DigestBoardInsight => ({ ...signal, why: null })

  let chosen: Array<{ kind: string; why: string }> = []
  try {
    const raw = await generateBoardInsights({
      hoaName,
      signals: signals.map(({ kind, headline }) => ({ kind, headline })),
    })
    chosen = acceptInsights(
      raw,
      signals.map((s) => s.kind),
    )
    if (chosen.length < Math.min(signals.length, MAX_INSIGHTS)) {
      // Visible in ops rather than invisible in the boardroom: this is how
      // a model that consistently runs long on `why` gets noticed.
      console.warn('[daily-digest] insights returned below capacity', {
        chosen: chosen.length,
        firing: signals.length,
      })
    }
  } catch (err) {
    // Log the type only — never the model output, which quotes community
    // detail back at us.
    console.error(
      '[daily-digest] insight generation failed',
      err instanceof Error ? err.name : 'UnknownError',
    )
  }

  const byKind = new Map(signals.map((s) => [s.kind, s]))
  const whyByKind = new Map(chosen.map((c) => [c.kind, c.why]))
  const picked = new Map<string, DigestBoardInsight>()

  // 1. Every red signal, carrying the model's clause where it wrote one.
  //    Inserted first so that when more findings are firing than the card
  //    can show, the four slots go to what is already breached — not to
  //    the info-level item the model happened to find interesting.
  for (const signal of signals) {
    if (signal.severity !== 'red') continue
    picked.set(signal.kind, { ...signal, why: whyByKind.get(signal.kind) ?? null })
  }

  // 2. The model's remaining picks, in the order it ranked them.
  for (const c of chosen) {
    const signal = byKind.get(c.kind as BoardSignal['kind'])
    if (signal && !picked.has(signal.kind)) picked.set(signal.kind, { ...signal, why: c.why })
  }

  // 3. Only when the model gave nothing usable do we fill the remaining
  //    slots ourselves. If it did answer, the shortlist is its judgement
  //    and padding it back out would discard exactly what we asked for.
  if (chosen.length === 0) {
    for (const signal of signals) {
      if (!picked.has(signal.kind)) picked.set(signal.kind, withoutWhy(signal))
    }
  }

  // Reds first regardless of how the model ordered its reply. Within a
  // severity band the model's ranking survives, because Array.sort is
  // stable — that ordering is the judgement the model was asked for.
  const order = { red: 0, amber: 1, info: 2 } as const
  return [...picked.values()]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, MAX_INSIGHTS)
}
