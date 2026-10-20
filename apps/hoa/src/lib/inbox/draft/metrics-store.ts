/**
 * BL-101 A10 persistence: one audit_log row per approved AI reply draft
 * (action `inbox_draft_metrics`, numeric jsonb `metadata`), and the 30-day
 * read-back for the inbox card and the platform-admin aggregate.
 *
 * No migration: audit_log already has an org-scoped append-only insert
 * policy for board/admin (`user_id = auth.uid()`, migration 0063) and a
 * board/admin select policy, which is exactly who approves drafts and who
 * sees the card.
 *
 * Logs carry ids and Postgres codes only — never a body, subject, address
 * or PostgREST message (which can quote row values).
 */

import { chunk, readAll } from '@/lib/supabase/read-all'
import {
  DRAFT_METRICS_ACTION,
  DRAFT_METRICS_WINDOW_DAYS,
  draftMetricsAuditRow,
  parseDraftMetrics,
  summarizeDraftMetrics,
  type DraftMetrics,
  type DraftQualitySummary,
} from './metrics'

// Structural, so the user-bound client, the service-role client and test
// doubles all fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export async function recordDraftMetrics(
  db: Db,
  args: { orgId: string; userId: string; metrics: DraftMetrics },
): Promise<boolean> {
  try {
    const { error } = (await db.from('audit_log').insert(draftMetricsAuditRow(args))) as {
      error: { code?: string } | null
    }
    if (error) {
      console.error(`[inbox.draft-metrics] insert failed for draft ${args.metrics.draft_id}: ${error.code ?? 'no code'}`)
      return false
    }
    return true
  } catch (error) {
    console.error(
      `[inbox.draft-metrics] insert threw for draft ${args.metrics.draft_id}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return false
  }
}

export interface DraftQuality {
  summary: DraftQualitySummary
  /** Distinct orgs contributing — meaningful for the platform aggregate. */
  orgs: number
}

/**
 * Last-30-days metrics. With `orgId` every read is scoped to that org
 * (`audit_log.org_id`, `inbox_drafts.organization_id`) on top of RLS; the
 * platform-admin caller omits it and passes the service-role client.
 *
 * A draft approved and then undone inside the 30-second window was never
 * sent, so rows whose draft is now `cancelled` are dropped.
 *
 * Throws on a failed read (code only); callers decide whether to hide the
 * card.
 */
export async function loadDraftQuality(
  db: Db,
  opts: { orgId?: string; now?: Date } = {},
): Promise<DraftQuality> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - DRAFT_METRICS_WINDOW_DAYS * 86_400_000).toISOString()
  const onError = (e: { code?: string }) => new Error(`draft metrics read failed (${e.code ?? 'no code'})`)

  type AuditRow = { id: string; org_id: string | null; metadata: unknown }
  const auditRows = await readAll<AuditRow>((from, to) => {
    let q = db.from('audit_log').select('id, org_id, metadata').eq('action', DRAFT_METRICS_ACTION).gte('created_at', since)
    if (opts.orgId) q = q.eq('org_id', opts.orgId)
    return q.order('id', { ascending: true }).range(from, to)
  }, onError)

  const parsed: Array<{ orgId: string | null; metrics: DraftMetrics }> = []
  for (const row of auditRows) {
    const metrics = parseDraftMetrics(row.metadata)
    if (metrics) parsed.push({ orgId: row.org_id, metrics })
  }

  const cancelled = new Set<string>()
  for (const ids of chunk([...new Set(parsed.map((p) => p.metrics.draft_id))])) {
    let q = db.from('inbox_drafts').select('id').in('id', ids).eq('status', 'cancelled')
    if (opts.orgId) q = q.eq('organization_id', opts.orgId)
    const { data, error } = (await q) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
    if (error) throw onError(error)
    for (const row of data ?? []) cancelled.add(row.id)
  }

  // One row per draft: a re-approve after an undo writes a second row for
  // the same draft; the newest (highest seconds_to_approve) wins.
  const byDraft = new Map<string, { orgId: string | null; metrics: DraftMetrics }>()
  for (const p of parsed) {
    if (cancelled.has(p.metrics.draft_id)) continue
    const prior = byDraft.get(p.metrics.draft_id)
    if (!prior || p.metrics.seconds_to_approve > prior.metrics.seconds_to_approve) byDraft.set(p.metrics.draft_id, p)
  }
  const kept = [...byDraft.values()]
  return {
    summary: summarizeDraftMetrics(kept.map((k) => k.metrics)),
    orgs: new Set(kept.map((k) => k.orgId).filter(Boolean)).size,
  }
}
