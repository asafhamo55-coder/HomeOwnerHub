/**
 * scripts/seed-creek-valley-topup.ts
 *
 * Final gap-filler for the Creek Valley demo tenant. Closes the two
 * remaining gaps after seed-creek-valley-complete.ts:
 *   - budget_line_items for the 2026 budget (the original seed crashed
 *     mid-flight before these landed)
 *   - ai_runs sample records demonstrating Covenant Brain + other
 *     AI workflow usage
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ORG_ID = '36a5dabf-98cc-49a8-b91e-92828d431267'
const ASSOC_ID = '2877bdee-f236-4e23-9065-cec02d5b936d'

type Db = SupabaseClient<Database>

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await seedBudgetLineItems(db)
  await seedAiRuns(db)
  console.log('\n[topup] ✅ Done.')
}

async function seedBudgetLineItems(db: Db): Promise<void> {
  const { data: budget } = await db
    .from('budgets')
    .select('id')
    .eq('association_id', ASSOC_ID)
    .maybeSingle()
  if (!budget) {
    console.log('[budget_line_items] no budget found, skipping')
    return
  }
  const { count: existing } = await db
    .from('budget_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('budget_id', budget.id)
  if (existing && existing > 0) {
    console.log(`[budget_line_items] ${existing} present, skipping`)
    return
  }

  const { data: coa } = await db
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('association_id', ASSOC_ID)
  const acct = new Map((coa ?? []).map((c) => [c.account_number, c.id]))

  const lines = [
    { acct: '4000', amount: 540000, note: 'Assessment income: 135 × $333 × 12' },
    { acct: '4100', amount: 4500, note: 'Late fees, projected' },
    { acct: '4110', amount: 6000, note: 'Fines, projected' },
    { acct: '5000', amount: -84000, note: 'Verde Garden Co landscaping' },
    { acct: '5010', amount: -42000, note: 'Common-area utilities' },
    { acct: '5020', amount: -36000, note: 'Master insurance policy' },
    { acct: '5030', amount: 0, note: 'Self-managed — no management fee' },
    { acct: '5040', amount: -48000, note: 'Repairs & maintenance' },
    { acct: '5050', amount: -12000, note: 'Legal + accounting' },
    { acct: '5060', amount: -6000, note: 'Office, postage, software' },
    { acct: '5900', amount: -1800, note: 'Bank fees' },
  ]
  const inserts = lines
    .filter((l) => acct.has(l.acct))
    .map((l) => ({
      budget_id: budget.id,
      account_id: acct.get(l.acct)!,
      amount: l.amount,
      notes: l.note,
    }))
  const { error } = await db.from('budget_line_items').insert(inserts as never)
  if (error) throw new Error(`[budget_line_items]: ${error.message}`)
  console.log(`[budget_line_items] ✓ ${inserts.length} lines for 2026 budget`)
}

async function seedAiRuns(db: Db): Promise<void> {
  const { count: existing } = await db
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
  if (existing && existing > 0) {
    console.log(`[ai_runs] ${existing} present, skipping`)
    return
  }

  // 20 sample AI runs across the year — Covenant Brain queries,
  // Violation Drafter generations, Minutes Engine summaries.
  const runs = [
    { workflow: 'covenant_brain', when: '2025-03-12T14:22:00Z', q: 'Can residents paint their fence without ARC approval?', a: 'Per CC&R Section 3.4, fences require ARC approval for height (max 6\') and material. Repainting the fence in a non-approved color is a Section 3.5 violation; the approved palette is on file with the management office.', conf: 0.94 },
    { workflow: 'covenant_brain', when: '2025-04-08T19:15:00Z', q: 'What are quiet hours?', a: 'Per CC&R Section 6.1, quiet hours are 10:00 PM through 7:00 AM daily, with extended exceptions on New Year\'s Eve and Independence Day. Amplified sound is restricted at the property line during these hours.', conf: 0.98 },
    { workflow: 'covenant_brain', when: '2025-05-14T16:45:00Z', q: 'How many pets am I allowed?', a: 'Per CC&R Section 5.3, you may keep up to three dogs and three cats, or any combination not exceeding four total domestic pets weighing over ten pounds. Livestock, poultry, and exotic animals are prohibited.', conf: 0.97 },
    { workflow: 'covenant_brain', when: '2025-06-11T11:30:00Z', q: 'Are short-term rentals allowed?', a: 'No. Per CC&R Section 5.5, no lot or residence may be leased for a term of less than 180 consecutive days. Use as a vacation rental through Airbnb, Vrbo, or similar platforms is expressly prohibited. Violations may incur fines up to $500/day.', conf: 0.99 },
    { workflow: 'covenant_brain', when: '2025-07-22T20:01:00Z', q: 'Can I install a satellite dish?', a: 'Yes, subject to FCC OTARD Rule (47 C.F.R. Section 1.4000). Per CC&R Section 3.8, dishes one meter or less are permitted; the ARC strongly encourages but cannot require rear-roof or rear-yard placement.', conf: 0.96 },
    { workflow: 'violation_drafter', when: '2025-05-22T14:08:00Z', q: 'Fence at 14 Creek Valley Dr — material non-conforming', a: '[Drafted full notice citing Section 3.2 with 30-day cure deadline]', conf: 0.92, status: 'approved' },
    { workflow: 'violation_drafter', when: '2025-06-05T13:18:00Z', q: 'Lawn overgrown at 47 Creek Valley Dr', a: '[Drafted courtesy notice citing Section 4.1, 14-day cure]', conf: 0.95, status: 'approved' },
    { workflow: 'violation_drafter', when: '2025-09-09T10:55:00Z', q: 'Noise complaints — 34 Creek Valley Dr', a: '[Drafted Section 6.1 notice with $75 first-offense fine]', conf: 0.89, status: 'approved' },
    { workflow: 'minutes_engine', when: '2025-01-14T20:18:00Z', q: 'Process January 2025 board meeting recording', a: '[Transcript captured, 4 motions identified, 5 action items extracted]', conf: 0.91 },
    { workflow: 'minutes_engine', when: '2025-07-08T20:30:00Z', q: 'Process July 2025 special meeting (HVAC emergency)', a: '[Transcript captured, 4 motions identified including emergency ratification]', conf: 0.93 },
    { workflow: 'minutes_engine', when: '2025-10-14T21:42:00Z', q: 'Process October 2025 annual budget meeting', a: '[Long transcript, 5 motions, budget vote, dues increase vote, AI pilot adoption]', conf: 0.95 },
    { workflow: 'reserve_live', when: '2025-09-15T08:00:00Z', q: 'Recalculate reserve fund projection w/ revised clubhouse roof estimate', a: 'New 10-year reserve need: $438K (was $412K). Funded 70% target achievable by 2027 with 4.8% dues increase.', conf: 0.97 },
    { workflow: 'covenant_brain', when: '2025-11-03T15:20:00Z', q: 'Holiday decoration rules — when do they have to come down?', a: 'Per the Nov 2025 board update to Section 4.3 (effective Nov 25): winter holiday decor must be removed by January 15. Other seasonal decor: no later than 14 days after the holiday.', conf: 0.93 },
    { workflow: 'covenant_brain', when: '2025-12-08T09:42:00Z', q: 'Can I park my work van in the driveway?', a: 'Per CC&R Section 5.1, commercial vehicles with signage may not be regularly parked in driveways visible from the street between 6PM–7AM. Ladder racks count as signage.', conf: 0.91 },
    { workflow: 'arc_recommender', when: '2025-08-26T17:00:00Z', q: 'ARC packet for deck addition at 415 Park Ln', a: '[Drafted ARC recommendation: approve with conditions on stain color and rear setback per Section 3.6]', conf: 0.88, status: 'approved' },
    { workflow: 'budget_anomaly', when: '2025-09-30T03:00:00Z', q: 'Q3 budget vs actual variance check', a: 'Repairs & Maintenance is 28% over YTD budget due to July HVAC emergency. Recommend reviewing Q4 spend plan.', conf: 0.95 },
    { workflow: 'covenant_brain', when: '2026-01-22T13:11:00Z', q: 'What\'s our fine for first noise violation?', a: 'Per the Nov 2025 adopted fine schedule (replacing the 2018 version): $50 for first formal notice on a noise violation, $100 for repeat within 30 days, with $25–$200/day continuing fine depending on severity.', conf: 0.97 },
    { workflow: 'violation_drafter', when: '2026-04-22T13:08:00Z', q: 'Boat parked at 52 Creek Valley Dr — sidewalk obstruction', a: '[Drafted Section 5.3 notice with $75 fine, 14-day cure]', conf: 0.90, status: 'approved' },
    { workflow: 'covenant_brain', when: '2026-05-08T09:00:00Z', q: 'How do I file a formal complaint about my neighbor?', a: 'Per the Compliance Committee process: submit through the homeowner portal under Report → Resident Concern, include photos and dates. Anonymous complaints are accepted but harder to act on. The committee responds within 7 business days.', conf: 0.96 },
    { workflow: 'reserve_live', when: '2026-05-15T08:00:00Z', q: 'Refresh reserve fund projection — May 2026', a: 'Reserve balance: $98,212. On-track to 70% funded by Q3 2027. No new variance flags.', conf: 0.98 },
  ]

  const inserts = runs.map((r) => ({
    organization_id: ORG_ID,
    workflow_id: r.workflow,
    workflow_version: '1.0.0',
    prompt_version: 'v3',
    model: 'qwen-2.5-14b-instruct',
    input_hash: 'sha256:' + Math.random().toString(36).slice(2, 18),
    input: { query: r.q, tenant_id: ORG_ID },
    output: { answer: r.a },
    citations: r.workflow === 'covenant_brain'
      ? [{ doc: 'Creek Valley CC&R', section: 'multiple' }]
      : null,
    tokens_in: 800 + Math.floor(Math.random() * 1200),
    tokens_out: 200 + Math.floor(Math.random() * 600),
    latency_ms: 1200 + Math.floor(Math.random() * 4500),
    confidence: r.conf,
    status: 'completed',
    human_approved: r.status === 'approved' ? true : null,
    approved_at: r.status === 'approved' ? r.when : null,
    created_at: r.when,
  }))

  for (let i = 0; i < inserts.length; i += 20) {
    const { error } = await db
      .from('ai_runs')
      .insert(inserts.slice(i, i + 20) as never)
    if (error) throw new Error(`[ai_runs] ${i}: ${error.message}`)
  }
  console.log(`[ai_runs] ✓ ${inserts.length} sample workflow runs`)
}

main().catch((e) => {
  console.error('[topup] crashed:', e)
  process.exit(1)
})
