-- seed-communication-templates-originals.sql
--
-- Adds the 8 ORIGINAL templates from scripts/seed-comm-templates.ts
-- (welcome, dues×2, meeting, violation, arc×2, announcement) to
-- Madison Park org. They were never run for this tenant because the
-- TS script is local-only — this SQL version makes them prod-installable
-- via the Supabase SQL editor.
--
-- Idempotent: WHERE NOT EXISTS keyed on (organization_id, name). Safe
-- to re-run; safe to run after seed-communication-templates-fill-gaps.sql
-- (the two together produce 17 total templates).

WITH originals AS (
  SELECT * FROM (VALUES
    -- ─── 1. Welcome ──────────────────────────────────────────────────
    (
      'welcome',
      'Welcome to the Community',
      'Sent when a new owner or tenant lands. Sets expectations + portal invite.',
      'Welcome to {{ association_name }}, {{ recipient_name }}!',
      $$<p>Hi {{ recipient_name }},</p>
<p>Welcome to <strong>{{ association_name }}</strong>! We're glad to have you at your new home.</p>
<p>A few quick things to help you get settled:</p>
<ul>
  <li><strong>Resident portal</strong> — pay dues, see governing documents, submit ARC requests, and report issues. You'll receive a separate invitation email shortly.</li>
  <li><strong>Dues</strong> — assessments are billed monthly on the 1st and due by the 15th.</li>
  <li><strong>Governing documents</strong> — please review the CC&Rs and rules; they're posted in the portal.</li>
  <li><strong>Need help?</strong> Reply to this email anytime — it goes straight to the board's inbox.</li>
</ul>
<p>Welcome aboard!</p>
<p>— The board at {{ association_name }}</p>$$,
      $$Hi {{ recipient_name }},

Welcome to {{ association_name }}! We're glad to have you at your new home.

A few quick things to help you get settled:
- Resident portal: pay dues, see governing documents, submit ARC requests, and report issues. You'll receive a separate invitation email shortly.
- Dues: assessments are billed monthly on the 1st and due by the 15th.
- Governing documents: please review the CC&Rs and rules; they're posted in the portal.
- Need help? Reply to this email anytime — it goes straight to the board's inbox.

Welcome aboard!
— The board at {{ association_name }}$$,
      'Welcome to {{ association_name }}, {{ recipient_name }}! Check your email for your resident portal invitation.',
      ARRAY['email', 'portal']::text[],
      'recipient_name,association_name'
    ),

    -- ─── 2. Dues reminder ────────────────────────────────────────────
    (
      'dues',
      'Dues Reminder — Friendly',
      'Soft reminder ~5 days before due date. Pre-late, conversational.',
      'Friendly reminder: {{ amount_due }} due {{ due_date }}',
      $$<p>Hi {{ recipient_name }},</p>
<p>Just a quick heads-up that your {{ period }} dues of <strong>{{ amount_due }}</strong> are due on <strong>{{ due_date }}</strong>.</p>
<p>You can pay through the resident portal — it takes about a minute. If you've already paid, please disregard this note.</p>
<p>Thanks!</p>
<p>— {{ association_name }}</p>$$,
      $$Hi {{ recipient_name }},

Just a quick heads-up that your {{ period }} dues of {{ amount_due }} are due on {{ due_date }}.

You can pay through the resident portal — it takes about a minute. If you've already paid, please disregard this note.

Thanks!
— {{ association_name }}$$,
      'Reminder: {{ amount_due }} dues due {{ due_date }}. Pay via the resident portal.',
      ARRAY['email', 'portal', 'sms']::text[],
      'recipient_name,period,amount_due,due_date,association_name'
    ),

    -- ─── 3. Late notice ──────────────────────────────────────────────
    (
      'dues',
      'Dues — Past Due Notice',
      'First late notice after grace period. Firm but still cooperative.',
      'Past due: {{ amount_due }} for {{ period }}',
      $$<p>Hi {{ recipient_name }},</p>
<p>Our records show your {{ period }} dues of <strong>{{ amount_due }}</strong> were due on {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.</p>
<p>Please pay the full balance of <strong>{{ balance_due }}</strong> as soon as possible through the resident portal, or contact us if you'd like to set up a payment plan.</p>
<p>If you've recently paid, please reply with the date and method so we can reconcile.</p>
<p>— {{ association_name }}</p>$$,
      $$Hi {{ recipient_name }},

Our records show your {{ period }} dues of {{ amount_due }} were due on {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.

Please pay the full balance of {{ balance_due }} as soon as possible through the resident portal, or contact us if you'd like to set up a payment plan.

If you've recently paid, please reply with the date and method so we can reconcile.

— {{ association_name }}$$,
      'Past due: {{ balance_due }} for {{ period }}. Pay via the portal or reply to discuss a plan.',
      ARRAY['email', 'portal', 'sms']::text[],
      'recipient_name,period,amount_due,due_date,late_fee,balance_due,association_name'
    ),

    -- ─── 4. Meeting notice ───────────────────────────────────────────
    (
      'meeting',
      'Meeting Notice',
      'Annual / board / special meeting notice. Mind state-law timing (CA 21+ days, etc.).',
      '{{ meeting_type }}: {{ meeting_date }}',
      $$<p>Dear residents of {{ association_name }},</p>
<p>You are hereby notified that a <strong>{{ meeting_type }}</strong> will be held on:</p>
<p style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #ccc;">
  <strong>{{ meeting_date }}</strong><br />
  {{ meeting_time }}<br />
  {{ meeting_location }}
</p>
<p>Agenda highlights:</p>
<div>{{ agenda_html }}</div>
<p>Owners are encouraged to attend. If you cannot attend in person, please contact the board to submit comments in advance.</p>
<p>— {{ association_name }} Board of Directors</p>$$,
      $$Dear residents of {{ association_name }},

You are hereby notified that a {{ meeting_type }} will be held on:

{{ meeting_date }}
{{ meeting_time }}
{{ meeting_location }}

Agenda highlights:
{{ agenda_text }}

Owners are encouraged to attend. If you cannot attend in person, please contact the board to submit comments in advance.

— {{ association_name }} Board of Directors$$,
      '{{ meeting_type }} on {{ meeting_date }} at {{ meeting_time }}. Details: {{ portal_link }}',
      ARRAY['email', 'portal', 'mail']::text[],
      'association_name,meeting_type,meeting_date,meeting_time,meeting_location,agenda_html,agenda_text,portal_link'
    ),

    -- ─── 5. Violation cure notice ────────────────────────────────────
    (
      'violation',
      'Violation — Cure Notice',
      'Formal violation notice with cure period. Cite the rule and the deadline.',
      'Notice of violation — {{ violation_summary }}',
      $$<p>Dear {{ recipient_name }},</p>
<p>This letter serves as formal notice that <strong>{{ association_name }}</strong> has identified a violation of the governing documents at your unit, {{ unit_address }}.</p>
<p><strong>Violation:</strong> {{ violation_summary }}</p>
<p><strong>Governing document reference:</strong> {{ rule_citation }}</p>
<p><strong>Observed on:</strong> {{ observed_date }}</p>
<p>Please correct this issue by <strong>{{ cure_deadline }}</strong> (a {{ cure_period_days }}-day cure period). If the violation is not corrected by that date, the matter may be referred to the board for further action, which can include fines or a formal hearing.</p>
<p>If you believe this notice was issued in error, or if circumstances make cure by the deadline impractical, please contact us to discuss.</p>
<p>— {{ association_name }} Compliance</p>$$,
      $$Dear {{ recipient_name }},

This letter serves as formal notice that {{ association_name }} has identified a violation of the governing documents at your unit, {{ unit_address }}.

Violation: {{ violation_summary }}
Governing document reference: {{ rule_citation }}
Observed on: {{ observed_date }}

Please correct this issue by {{ cure_deadline }} (a {{ cure_period_days }}-day cure period). If the violation is not corrected by that date, the matter may be referred to the board for further action, which can include fines or a formal hearing.

If you believe this notice was issued in error, or if circumstances make cure by the deadline impractical, please contact us to discuss.

— {{ association_name }} Compliance$$,
      'Violation notice for your unit. Please correct by {{ cure_deadline }}. Details emailed.',
      ARRAY['email', 'mail']::text[],
      'recipient_name,association_name,unit_address,violation_summary,rule_citation,observed_date,cure_deadline,cure_period_days'
    ),

    -- ─── 6. ARC approval ─────────────────────────────────────────────
    (
      'arc',
      'ARC — Application Approved',
      'ARC committee approval — possibly with conditions.',
      'ARC application approved — {{ project_summary }}',
      $$<p>Dear {{ recipient_name }},</p>
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
<p>— {{ association_name }} Architectural Review Committee</p>$$,
      $$Dear {{ recipient_name }},

Your architectural request for {{ project_summary }} at {{ unit_address }} has been APPROVED.

Approval conditions:
{{ conditions_text }}

You may proceed with the work. Please note that:
- Work must begin within {{ start_window_days }} days and complete within {{ completion_window_days }} days.
- Any deviation from the approved plans requires a new ARC request.
- The board reserves the right to inspect upon completion.

If anything changes, please contact us before proceeding.

— {{ association_name }} Architectural Review Committee$$,
      'ARC approved: {{ project_summary }}. See email for conditions.',
      ARRAY['email', 'portal']::text[],
      'recipient_name,association_name,unit_address,project_summary,conditions_html,conditions_text,start_window_days,completion_window_days'
    ),

    -- ─── 7. ARC denial ───────────────────────────────────────────────
    (
      'arc',
      'ARC — Application Denied',
      'ARC committee denial with reasoning + appeal path.',
      'ARC application denied — {{ project_summary }}',
      $$<p>Dear {{ recipient_name }},</p>
<p>After review, the Architectural Review Committee has <strong>denied</strong> your request for <strong>{{ project_summary }}</strong> at {{ unit_address }}.</p>
<p><strong>Reason for denial:</strong></p>
<div>{{ denial_reason_html }}</div>
<p>You may submit a revised request that addresses these concerns. If you believe the denial is in error, you may appeal to the board within {{ appeal_window_days }} days of this notice.</p>
<p>We're happy to discuss alternatives — please reply or contact us if you'd like guidance.</p>
<p>— {{ association_name }} Architectural Review Committee</p>$$,
      $$Dear {{ recipient_name }},

After review, the Architectural Review Committee has DENIED your request for {{ project_summary }} at {{ unit_address }}.

Reason for denial:
{{ denial_reason_text }}

You may submit a revised request that addresses these concerns. If you believe the denial is in error, you may appeal to the board within {{ appeal_window_days }} days of this notice.

We're happy to discuss alternatives — please reply or contact us if you'd like guidance.

— {{ association_name }} Architectural Review Committee$$,
      'ARC denied: {{ project_summary }}. See email for reasoning + appeal path.',
      ARRAY['email', 'portal']::text[],
      'recipient_name,association_name,unit_address,project_summary,denial_reason_html,denial_reason_text,appeal_window_days'
    ),

    -- ─── 8. Generic announcement ─────────────────────────────────────
    (
      'announcement',
      'Community Announcement',
      'Flexible all-purpose announcement (pool open, gate repair, newsletter).',
      '{{ announcement_subject }}',
      $$<p>Hi {{ recipient_name }},</p>
<div>{{ announcement_body_html }}</div>
<p>— {{ association_name }}</p>$$,
      $$Hi {{ recipient_name }},

{{ announcement_body_text }}

— {{ association_name }}$$,
      '{{ association_name }}: {{ announcement_sms }}',
      ARRAY['email', 'portal']::text[],
      'recipient_name,association_name,announcement_subject,announcement_body_html,announcement_body_text,announcement_sms'
    )
  ) AS t(category, name, description, subject, body_html, body_text, body_sms, channels, variables_csv)
)
INSERT INTO public.communication_templates
  (organization_id, association_id, category, name, description, subject,
   body_html, body_text, body_sms, channels, variables, language, is_active)
SELECT
  'a4906f16-baf3-4232-a2bd-a78ea432ad86'::uuid,
  NULL,
  t.category,
  t.name,
  t.description,
  t.subject,
  t.body_html,
  t.body_text,
  t.body_sms,
  t.channels,
  (SELECT jsonb_agg(jsonb_build_object('name', v))
     FROM regexp_split_to_table(t.variables_csv, ',') AS v),
  'en',
  true
FROM originals t
WHERE NOT EXISTS (
  SELECT 1 FROM public.communication_templates ct
  WHERE ct.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
    AND ct.name = t.name
);

-- Verify after running this + the fill-gaps SQL:
--   SELECT category, COUNT(*) AS templates
--     FROM public.communication_templates
--    WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND is_active
--    GROUP BY category
--    ORDER BY category;
--
-- Expect total of 17 across 8 categories.
