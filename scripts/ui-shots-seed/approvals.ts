import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for /approvals (BL-014), one per source, so the inbox renders
 * its busy state: a W18 proposed posting (with the W18 run whose notes the
 * inbox shows), a pending W3 violation draft, a compliant vendor prospect
 * (one-click approve) and a non-compliant vendor (review link).
 *
 * The W18 proposal points at a made-up bank transaction id, so approving it
 * in a shot session fails cleanly at the executor's re-validation — it can
 * never post. Idempotent (find-or-create); invented data only.
 */
export async function seed_approvals(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
  const DAY = 86_400_000

  const summary = 'Zelle DEMO-104-DUES: $425.00 received 2026-10-12 → assessment ui-shots'
  const { data: existing } = await db
    .from('approval_requests')
    .select('id, subject_id')
    .eq('organization_id', org)
    .eq('summary', summary)
    .eq('status', 'proposed')
    .limit(1)
  let txnId = (existing?.[0] as { subject_id: string } | undefined)?.subject_id
  if (!txnId) {
    txnId = randomUUID()
    const { error } = await db.from('approval_requests').insert({
      organization_id: org,
      workflow_id: 'W18',
      action_type: 'w18.cash_receipt',
      subject_type: 'bank_transaction',
      subject_id: txnId,
      payload: { demo: true },
      summary,
      amount: 425,
      proposed_at: iso(2 * DAY),
    })
    if (error) throw new Error(`approval_requests insert: ${error.code}`)
    const { error: runErr } = await db.from('ai_runs').insert({
      organization_id: org,
      workflow_id: 'W18',
      workflow_version: '1.0.0',
      prompt_version: 'ui-shots',
      model: 'deterministic',
      input: { bankTransactionId: txnId },
      input_hash: `ui-shots-w18-${txnId}`,
      output: {
        matchMethod: 'proposed_exact',
        confidence: 0.99,
        notes: 'exact match on memo_code=DEMO-104-DUES, amount within $0.5 — posting proposed, awaiting board/admin approval',
      },
      status: 'pending_human_approval',
      created_at: iso(2 * DAY),
    })
    if (runErr) throw new Error(`ai_runs W18 insert: ${runErr.code}`)
  }

  const w3Hash = 'ui-shots-w3-demo-draft'
  const { data: w3 } = await db.from('ai_runs').select('id').eq('organization_id', org).eq('input_hash', w3Hash).limit(1)
  if (!w3?.[0]) {
    const { error } = await db.from('ai_runs').insert({
      organization_id: org,
      workflow_id: 'W3',
      workflow_version: '1.0.0',
      prompt_version: 'ui-shots',
      model: 'demo',
      input: { violationType: 'landscaping', description: 'Hedge along the sample walkway exceeds the height limit.' },
      input_hash: w3Hash,
      output: {
        notice:
          'Dear homeowner, during the recent inspection we noted that the hedge along the front walkway exceeds the six-foot height limit set by the community standards. Please trim it within 14 days.',
        citedSection: 'CC&R §7.3(b)',
        recommendedSeverity: 'low',
        recommendedFineAmountCents: 2500,
        recommendedCurePeriodDays: 14,
        confidence: 'HIGH',
      },
      reasoning_trace: 'The reported height exceeds §7.3(b)’s six-foot limit; first notice, so a low severity and a 14-day cure.',
      status: 'pending_human_approval',
      created_at: iso(DAY),
    })
    if (error) throw new Error(`ai_runs W3 insert: ${error.code}`)
  }

  const { data: assoc } = await db.from('associations').select('id').eq('organization_id', org).order('name').limit(1)
  const associationId = (assoc?.[0] as { id: string } | undefined)?.id ?? null
  const vendors: { name: string; status: string; coi: string; deficiencies: { code: string; severity: string; detail: string }[] }[] = [
    { name: 'Sample Landscaping Co (demo)', status: 'prospect', coi: 'green', deficiencies: [] },
    {
      name: 'Demo Pool Services (demo)',
      status: 'active',
      coi: 'red',
      deficiencies: [{ code: 'gl_limit', severity: 'high', detail: 'General liability $500K; the association requires $1M.' }],
    },
  ]
  for (const v of vendors) {
    const { data: found } = await db.from('vendors').select('id').eq('organization_id', org).eq('legal_name', v.name).limit(1)
    let vendorId = (found?.[0] as { id: string } | undefined)?.id
    if (!vendorId) {
      const { data: row, error } = await db
        .from('vendors')
        .insert({ organization_id: org, legal_name: v.name, status: v.status, trades: ['landscaping'] })
        .select('id')
        .single()
      if (error || !row) throw new Error(`vendors insert: ${error?.code}`)
      vendorId = (row as { id: string }).id
      const { error: cErr } = await db.from('vendor_compliance').insert({
        organization_id: org,
        vendor_id: vendorId,
        association_id: associationId,
        coi_status: v.coi,
        deficiencies: v.deficiencies,
        last_reviewed_at: iso(3 * DAY),
      })
      if (cErr) throw new Error(`vendor_compliance insert: ${cErr.code}`)
    }
  }

  console.log('seed approvals: ok')
  return {}
}
