/**
 * scripts/seed-comm-templates.ts
 *
 * Idempotent seeder for the 8 default communication templates. Each is
 * org-wide (association_id = NULL) so every association can use them
 * without copying. Managers can override / clone per-association via the
 * /communications/templates UI later.
 *
 * Re-running for the same org skips templates whose (org, name) already
 * exist. Safe to run after each Resend domain change or env tweak.
 *
 *   pnpm seed:comm-templates
 *   SEED_ORG_NAME="Madison Park HOA" pnpm seed:comm-templates
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[seed-comm-templates] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

interface TemplateSeed {
  name: string
  category:
    | 'welcome'
    | 'dues'
    | 'meeting'
    | 'violation'
    | 'arc'
    | 'financial'
    | 'emergency'
    | 'announcement'
  description: string
  subject: string
  body_html: string
  body_text: string
  body_sms: string
  channels: string[]
  variables: string[]
}

const TEMPLATES: TemplateSeed[] = [
  // ─── 1. Welcome ────────────────────────────────────────────────────
  {
    name: 'Welcome to the Community',
    category: 'welcome',
    description: 'Sent when a new owner or tenant lands. Sets expectations + portal invite.',
    subject: 'Welcome to {{ association_name }}, {{ recipient_name }}!',
    body_html: `<p>Hi {{ recipient_name }},</p>
<p>Welcome to <strong>{{ association_name }}</strong>! We're glad to have you at your new home.</p>
<p>A few quick things to help you get settled:</p>
<ul>
  <li><strong>Resident portal</strong> — pay dues, see governing documents, submit ARC requests, and report issues. You'll receive a separate invitation email shortly.</li>
  <li><strong>Dues</strong> — assessments are billed monthly on the 1st and due by the 15th.</li>
  <li><strong>Governing documents</strong> — please review the CC&Rs and rules; they're posted in the portal.</li>
  <li><strong>Need help?</strong> Reply to this email anytime — it goes straight to the board's inbox.</li>
</ul>
<p>Welcome aboard!</p>
<p>— The board at {{ association_name }}</p>`,
    body_text: `Hi {{ recipient_name }},

Welcome to {{ association_name }}! We're glad to have you at your new home.

A few quick things to help you get settled:
- Resident portal: pay dues, see governing documents, submit ARC requests, and report issues. You'll receive a separate invitation email shortly.
- Dues: assessments are billed monthly on the 1st and due by the 15th.
- Governing documents: please review the CC&Rs and rules; they're posted in the portal.
- Need help? Reply to this email anytime — it goes straight to the board's inbox.

Welcome aboard!
— The board at {{ association_name }}`,
    body_sms: `Welcome to {{ association_name }}, {{ recipient_name }}! Check your email for your resident portal invitation.`,
    channels: ['email', 'portal'],
    variables: ['recipient_name', 'association_name'],
  },

  // ─── 2. Dues reminder ──────────────────────────────────────────────
  {
    name: 'Dues Reminder — Friendly',
    category: 'dues',
    description: 'Soft reminder ~5 days before due date. Pre-late, conversational.',
    subject: 'Friendly reminder: {{ amount_due }} due {{ due_date }}',
    body_html: `<p>Hi {{ recipient_name }},</p>
<p>Just a quick heads-up that your {{ period }} dues of <strong>{{ amount_due }}</strong> are due on <strong>{{ due_date }}</strong>.</p>
<p>You can pay through the resident portal — it takes about a minute. If you've already paid, please disregard this note.</p>
<p>Thanks!</p>
<p>— {{ association_name }}</p>`,
    body_text: `Hi {{ recipient_name }},

Just a quick heads-up that your {{ period }} dues of {{ amount_due }} are due on {{ due_date }}.

You can pay through the resident portal — it takes about a minute. If you've already paid, please disregard this note.

Thanks!
— {{ association_name }}`,
    body_sms: `Reminder: {{ amount_due }} dues due {{ due_date }}. Pay via the resident portal.`,
    channels: ['email', 'portal', 'sms'],
    variables: ['recipient_name', 'period', 'amount_due', 'due_date', 'association_name'],
  },

  // ─── 3. Late notice ────────────────────────────────────────────────
  {
    name: 'Dues — Past Due Notice',
    category: 'dues',
    description: 'First late notice after grace period. Firm but still cooperative.',
    subject: 'Past due: {{ amount_due }} for {{ period }}',
    body_html: `<p>Hi {{ recipient_name }},</p>
<p>Our records show your {{ period }} dues of <strong>{{ amount_due }}</strong> were due on {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.</p>
<p>Please pay the full balance of <strong>{{ balance_due }}</strong> as soon as possible through the resident portal, or contact us if you'd like to set up a payment plan.</p>
<p>If you've recently paid, please reply with the date and method so we can reconcile.</p>
<p>— {{ association_name }}</p>`,
    body_text: `Hi {{ recipient_name }},

Our records show your {{ period }} dues of {{ amount_due }} were due on {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.

Please pay the full balance of {{ balance_due }} as soon as possible through the resident portal, or contact us if you'd like to set up a payment plan.

If you've recently paid, please reply with the date and method so we can reconcile.

— {{ association_name }}`,
    body_sms: `Past due: {{ balance_due }} for {{ period }}. Pay via the portal or reply to discuss a plan.`,
    channels: ['email', 'portal', 'sms'],
    variables: [
      'recipient_name', 'period', 'amount_due', 'due_date',
      'late_fee', 'balance_due', 'association_name',
    ],
  },

  // ─── 4. Meeting notice ─────────────────────────────────────────────
  {
    name: 'Meeting Notice',
    category: 'meeting',
    description: 'Annual / board / special meeting notice. Mind state-law timing (CA 21+ days, etc.).',
    subject: '{{ meeting_type }}: {{ meeting_date }}',
    body_html: `<p>Dear residents of {{ association_name }},</p>
<p>You are hereby notified that a <strong>{{ meeting_type }}</strong> will be held on:</p>
<p style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #ccc;">
  <strong>{{ meeting_date }}</strong><br />
  {{ meeting_time }}<br />
  {{ meeting_location }}
</p>
<p>Agenda highlights:</p>
<div>{{ agenda_html }}</div>
<p>Owners are encouraged to attend. If you cannot attend in person, please contact the board to submit comments in advance.</p>
<p>— {{ association_name }} Board of Directors</p>`,
    body_text: `Dear residents of {{ association_name }},

You are hereby notified that a {{ meeting_type }} will be held on:

{{ meeting_date }}
{{ meeting_time }}
{{ meeting_location }}

Agenda highlights:
{{ agenda_text }}

Owners are encouraged to attend. If you cannot attend in person, please contact the board to submit comments in advance.

— {{ association_name }} Board of Directors`,
    body_sms: `{{ meeting_type }} on {{ meeting_date }} at {{ meeting_time }}. Details: {{ portal_link }}`,
    channels: ['email', 'portal', 'mail'],
    variables: [
      'association_name', 'meeting_type', 'meeting_date', 'meeting_time',
      'meeting_location', 'agenda_html', 'agenda_text', 'portal_link',
    ],
  },

  // ─── 5. Violation cure notice ──────────────────────────────────────
  {
    name: 'Violation — Cure Notice',
    category: 'violation',
    description: 'Formal violation notice with cure period. Cite the rule and the deadline.',
    subject: 'Notice of violation — {{ violation_summary }}',
    body_html: `<p>Dear {{ recipient_name }},</p>
<p>This letter serves as formal notice that <strong>{{ association_name }}</strong> has identified a violation of the governing documents at your unit, {{ unit_address }}.</p>
<p><strong>Violation:</strong> {{ violation_summary }}</p>
<p><strong>Governing document reference:</strong> {{ rule_citation }}</p>
<p><strong>Observed on:</strong> {{ observed_date }}</p>
<p>Please correct this issue by <strong>{{ cure_deadline }}</strong> (a {{ cure_period_days }}-day cure period). If the violation is not corrected by that date, the matter may be referred to the board for further action, which can include fines or a formal hearing.</p>
<p>If you believe this notice was issued in error, or if circumstances make cure by the deadline impractical, please contact us to discuss.</p>
<p>— {{ association_name }} Compliance</p>`,
    body_text: `Dear {{ recipient_name }},

This letter serves as formal notice that {{ association_name }} has identified a violation of the governing documents at your unit, {{ unit_address }}.

Violation: {{ violation_summary }}
Governing document reference: {{ rule_citation }}
Observed on: {{ observed_date }}

Please correct this issue by {{ cure_deadline }} (a {{ cure_period_days }}-day cure period). If the violation is not corrected by that date, the matter may be referred to the board for further action, which can include fines or a formal hearing.

If you believe this notice was issued in error, or if circumstances make cure by the deadline impractical, please contact us to discuss.

— {{ association_name }} Compliance`,
    body_sms: `Violation notice for your unit. Please correct by {{ cure_deadline }}. Details emailed.`,
    channels: ['email', 'mail'],
    variables: [
      'recipient_name', 'association_name', 'unit_address',
      'violation_summary', 'rule_citation', 'observed_date',
      'cure_deadline', 'cure_period_days',
    ],
  },

  // ─── 6. ARC approval ───────────────────────────────────────────────
  {
    name: 'ARC — Application Approved',
    category: 'arc',
    description: 'ARC committee approval — possibly with conditions.',
    subject: 'ARC application approved — {{ project_summary }}',
    body_html: `<p>Dear {{ recipient_name }},</p>
<p>Your architectural request for <strong>{{ project_summary }}</strong> at {{ unit_address }} has been <strong>approved</strong>.</p>
<p><strong>Approval conditions:</strong></p>
<div>{{ conditions_html }}</div>
<p>You may proceed with the work. Please note that:</p>
<ul>
  <li>Work must begin within {{ start_window_days }} days and complete within {{ completion_window_days }} days.</li>
  <li>Any deviation from the approved plans requires a new ARC request.</li>
  <li>The board reserves the right to inspect upon completion.</li>
</ul>
<p>If anything changes, please contact us before proceeding.</p>
<p>— {{ association_name }} Architectural Review Committee</p>`,
    body_text: `Dear {{ recipient_name }},

Your architectural request for {{ project_summary }} at {{ unit_address }} has been APPROVED.

Approval conditions:
{{ conditions_text }}

You may proceed with the work. Please note that:
- Work must begin within {{ start_window_days }} days and complete within {{ completion_window_days }} days.
- Any deviation from the approved plans requires a new ARC request.
- The board reserves the right to inspect upon completion.

If anything changes, please contact us before proceeding.

— {{ association_name }} Architectural Review Committee`,
    body_sms: `ARC approved: {{ project_summary }}. See email for conditions.`,
    channels: ['email', 'portal'],
    variables: [
      'recipient_name', 'association_name', 'unit_address', 'project_summary',
      'conditions_html', 'conditions_text',
      'start_window_days', 'completion_window_days',
    ],
  },

  // ─── 7. ARC denial ─────────────────────────────────────────────────
  {
    name: 'ARC — Application Denied',
    category: 'arc',
    description: 'ARC committee denial with reasoning + appeal path.',
    subject: 'ARC application denied — {{ project_summary }}',
    body_html: `<p>Dear {{ recipient_name }},</p>
<p>After review, the Architectural Review Committee has <strong>denied</strong> your request for <strong>{{ project_summary }}</strong> at {{ unit_address }}.</p>
<p><strong>Reason for denial:</strong></p>
<div>{{ denial_reason_html }}</div>
<p>You may submit a revised request that addresses these concerns. If you believe the denial is in error, you may appeal to the board within {{ appeal_window_days }} days of this notice.</p>
<p>We're happy to discuss alternatives — please reply or contact us if you'd like guidance.</p>
<p>— {{ association_name }} Architectural Review Committee</p>`,
    body_text: `Dear {{ recipient_name }},

After review, the Architectural Review Committee has DENIED your request for {{ project_summary }} at {{ unit_address }}.

Reason for denial:
{{ denial_reason_text }}

You may submit a revised request that addresses these concerns. If you believe the denial is in error, you may appeal to the board within {{ appeal_window_days }} days of this notice.

We're happy to discuss alternatives — please reply or contact us if you'd like guidance.

— {{ association_name }} Architectural Review Committee`,
    body_sms: `ARC denied: {{ project_summary }}. See email for reasoning + appeal path.`,
    channels: ['email', 'portal'],
    variables: [
      'recipient_name', 'association_name', 'unit_address', 'project_summary',
      'denial_reason_html', 'denial_reason_text', 'appeal_window_days',
    ],
  },

  // ─── 8. Generic announcement ───────────────────────────────────────
  {
    name: 'Community Announcement',
    category: 'announcement',
    description: 'Flexible all-purpose announcement (pool open, gate repair, newsletter).',
    subject: '{{ announcement_subject }}',
    body_html: `<p>Hi {{ recipient_name }},</p>
<div>{{ announcement_body_html }}</div>
<p>— {{ association_name }}</p>`,
    body_text: `Hi {{ recipient_name }},

{{ announcement_body_text }}

— {{ association_name }}`,
    body_sms: `{{ association_name }}: {{ announcement_sms }}`,
    channels: ['email', 'portal'],
    variables: [
      'recipient_name', 'association_name', 'announcement_subject',
      'announcement_body_html', 'announcement_body_text', 'announcement_sms',
    ],
  },
]

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const targetOrgName = process.env.SEED_ORG_NAME
  const { data: orgs } = await db
    .from('orgs')
    .select('id, name')
    .eq('hub_type', 'hoa')
    .order('created_at', { ascending: true })

  const targets = (orgs ?? []).filter((o) =>
    !targetOrgName || o.name === targetOrgName,
  )
  if (targets.length === 0) {
    console.error(`[seed-comm-templates] no HOA orgs found${targetOrgName ? ` matching "${targetOrgName}"` : ''}`)
    process.exit(1)
  }

  console.log(`[seed-comm-templates] seeding ${targets.length} org(s)`)

  for (const org of targets) {
    console.log(`\n[seed-comm-templates] ── ${org.name} (${org.id})`)
    await seedOrg(db, org.id)
  }

  console.log('\n[seed-comm-templates] ✅ done')
}

async function seedOrg(db: Db, orgId: string): Promise<void> {
  const { data: existing } = await db
    .from('communication_templates')
    .select('name')
    .eq('organization_id', orgId)
    .is('association_id', null)
  const have = new Set((existing ?? []).map((r) => r.name))

  let added = 0
  for (const t of TEMPLATES) {
    if (have.has(t.name)) {
      console.log(`  · template "${t.name}" already present`)
      continue
    }
    const { error } = await db.from('communication_templates').insert({
      organization_id: orgId,
      association_id: null,
      category: t.category,
      name: t.name,
      description: t.description,
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text,
      body_sms: t.body_sms,
      channels: t.channels,
      variables: t.variables,
      language: 'en',
    })
    if (error) {
      console.error(`  ✗ "${t.name}": ${error.message}`)
      continue
    }
    added += 1
    console.log(`  + ${t.name}`)
  }
  console.log(`  ${added} added`)
}

main().catch((err) => {
  console.error('[seed-comm-templates] crashed:', err)
  process.exit(1)
})
