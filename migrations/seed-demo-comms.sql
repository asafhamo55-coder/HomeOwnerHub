-- seed-demo-comms.sql
-- One-shot demo seeder for the communications module. Inserts:
--   • 8 default communication templates for the demo org (org-wide)
--   • 30 sample communications in the demo association
--   • Recipients with varied delivery states + a sprinkle of replies
--
-- Idempotent. The cleanup step removes prior demo rows tagged with
-- '[demo-seed]' in audience_summary. Safe to re-run.
--
-- Run from the Supabase SQL editor:
--   https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new
-- Paste the whole file, click Run. Takes ~3 seconds.

-- ─── Helper functions (must exist before the DO block uses them) ────

CREATE OR REPLACE FUNCTION public.seed_recipients(
  p_org_id uuid,
  p_comm_id uuid,
  p_count int,
  p_sent_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_names text[] := ARRAY[
    'Sarah Murphy','James Garcia','Emily Chen','Michael Thompson','Jessica Patel',
    'David Kim','Lauren Rodriguez','Ryan O''Brien','Amanda Walker','Brian Singh',
    'Rachel Davis','Tyler Nguyen','Stephanie Lopez','Jonathan Reed','Megan Hill',
    'Christopher Park','Olivia Martinez','Daniel Foster','Ashley Wright','Andrew Mitchell'
  ];
BEGIN
  INSERT INTO public.communication_recipients
    (organization_id, communication_id, recipient_name, email, channel,
     delivery_status, sent_at, delivered_at, opened_at, clicked_at, replied_at, failed_at, error_message)
  SELECT
    p_org_id,
    p_comm_id,
    v_names[((g.n - 1) % array_length(v_names, 1)) + 1],
    lower(replace(v_names[((g.n - 1) % array_length(v_names, 1)) + 1], ' ', '.')) || g.n || '@example.com',
    'email',
    s.status,
    p_sent_at,
    CASE WHEN s.status IN ('delivered','opened','clicked','replied') THEN p_sent_at + (random() * INTERVAL '10 minutes') END,
    CASE WHEN s.status IN ('opened','clicked','replied') THEN p_sent_at + (random() * INTERVAL '4 hours') END,
    CASE WHEN s.status = 'clicked' THEN p_sent_at + (random() * INTERVAL '4 hours' + INTERVAL '90 seconds') END,
    CASE WHEN s.status = 'replied' THEN p_sent_at + (random() * INTERVAL '24 hours' + INTERVAL '30 minutes') END,
    CASE WHEN s.status = 'bounced' THEN p_sent_at + INTERVAL '2 minutes' END,
    CASE WHEN s.status = 'bounced' THEN 'Mailbox does not exist' END
  FROM generate_series(1, p_count) g(n)
  CROSS JOIN LATERAL (
    -- Delivery roll: 50% opened, 15% delivered, 13% clicked, 7% replied, 7% sent, 8% bounced
    SELECT
      (CASE
        WHEN r < 0.50 THEN 'opened'
        WHEN r < 0.65 THEN 'delivered'
        WHEN r < 0.78 THEN 'clicked'
        WHEN r < 0.85 THEN 'replied'
        WHEN r < 0.92 THEN 'sent'
        ELSE 'bounced'
      END) AS status
    FROM (SELECT random() AS r) x
  ) s;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_queued_recipients(
  p_org_id uuid,
  p_comm_id uuid,
  p_count int
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_names text[] := ARRAY[
    'Sarah Murphy','James Garcia','Emily Chen','Michael Thompson','Jessica Patel',
    'David Kim','Lauren Rodriguez','Ryan O''Brien','Amanda Walker','Brian Singh',
    'Rachel Davis','Tyler Nguyen','Stephanie Lopez','Jonathan Reed','Megan Hill',
    'Christopher Park','Olivia Martinez','Daniel Foster','Ashley Wright','Andrew Mitchell'
  ];
BEGIN
  INSERT INTO public.communication_recipients
    (organization_id, communication_id, recipient_name, email, channel, delivery_status)
  SELECT
    p_org_id,
    p_comm_id,
    v_names[((g.n - 1) % array_length(v_names, 1)) + 1],
    lower(replace(v_names[((g.n - 1) % array_length(v_names, 1)) + 1], ' ', '.')) || g.n || '@example.com',
    'email',
    'queued'
  FROM generate_series(1, p_count) g(n);
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_replies(
  p_org_id uuid,
  p_comm_id uuid,
  p_count int
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_bodies text[] := ARRAY[
    'Hi — could you send the payment plan details? Happy to settle this, just need to know the schedule. Thanks.',
    'Done — mowed today. Thanks for flagging.',
    'Quick question: how many guests can we bring on a single visit? Family in town next weekend.',
    'I think this is an error. My lawn was mowed on the 8th — see attached. Please confirm.',
    'Where do I find the reserve study in the portal? I clicked Documents → Financials but only see the Q1 statement.'
  ];
  v_summaries text[] := ARRAY[
    'Asks for clarification on payment plan terms.',
    'Confirms violation has been cured.',
    'Asks about pool guest pass policy.',
    'Disputes the violation; provides photo evidence.',
    'Asks where to find the reserve study.'
  ];
  v_categories text[] := ARRAY['question','compliance','question','complaint','question'];
BEGIN
  INSERT INTO public.communication_replies
    (organization_id, communication_id, channel, from_email, subject,
     body, ai_summary, ai_category, received_at)
  SELECT
    p_org_id,
    p_comm_id,
    'email',
    'resident' || g.n || '@example.com',
    'Re: ' || (SELECT subject FROM public.communications WHERE id = p_comm_id),
    v_bodies[((g.n - 1) % array_length(v_bodies, 1)) + 1],
    v_summaries[((g.n - 1) % array_length(v_summaries, 1)) + 1],
    v_categories[((g.n - 1) % array_length(v_categories, 1)) + 1],
    NOW() - (random() * INTERVAL '6 days')
  FROM generate_series(1, p_count) g(n);
END;
$$;

-- ─── Main DO block ─────────────────────────────────────────────────

DO $do$
DECLARE
  v_org_id     uuid;
  v_assoc_id   uuid;
  v_comm_id    uuid;
  v_org_name   text;
  v_assoc_name text;
BEGIN
  -- 1. Resolve demo target: prefer an org whose name contains "Demo".
  SELECT a.id, a.organization_id, o.name, a.name
    INTO v_assoc_id, v_org_id, v_org_name, v_assoc_name
    FROM public.associations a
    JOIN public.orgs o ON o.id = a.organization_id
   WHERE o.hub_type = 'hoa'
     AND o.name ILIKE '%demo%'
   ORDER BY a.created_at
   LIMIT 1;

  IF v_assoc_id IS NULL THEN
    SELECT a.id, a.organization_id, o.name, a.name
      INTO v_assoc_id, v_org_id, v_org_name, v_assoc_name
      FROM public.associations a
      JOIN public.orgs o ON o.id = a.organization_id
     WHERE o.hub_type = 'hoa'
     ORDER BY a.created_at
     LIMIT 1;
  END IF;

  IF v_assoc_id IS NULL THEN
    RAISE EXCEPTION 'no HOA association found to seed against';
  END IF;

  RAISE NOTICE 'Seeding demo comms into % / %', v_org_name, v_assoc_name;

  -- 2. Cleanup prior demo rows. Cascades to recipients + replies via FK.
  DELETE FROM public.communications
   WHERE association_id = v_assoc_id
     AND audience_summary LIKE '%[demo-seed]%';

  -- 3. Seed 8 default templates for this org (idempotent — skip if any
  --    already exists with the same name).
  INSERT INTO public.communication_templates
    (organization_id, association_id, category, name, description,
     subject, body_html, body_text, channels, language, is_active)
  SELECT v_org_id, NULL, t.category, t.name, t.description,
         t.subject, t.body_html, t.body_text, t.channels::text[], 'en', true
    FROM (VALUES
      ('welcome', 'Welcome to the Community',
       'Sent when a new owner or tenant lands.',
       'Welcome to {{ association_name }}, {{ recipient_name }}!',
       '<p>Hi {{ recipient_name }},</p><p>Welcome to <strong>{{ association_name }}</strong>! Your resident portal invite is on its way.</p><p>— The Board</p>',
       'Hi {{ recipient_name }},

Welcome to {{ association_name }}! Your resident portal invite is on its way.

— The Board',
       ARRAY['email','portal']),
      ('dues', 'Dues Reminder — Friendly',
       'Soft reminder ~5 days before due date.',
       'Friendly reminder: {{ amount_due }} due {{ due_date }}',
       '<p>Hi {{ recipient_name }},</p><p>Quick reminder: your {{ period }} dues of <strong>{{ amount_due }}</strong> are due on {{ due_date }}.</p>',
       'Hi {{ recipient_name }},

Quick reminder: your {{ period }} dues of {{ amount_due }} are due on {{ due_date }}.',
       ARRAY['email','portal']),
      ('dues', 'Dues — Past Due Notice',
       'First late notice after the grace period.',
       'Past due: {{ amount_due }} for {{ period }}',
       '<p>Hi {{ recipient_name }},</p><p>Your {{ period }} dues of <strong>{{ amount_due }}</strong> were due {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.</p>',
       'Hi {{ recipient_name }},

Your {{ period }} dues of {{ amount_due }} were due {{ due_date }} and remain unpaid. A late fee of {{ late_fee }} has been added.',
       ARRAY['email','portal']),
      ('meeting', 'Meeting Notice',
       'Annual / board / special meeting notice.',
       '{{ meeting_type }}: {{ meeting_date }}',
       '<p>Dear residents,</p><p>You are hereby notified that a <strong>{{ meeting_type }}</strong> will be held {{ meeting_date }} at {{ meeting_time }}, {{ meeting_location }}.</p>',
       'Dear residents,

You are hereby notified that a {{ meeting_type }} will be held {{ meeting_date }} at {{ meeting_time }}, {{ meeting_location }}.',
       ARRAY['email','portal','mail']),
      ('violation', 'Violation — Cure Notice',
       'Formal violation notice with cure period.',
       'Notice of violation — {{ violation_summary }}',
       '<p>Dear {{ recipient_name }},</p><p>A violation was identified at {{ unit_address }}: <strong>{{ violation_summary }}</strong>. Please correct by <strong>{{ cure_deadline }}</strong>.</p>',
       'Dear {{ recipient_name }},

A violation was identified at {{ unit_address }}: {{ violation_summary }}. Please correct by {{ cure_deadline }}.',
       ARRAY['email','mail']),
      ('arc', 'ARC — Application Approved',
       'ARC committee approval.',
       'ARC application approved — {{ project_summary }}',
       '<p>Dear {{ recipient_name }},</p><p>Your request for <strong>{{ project_summary }}</strong> has been <strong>approved</strong>.</p>',
       'Dear {{ recipient_name }},

Your request for {{ project_summary }} has been APPROVED.',
       ARRAY['email','portal']),
      ('arc', 'ARC — Application Denied',
       'ARC committee denial.',
       'ARC application denied — {{ project_summary }}',
       '<p>Dear {{ recipient_name }},</p><p>Your request for <strong>{{ project_summary }}</strong> has been <strong>denied</strong>.</p>',
       'Dear {{ recipient_name }},

Your request for {{ project_summary }} has been DENIED.',
       ARRAY['email','portal']),
      ('announcement', 'Community Announcement',
       'Flexible all-purpose announcement.',
       '{{ announcement_subject }}',
       '<p>Hi {{ recipient_name }},</p><div>{{ announcement_body_html }}</div><p>— {{ association_name }}</p>',
       'Hi {{ recipient_name }},

{{ announcement_body_text }}

— {{ association_name }}',
       ARRAY['email','portal'])
    ) AS t(category, name, description, subject, body_html, body_text, channels)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.communication_templates ex
       WHERE ex.organization_id = v_org_id
         AND ex.association_id IS NULL
         AND ex.name = t.name
    );

  -- ─── 4. Seed 30 communications ──────────────────────────────────

  -- ── WELCOMES (3) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'welcome', 'Welcome to Creek Valley, the Murphy family!',
    '<p>Hi Murphys,</p><p>Welcome to your new home at <strong>4825 Park Ave</strong>. We''re thrilled to have you join the community.</p>',
    ARRAY['email','portal']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '2 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'welcome', 'Resident portal invitation — set up your account',
    '<p>Hi Garcia family,</p><p>Click below to activate your portal.</p>',
    ARRAY['email']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '8 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'welcome', 'New homeowner orientation — May 25 at 6pm',
    '<p>Three families have joined recently. Informal orientation at the clubhouse <strong>May 25 at 6pm</strong>. RSVP by reply.</p>',
    ARRAY['email','portal']::text[], '{"kind":"specific_units"}'::jsonb,
    '3 new owners [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 3, NOW() - INTERVAL '14 days');

  -- ── DUES (8) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'May dues reminder — due May 15',
    '<p>Friendly reminder: your <strong>$345 May assessment</strong> is due Wednesday, May 15. Pay via the resident portal.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '10 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'Past due: $345 for May',
    '<p>Your May dues of <strong>$345</strong> were due May 15 and remain unpaid. A late fee of $17.25 has been added.</p>',
    ARRAY['email']::text[], '{"kind":"late_on_dues"}'::jsonb,
    'Units late on dues (8) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 8, NOW() - INTERVAL '1 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 2);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'Final notice before collections — 3 units',
    '<p>Final notice for outstanding balance of <strong>$1,127.50</strong>. If payment not received by <strong>June 1</strong>, referred to collections per CC&R Article 8.</p>',
    ARRAY['email','mail']::text[], '{"kind":"specific_units"}'::jsonb,
    '3 hand-picked units [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 3, NOW() - INTERVAL '4 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 1);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'Q2 special assessment — $480 per unit for asphalt resurfacing',
    '<p>Board approved a <strong>special assessment of $480/unit</strong> for east-driveway asphalt resurfacing in July. Charge appears on July statement; due July 15.</p>',
    ARRAY['email','portal','mail']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '21 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 2);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'Thank you — May payment received',
    '<p>We received your May payment of $345 on May 12. Your next statement (June) posts June 1.</p>',
    ARRAY['email']::text[], '{"kind":"specific_units"}'::jsonb,
    '54 paid-early units [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 12, NOW() - INTERVAL '5 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', '2026 dues increase — board vote May 30',
    '<p>Board is considering a <strong>4.2% dues increase</strong> ($14.50/month) for 2026. Vote at May 30 meeting.</p>',
    ARRAY['email','portal']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '32 days', NOW() - INTERVAL '32 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '32 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 3);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, scheduled_for, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'June dues reminder — due June 15',
    '<p>Friendly reminder: your <strong>$345 June assessment</strong> is due June 15.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'scheduled', 'manual',
    NOW() + INTERVAL '7 days', NOW() - INTERVAL '1 hour')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_queued_recipients(v_org_id, v_comm_id, 18);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'dues', 'Late fee waived — one-time courtesy',
    '<p>The $17.25 late fee on your April statement has been waived as a one-time courtesy.</p>',
    ARRAY['email']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '18 days');

  -- ── VIOLATIONS (4) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'violation', 'Notice of violation — lawn height exceeds 6"',
    '<p>Per compliance walk on May 9, your front lawn exceeds the 6" maximum (CC&R 4.3.2). Please cure by <strong>May 23</strong>.</p>',
    ARRAY['email','mail']::text[], '{"kind":"specific_units"}'::jsonb,
    '4 hand-picked units [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 4, NOW() - INTERVAL '9 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 2);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'violation', 'Final cure notice — RV parked in driveway',
    '<p>Your RV has been parked in the driveway since April 14, exceeding 72-hour limit. Final notice. Relocate by <strong>May 25</strong>.</p>',
    ARRAY['email','mail']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '6 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 1);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'violation', 'Violation resolved — thank you',
    '<p>Trash bins have been brought back inside the gate. The violation is closed.</p>',
    ARRAY['email']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '12 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'violation', 'Compliance hearing scheduled — June 4 at 7pm',
    '<p>Compliance hearing for unresolved parking violation. <strong>June 4 at 7pm</strong>, clubhouse.</p>',
    ARRAY['email','mail']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '3 days');

  -- ── ARC (3) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'arc', 'ARC approval — exterior paint (SW "Mindful Gray")',
    '<p>Approved. Conditions: SW 7016 only, white trim, work within 60 days, completes within 90.</p>',
    ARRAY['email','portal']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '16 days', NOW() - INTERVAL '16 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '16 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'arc', 'ARC application — additional documentation needed',
    '<p>ARC request for 8x10 shed under review. Need: site plan with 5'' setback, drainage plan if grading changes, confirmation shed will not be plumbed.</p>',
    ARRAY['email','portal']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '24 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 1);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'arc', 'ARC denial — proposed satellite dish location',
    '<p>Denied. Reason: CC&R 5.7 prohibits visible exterior equipment on front-facing facades. Revised proposal on rear roofline welcomed.</p>',
    ARRAY['email','portal']::text[], '{"kind":"specific_units"}'::jsonb,
    '1 hand-picked unit [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 1, NOW() - INTERVAL '20 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 1);

  -- ── MEETINGS (4) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'meeting', '2026 Annual Meeting Notice — June 15 at 7pm',
    '<p>2026 Annual Meeting: <strong>June 15 at 7pm, clubhouse</strong>. Agenda: 3 board seats, 2026 budget, reserve study, pool resurfacing.</p>',
    ARRAY['email','mail','portal']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '28 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'meeting', 'May board meeting agenda',
    '<p>Monthly board meeting <strong>May 21 at 7pm</strong>. Agenda: Q1 treasurer''s report, reserve study, landscape contract, 3 hearings.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '19 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'meeting', 'April board meeting minutes available',
    '<p>April 17 minutes posted in portal under Documents → Minutes. Key decisions: Q1 vendor renewals, reserve study, asphalt resurfacing.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '22 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'meeting', 'Special meeting — Reserve study review, May 30',
    '<p>Special meeting <strong>May 30 at 6:30pm</strong>. Sole agenda: review and accept the 2026 reserve study (Anderson + Co.).</p>',
    ARRAY['email','mail']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '11 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 2);

  -- ── FINANCIAL (2) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'financial', 'Q1 2026 Financial Statement — now posted',
    '<p>Q1 2026 financial statement in the resident portal. $42,180 operating surplus vs. budget, reserve on target, delinquency down to 4.1%.</p>',
    ARRAY['email','portal']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '38 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'financial', '2026 reserve study completed — see portal',
    '<p>Anderson + Co. has completed the 2026 reserve study. Full report in portal. Discussion at May 30 special meeting.</p>',
    ARRAY['email','portal']::text[], '{"kind":"owners_only"}'::jsonb,
    'All owners (82) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '13 days', NOW() - INTERVAL '13 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '13 days');

  -- ── EMERGENCY (2) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'emergency', 'URGENT: water main break — east side, shutoff 4pm',
    '<p>Water main break on east side near units 1240–1268. Water company shuts off <strong>4pm today</strong>. Restoration estimated 9pm. Fill containers now.</p>',
    ARRAY['email','portal','sms']::text[], '{"kind":"specific_units"}'::jsonb,
    '14 east-side units [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '17 days', NOW() - INTERVAL '17 days 5 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 14, NOW() - INTERVAL '17 days');
  PERFORM public.seed_replies(v_org_id, v_comm_id, 2);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'emergency', 'Gate code changed effective immediately',
    '<p>Main gate code changed to <strong>4837</strong>. Previous code was shared outside the community. New code rotates again in 60 days.</p>',
    ARRAY['email','portal','sms']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '26 days', NOW() - INTERVAL '26 days 5 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '26 days');

  -- ── ANNOUNCEMENTS (4) ──
  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'announcement', 'Pool opens Saturday — Memorial Day weekend',
    '<p>Community pool opens <strong>Saturday, May 25 at 10am</strong>. Hours 10am–9pm. Children under 14 require adult supervision.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '7 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'announcement', 'New landscape contractor starting June 1',
    '<p>Effective <strong>June 1</strong>, GreenLeaf Landscaping replaces Acme. Schedule unchanged (mowing Tues, edging Wed). Report concerns to the board.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'sent', 'manual',
    NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days 30 minutes')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_recipients(v_org_id, v_comm_id, 18, NOW() - INTERVAL '25 days');

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, scheduled_for, created_at)
  VALUES (v_org_id, v_assoc_id, 'announcement', 'Community garage sale — Saturday June 8',
    '<p>Annual community garage sale <strong>Saturday, June 8 from 8am to 2pm</strong>. Board advertises on Craigslist, NextDoor, Patch.</p>',
    ARRAY['email','portal']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'scheduled', 'manual',
    NOW() + INTERVAL '3 days', NOW() - INTERVAL '1 hour')
  RETURNING id INTO v_comm_id;
  PERFORM public.seed_queued_recipients(v_org_id, v_comm_id, 18);

  INSERT INTO public.communications (organization_id, association_id, category, subject, body_html, channels, audience_definition, audience_summary, status, source, sent_at, created_at)
  VALUES (v_org_id, v_assoc_id, 'announcement', 'Holiday office hours — Memorial Day weekend',
    '<p>Board mailbox checked daily over Memorial Day weekend. Emergencies: (555) 123-9999.</p>',
    ARRAY['email']::text[], '{"kind":"everyone"}'::jsonb,
    'Everyone (96 units) [demo-seed]', 'draft', 'manual',
    NULL, NOW() - INTERVAL '1 days')
  RETURNING id INTO v_comm_id;
  -- Drafts have no recipients yet.

  RAISE NOTICE '✅ Demo seed complete: 30 communications + 8 templates';
END
$do$;
