// BL-078 — bind a resident's pre-check run id before it is linked to their
// ARC application (and so into the board's W37 review input).
//
// createArcRequest takes `precheckRunId` from the browser. It is linked only
// when ALL hold:
//   1. an ai_runs row with that id exists in the submitter's org,
//      workflow W37, input.mode = 'precheck';
//   2. the BL-078 usage ledger (audit_log, action ai.usage.arc_precheck)
//      has a row by this same user in this org pointing at that run
//      (entity_type 'ai_run', entity_id = run id) — ai_runs itself has no
//      user column, so the ledger is what ties a run to a person.
// Otherwise the id is dropped silently: the application still submits, and
// the log line carries a reason code only.
//
// Service role: residents cannot read ai_runs or audit_log under RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { aiUsageAction } from '@/lib/api/ai-limits'

type Db = SupabaseClient<Database>

export const W37_ID = 'W37'

export type BindReason = 'ok' | 'none' | 'run_not_found' | 'not_owner' | 'read_failed'

export async function bindPrecheckRun(
  db: Db,
  args: { runId: string | null | undefined; orgId: string; userId: string },
): Promise<{ runId: string | null; reason: BindReason }> {
  const { runId, orgId, userId } = args
  if (!runId) return { runId: null, reason: 'none' }

  try {
    const run = await db
      .from('ai_runs')
      .select('id')
      .eq('id', runId)
      .eq('organization_id', orgId)
      .eq('workflow_id', W37_ID)
      .eq('input->>mode', 'precheck')
      .maybeSingle()
    if (run.error) return dropped('read_failed', run.error)
    if (!run.data) return dropped('run_not_found')

    const usage = await db
      .from('audit_log')
      .select('id')
      .eq('action', aiUsageAction('arc_precheck'))
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('entity_type', 'ai_run')
      .eq('entity_id', runId)
      .limit(1)
      .maybeSingle()
    if (usage.error) return dropped('read_failed', usage.error)
    if (!usage.data) return dropped('not_owner')

    return { runId, reason: 'ok' }
  } catch (err) {
    return dropped('read_failed', err)
  }
}

function dropped(reason: Exclude<BindReason, 'ok' | 'none'>, err?: unknown): { runId: null; reason: BindReason } {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : null
  console.warn('arc precheck run not linked', { reason, code })
  return { runId: null, reason }
}
