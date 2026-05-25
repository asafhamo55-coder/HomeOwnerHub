-- seed-communication-templates-fill-gaps.sql
--
-- Adds templates for the categories currently empty in Madison Park
-- (financial, emergency) and thickens the thin ones (welcome for
-- tenants, violation fine + escalation, ARC received, meeting follow-up).
--
-- Idempotent: WHERE NOT EXISTS keyed on (organization_id, name) so
-- re-runs only insert templates that aren't already there. Won't
-- duplicate the 8 already seeded by scripts/seed-comm-templates.ts.
--
-- Scope: Madison Park org (a4906f16-...). To extend to other orgs,
-- change the org_id in the WHERE clause at the bottom.
--
-- All bodies use {{merge_fields}} consistent with the existing
-- templates so they work with the same rendering pipeline.

WITH new_templates AS (
  SELECT * FROM (VALUES
    -- ─── welcome: tenant variant ─────────────────────────────────────
    (
      'welcome',
      'Welcome — Tenant',
      'Sent to a new tenant after they''re registered as a resident.',
      'Welcome to {{association_name}}, {{recipient_name}}',
      '<p>Hi {{recipient_name}},</p><p>Welcome to {{association_name}}. This email is for residents who rent here — we keep a separate channel for you so you get information relevant to renters (community rules, amenity hours, emergency contacts) without the homeowner-specific items.</p><p><strong>Your address:</strong> {{property_address}}<br><strong>Your landlord:</strong> on file with the association</p><p><strong>Quick links:</strong></p><ul><li>Resident portal: {{portal_url}}</li><li>Community rules: in the resident portal under "Governing Documents"</li><li>Submit a maintenance request or report a violation: in the resident portal</li></ul><p>If anything''s unclear, reply to this email and a board member will get back to you.</p><p>— The {{association_name}} board</p>',
      $$Welcome to {{association_name}}, {{recipient_name}}.

This email is for residents who rent here — we keep a separate channel for you so you get information relevant to renters (community rules, amenity hours, emergency contacts) without the homeowner-specific items.

Your address: {{property_address}}
Your landlord: on file with the association

Quick links:
- Resident portal: {{portal_url}}
- Community rules: in the resident portal under "Governing Documents"
- Submit a maintenance request or report a violation: in the resident portal

Reply to this email if anything's unclear.

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,property_address,portal_url'
    ),

    -- ─── meeting: follow-up after the meeting ────────────────────────
    (
      'meeting',
      'Meeting Recap',
      'Sent after a board / member meeting with the minutes link and any action items.',
      '{{association_name}} — Recap of {{meeting_date}} meeting',
      '<p>Hi {{recipient_name}},</p><p>Thanks for attending the {{meeting_date}} {{meeting_type}} meeting (or for letting the board represent you). Here''s what happened:</p><p><strong>Key decisions</strong></p><ul><li>{{decisions_summary}}</li></ul><p><strong>Action items</strong></p><ul><li>{{action_items_summary}}</li></ul><p><strong>Full minutes:</strong> {{minutes_url}}</p><p>Reply with questions or corrections within 7 days — the minutes are open for resident input before being finalized at the next meeting.</p><p>— The {{association_name}} board</p>',
      $$Hi {{recipient_name}},

Thanks for attending the {{meeting_date}} {{meeting_type}} meeting (or for letting the board represent you). Here's what happened:

Key decisions:
- {{decisions_summary}}

Action items:
- {{action_items_summary}}

Full minutes: {{minutes_url}}

Reply with questions or corrections within 7 days — minutes are open for input before being finalized at the next meeting.

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,meeting_date,meeting_type,decisions_summary,action_items_summary,minutes_url'
    ),

    -- ─── violation: fine assessed ────────────────────────────────────
    (
      'violation',
      'Violation — Fine Assessed',
      'Sent when a violation''s cure period has passed without resolution and a fine is being applied.',
      '{{association_name}} — Fine assessed on {{property_address}}',
      '<p>Hi {{recipient_name}},</p><p>On {{notice_sent_date}} we sent a notice about {{violation_type}} at {{property_address}}. The cure period of {{cure_period_days}} days has now passed without the issue being resolved, so per the governing documents a fine of <strong>${{fine_amount}}</strong> is being assessed.</p><p><strong>What''s next:</strong></p><ol><li>The fine appears on your next dues statement.</li><li>You can still resolve the underlying issue at any time — once it''s cured the board will not apply additional fines.</li><li>If you believe the fine was issued in error, you have 14 days to request a hearing. Reply to this email.</li></ol><p><strong>Reference:</strong> {{ccr_section}}</p><p>— The {{association_name}} board</p>',
      $$Hi {{recipient_name}},

On {{notice_sent_date}} we sent a notice about {{violation_type}} at {{property_address}}. The cure period of {{cure_period_days}} days has now passed without the issue being resolved, so per the governing documents a fine of \${{fine_amount}} is being assessed.

What's next:
1. The fine appears on your next dues statement.
2. You can still resolve the underlying issue at any time — once it's cured the board will not apply additional fines.
3. If you believe the fine was issued in error, you have 14 days to request a hearing. Reply to this email.

Reference: {{ccr_section}}

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,property_address,violation_type,notice_sent_date,cure_period_days,fine_amount,ccr_section'
    ),

    -- ─── violation: cured / closed ───────────────────────────────────
    (
      'violation',
      'Violation — Cured',
      'Sent when a violation has been resolved and the matter is closed.',
      'Thanks for resolving the {{violation_type}} at {{property_address}}',
      '<p>Hi {{recipient_name}},</p><p>The {{violation_type}} at {{property_address}} has been resolved and the matter is now closed. Thank you for taking action.</p><p>No further communication on this issue. The notice will remain in the association''s records for reference but no fines are owed.</p><p>— The {{association_name}} board</p>',
      $$Hi {{recipient_name}},

The {{violation_type}} at {{property_address}} has been resolved and the matter is now closed. Thank you for taking action.

No further communication on this issue. The notice will remain in the association's records for reference but no fines are owed.

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,property_address,violation_type'
    ),

    -- ─── arc: application received ───────────────────────────────────
    (
      'arc',
      'ARC — Application Received',
      'Auto-sent confirmation when a homeowner submits an ARC (architectural review) application.',
      'We received your ARC application for {{property_address}}',
      '<p>Hi {{recipient_name}},</p><p>Thanks for submitting your ARC application for {{property_address}}. We have it on file and the architectural review committee will review it within {{review_window_days}} days.</p><p><strong>What you submitted:</strong></p><ul><li>Project type: {{project_type}}</li><li>Description: {{project_description}}</li></ul><p><strong>What happens next:</strong></p><ol><li>The ARC reviews your application — typically at the next monthly meeting.</li><li>You''ll get a separate email with the decision (approved, denied, or "more info needed").</li><li>Do not start construction until you''ve received an approval email.</li></ol><p>Status link: {{arc_url}}</p><p>— The {{association_name}} ARC</p>',
      $$Hi {{recipient_name}},

Thanks for submitting your ARC application for {{property_address}}. We have it on file and the architectural review committee will review it within {{review_window_days}} days.

What you submitted:
- Project type: {{project_type}}
- Description: {{project_description}}

What happens next:
1. The ARC reviews your application — typically at the next monthly meeting.
2. You'll get a separate email with the decision (approved, denied, or "more info needed").
3. Do not start construction until you've received an approval email.

Status link: {{arc_url}}

— The {{association_name}} ARC$$,
      NULL,
      'recipient_name,association_name,property_address,project_type,project_description,review_window_days,arc_url'
    ),

    -- ─── financial: annual budget summary ────────────────────────────
    (
      'financial',
      'Annual Budget Summary',
      'Sent annually with the board-approved budget for the coming year.',
      '{{association_name}} — {{fiscal_year}} budget summary',
      '<p>Hi {{recipient_name}},</p><p>The board has approved the {{fiscal_year}} budget for {{association_name}}. Here''s the high-level summary:</p><p><strong>Total operating budget:</strong> ${{total_budget}}<br><strong>Reserve contribution:</strong> ${{reserve_contribution}}<br><strong>Assessment per door:</strong> ${{assessment_per_door}} per {{assessment_cadence}}</p><p><strong>Major categories:</strong></p><ul><li>{{category_breakdown}}</li></ul><p>The full budget document with line-item detail is in the resident portal under "Governing Documents → Financials". Questions? The next board meeting is {{next_meeting_date}} — bring them there.</p><p>— The {{association_name}} board</p>',
      $$Hi {{recipient_name}},

The board has approved the {{fiscal_year}} budget for {{association_name}}. Here's the high-level summary:

Total operating budget: \${{total_budget}}
Reserve contribution: \${{reserve_contribution}}
Assessment per door: \${{assessment_per_door}} per {{assessment_cadence}}

Major categories:
- {{category_breakdown}}

The full budget document with line-item detail is in the resident portal under "Governing Documents → Financials". Questions? Next board meeting is {{next_meeting_date}}.

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,fiscal_year,total_budget,reserve_contribution,assessment_per_door,assessment_cadence,category_breakdown,next_meeting_date'
    ),

    -- ─── financial: special assessment notice ────────────────────────
    (
      'financial',
      'Special Assessment Notice',
      'Sent when the board passes a special (one-time) assessment outside the normal dues cycle.',
      '{{association_name}} — Special assessment: {{assessment_purpose}}',
      '<p>Hi {{recipient_name}},</p><p>At the {{vote_date}} meeting the board passed a special assessment to fund <strong>{{assessment_purpose}}</strong>.</p><p><strong>Your assessment:</strong> ${{amount_per_door}}<br><strong>Due date:</strong> {{due_date}}<br><strong>Payment plan available:</strong> {{payment_plan_details}}</p><p><strong>Why this is needed:</strong></p><p>{{rationale}}</p><p>Special assessments require a {{vote_threshold}} vote of the board (or membership, depending on the governing documents). The minutes from the {{vote_date}} meeting are in the portal — see "Documents → Meeting Minutes".</p><p>Questions? Reply to this email or attend the next board meeting on {{next_meeting_date}}.</p><p>— The {{association_name}} board</p>',
      $$Hi {{recipient_name}},

At the {{vote_date}} meeting the board passed a special assessment to fund {{assessment_purpose}}.

Your assessment: \${{amount_per_door}}
Due date: {{due_date}}
Payment plan available: {{payment_plan_details}}

Why this is needed:
{{rationale}}

Special assessments require a {{vote_threshold}} vote of the board (or membership, depending on the governing documents). The minutes from the {{vote_date}} meeting are in the portal — see "Documents → Meeting Minutes".

Questions? Reply to this email or attend the next board meeting on {{next_meeting_date}}.

— The {{association_name}} board$$,
      NULL,
      'recipient_name,association_name,vote_date,assessment_purpose,amount_per_door,due_date,payment_plan_details,rationale,vote_threshold,next_meeting_date'
    ),

    -- ─── emergency: weather / severe event ───────────────────────────
    (
      'emergency',
      'Emergency — Weather Alert',
      'Urgent broadcast for severe weather (storm, freeze, heat). Sent to all residents.',
      '⚠️ {{association_name}} URGENT: {{weather_event}} — {{action_summary}}',
      '<p><strong>This is an urgent community notice from {{association_name}}.</strong></p><p>A {{weather_event}} is expected to affect our area starting {{event_start_time}}. Please take the following precautions:</p><ul><li>{{action_items}}</li></ul><p><strong>Community amenities affected:</strong> {{amenities_status}}</p><p><strong>Emergency contacts:</strong></p><ul><li>Property emergencies (water main, downed tree blocking road): {{property_emergency_phone}}</li><li>Life-threatening emergency: 911</li></ul><p>Stay safe. Watch for follow-up emails when conditions change.</p><p>— The {{association_name}} board</p>',
      $$⚠️ URGENT — {{association_name}} community notice

A {{weather_event}} is expected to affect our area starting {{event_start_time}}. Please take these precautions:

{{action_items}}

Community amenities affected: {{amenities_status}}

Emergency contacts:
- Property emergencies (water main, downed tree, etc.): {{property_emergency_phone}}
- Life-threatening emergency: 911

Stay safe. Watch for follow-up when conditions change.

— The {{association_name}} board$$,
      'URGENT: {{weather_event}} expected from {{event_start_time}}. Take precautions. Details by email. — {{association_name}}',
      'association_name,weather_event,event_start_time,action_summary,action_items,amenities_status,property_emergency_phone'
    ),

    -- ─── emergency: security / incident ──────────────────────────────
    (
      'emergency',
      'Emergency — Security Incident',
      'Sent when there''s a verified security issue residents should know about (theft, vandalism pattern, suspicious activity).',
      '⚠️ {{association_name}} — Security notice: {{incident_summary}}',
      '<p><strong>This is a security notice from {{association_name}}.</strong></p><p>{{incident_description}}</p><p><strong>Where + when:</strong> {{location}} on {{date_time}}</p><p><strong>What we''re doing:</strong></p><ul><li>{{response_actions}}</li></ul><p><strong>What you should do:</strong></p><ul><li>{{resident_actions}}</li></ul><p>If you have information that may help, contact local police ({{police_phone}}) and copy the board at {{board_email}}.</p><p>— The {{association_name}} board</p>',
      $$⚠️ Security notice from {{association_name}}

{{incident_description}}

Where + when: {{location}} on {{date_time}}

What we're doing:
{{response_actions}}

What you should do:
{{resident_actions}}

If you have information that may help, contact local police ({{police_phone}}) and copy the board at {{board_email}}.

— The {{association_name}} board$$,
      '{{association_name}} security notice: {{incident_summary}}. Details emailed.',
      'association_name,incident_summary,incident_description,location,date_time,response_actions,resident_actions,police_phone,board_email'
    )
  ) AS t(category, name, description, subject, body_html, body_text, body_sms, variables_csv)
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
  CASE WHEN t.body_sms IS NOT NULL
    THEN ARRAY['email', 'sms']::text[]
    ELSE ARRAY['email']::text[]
  END,
  (SELECT jsonb_agg(jsonb_build_object('name', v))
     FROM regexp_split_to_table(t.variables_csv, ',') AS v),
  'en',
  true
FROM new_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM public.communication_templates ct
  WHERE ct.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
    AND ct.name = t.name
);

-- Verify:
--   SELECT category, COUNT(*) AS templates
--     FROM public.communication_templates
--    WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND is_active
--    GROUP BY category
--    ORDER BY category;
--
-- Expect (after running this seed):
--   announcement: 1
--   arc:          3  (received, approved, denied)
--   dues:         2  (reminder, past due)
--   emergency:    2  (weather, security)
--   financial:    2  (budget, special assessment)
--   meeting:      2  (notice, recap)
--   violation:    3  (cure, fine, cured)
--   welcome:      2  (owner, tenant)
--   = 17 templates across 8 of 9 categories. The 9th ('custom') is
--   intentionally empty — by definition users compose those ad-hoc.
