import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseFloridaChapter } from '../../packages/workflows/src/W30-state-law-brain/sources/florida'
import { applyStateRulesToDraft, selectStateRules } from '../../packages/workflows/src/W3-violation-inspector/state-rules'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for /approvals (BL-014), one per source, so the inbox renders
 * its busy state: a W18 proposed posting (with the W18 run whose notes the
 * inbox shows), pending W3 violation drafts (one-click approve/reject,
 * BL-048), a compliant vendor prospect (approve or reject), a prospect
 * with gaps (reject or review) and a non-compliant active vendor (review).
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

  // BL-019: a W3 1.1.0 draft carrying its state rule set, assembled by the
  // real statute layer against the official FL fixture text (the demo org
  // is in FL), so /violations/approval-queue shows the rule panel with
  // validated quotes. Model prose is invented.
  const w3StatuteHash = 'ui-shots-w3-statute-draft'
  const { data: w3s } = await db.from('ai_runs').select('id').eq('organization_id', org).eq('input_hash', w3StatuteHash).limit(1)
  if (!w3s?.[0]) {
    const flText =
      parseFloridaChapter(
        readFileSync(path.resolve(__dirname, '../fixtures/state-law/flsenate-ch720-2026.html'), 'utf8'),
        2026,
      ).find((r) => r.code_citation === 'Fla. Stat. § 720.305')?.body ?? null
    const applied = applyStateRulesToDraft({
      rules: selectStateRules('FL'),
      requestedAction: { step: 'hearing_notice', hearingNoticeDays: 21 },
      modelNotice:
        'Dear homeowner, a boat trailer has been parked in the driveway of the sample lot for more than 72 hours, which the parking rules do not allow. Please move it to an approved storage location.',
      statuteText: flText,
      recommendedFineAmountCents: 5000,
    })
    const { error } = await db.from('ai_runs').insert({
      organization_id: org,
      workflow_id: 'W3',
      workflow_version: '1.1.0',
      prompt_version: 'ui-shots',
      model: 'demo',
      input: {
        violationType: 'trailer parking',
        description: 'Boat trailer parked in the sample driveway past the 72-hour limit.',
        requestedAction: { step: 'hearing_notice', hearingNoticeDays: 21 },
      },
      input_hash: w3StatuteHash,
      output: {
        notice: applied.notice,
        citedSection: 'Rules §4.2',
        citations: [],
        recommendedSeverity: 'medium',
        recommendedFineAmountCents: applied.recommendedFineAmountCents,
        recommendedCurePeriodDays: 14,
        confidence: 'MEDIUM',
        stateRules: applied.stateRules,
      },
      status: 'pending_human_approval',
      created_at: iso(DAY / 2),
    })
    if (error) throw new Error(`ai_runs W3 statute insert: ${error.code}`)
  }

  const { data: assoc } = await db.from('associations').select('id').eq('organization_id', org).order('name').limit(1)
  const associationId = (assoc?.[0] as { id: string } | undefined)?.id ?? null
  const vendors: { name: string; status: string; coi: string; deficiencies: { code: string; severity: string; detail: string }[] }[] = [
    { name: 'Sample Landscaping Co (demo)', status: 'prospect', coi: 'green', deficiencies: [] },
    // BL-048: a prospect that is not compliant yet — Reject plus Review, no Approve.
    {
      name: 'Demo Roofing Partners (demo)',
      status: 'prospect',
      coi: 'yellow',
      deficiencies: [{ code: 'coi_expiring', severity: 'medium', detail: 'Certificate of insurance expires in 20 days.' }],
    },
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

  // BL-021: two scanned-bill proposals — one complete (approvable, with a
  // medium-confidence total to check) and one whose vendor is not on file
  // (reject-only). Invented data; no file is stored, so the card says the
  // bill isn't available to view.
  if (associationId) {
    const { data: lv } = await db
      .from('vendors')
      .select('id, legal_name')
      .eq('organization_id', org)
      .eq('legal_name', 'Sample Landscaping Co (demo)')
      .limit(1)
    const vendor = lv?.[0] as { id: string; legal_name: string } | undefined
    const { data: acct } = await db
      .from('chart_of_accounts')
      .select('id, account_number, account_name')
      .eq('association_id', associationId)
      .eq('account_type', 'expense')
      .order('account_number')
      .limit(1)
    let account = acct?.[0] as { id: string; account_number: string; account_name: string } | undefined
    if (!account) {
      // One demo expense account so the complete bill can show its GL suggestion.
      const { data: made, error: acctErr } = await db
        .from('chart_of_accounts')
        .insert({
          organization_id: org,
          association_id: associationId,
          account_number: '5100',
          account_name: 'Landscaping (demo)',
          account_type: 'expense',
        })
        .select('id, account_number, account_name')
        .single()
      if (acctErr) throw new Error(`chart_of_accounts insert: ${acctErr.code}`)
      account = made as { id: string; account_number: string; account_name: string }
    }
    const accountField = (reasoning: string, confidence: string) =>
      account
        ? { accountId: account.id, label: `${account.account_number} — ${account.account_name}`, reasoning, confidence }
        : { accountId: null, label: null, reasoning: null, confidence: 'low' }
    const base = {
      kind: 'w36.ap_bill',
      version: 1,
      associationId,
      aiRunId: null,
      storagePath: null,
      contentType: 'application/pdf',
      source: 'pdf_text',
    }
    const bills = [
      {
        subject: 'b1110000-0000-5000-8000-000000000021',
        summary: `Bill from ${vendor?.legal_name ?? 'Sample Landscaping Co (demo)'} · #SL-2210`,
        amount: 1200,
        payload: {
          ...base,
          vendor: {
            extractedName: 'Sample Landscaping Co',
            nameConfidence: 'high',
            vendorId: vendor?.id ?? null,
            vendorLabel: vendor?.legal_name ?? null,
            match: vendor ? 'exact' : 'none',
            matchConfidence: vendor ? 'high' : 'low',
          },
          invoiceNumber: { value: 'SL-2210', confidence: 'high' },
          invoiceDate: { value: '2026-10-01', confidence: 'high' },
          dueDate: { value: '2026-10-31', confidence: 'high' },
          total: { value: 1200, confidence: 'medium' },
          lineItems: [
            { description: 'October mowing, 4 visits', amount: 900 },
            { description: 'Shrub trimming along the sample walkway', amount: 300 },
          ],
          expenseAccount: accountField('Mowing and trimming are grounds maintenance.', 'high'),
          warnings: [],
        },
      },
      {
        subject: 'b1110000-0000-5000-8000-000000000022',
        summary: 'Bill from Demo Fountain Repair (not on file) · #FR-88',
        amount: 459,
        payload: {
          ...base,
          vendor: {
            extractedName: 'Demo Fountain Repair',
            nameConfidence: 'high',
            vendorId: null,
            vendorLabel: null,
            match: 'none',
            matchConfidence: 'low',
          },
          invoiceNumber: { value: 'FR-88', confidence: 'high' },
          invoiceDate: { value: '2026-10-02', confidence: 'high' },
          dueDate: { value: null, confidence: 'low' },
          total: { value: 459, confidence: 'low' },
          lineItems: [
            { description: 'Pump replacement', amount: 400 },
            { description: 'Service call', amount: 95 },
          ],
          expenseAccount: accountField('Fountain upkeep is common-area maintenance.', 'medium'),
          warnings: ['The line items add up to $495.00, not the $459.00 total — check the total against the bill.'],
        },
      },
      // BL-059: a bill a board member already corrected (vendor picked,
      // total fixed) — the card shows "Edited" in place of the AI's flags.
      {
        subject: 'b1110000-0000-5000-8000-000000000023',
        summary: `Bill from ${vendor?.legal_name ?? 'an unknown vendor'} · #SL-2231`,
        amount: 350,
        payload: {
          ...base,
          vendor: {
            extractedName: 'Sample Lawn & Landscape',
            nameConfidence: 'medium',
            vendorId: vendor?.id ?? null,
            vendorLabel: vendor?.legal_name ?? null,
            match: vendor ? 'manual' : 'none',
            matchConfidence: vendor ? 'high' : 'low',
          },
          invoiceNumber: { value: 'SL-2231', confidence: 'high' },
          invoiceDate: { value: '2026-10-05', confidence: 'high' },
          dueDate: { value: '2026-11-04', confidence: 'medium' },
          total: { value: 350, confidence: 'high' },
          lineItems: [{ description: 'Irrigation repair, zone 3', amount: 350 }],
          expenseAccount: accountField('Irrigation repair is grounds maintenance.', 'high'),
          warnings: [],
          humanEdits: { fields: ['vendor', 'total'], editedBy: ctx.userId, editedAt: iso(DAY / 6) },
        },
      },
    ]
    for (const b of bills) {
      const { data: found } = await db
        .from('approval_requests')
        .select('id')
        .eq('action_type', 'w36.ap_bill')
        .eq('subject_id', b.subject)
        .limit(1)
      if (found?.[0]) {
        // Keep an earlier run's row current (e.g. the account above was added since).
        const { error } = await db
          .from('approval_requests')
          .update({ payload: b.payload, summary: b.summary, amount: b.amount })
          .eq('id', (found[0] as { id: string }).id)
          .eq('status', 'proposed')
        if (error) throw new Error(`approval_requests bill update: ${error.code}`)
        continue
      }
      const { error } = await db.from('approval_requests').insert({
        organization_id: org,
        workflow_id: 'W36',
        action_type: 'w36.ap_bill',
        subject_type: 'bill_document',
        subject_id: b.subject,
        payload: b.payload,
        summary: b.summary,
        amount: b.amount,
        proposed_at: iso(DAY / 3),
      })
      if (error) throw new Error(`approval_requests bill insert: ${error.code}`)
    }
  }

  console.log('seed approvals: ok')
  return {}
}
