-- migrations/seed-community-templates.sql
--
-- GENERATED FILE — do not edit by hand.
-- Source: apps/hoa/src/lib/community-templates/
-- Regenerate: pnpm generate:community-sql
--
-- Global community templates (organization_id IS NULL). Idempotent: keyed
-- on topic_slug against the partial unique index from 0044
-- (comm_templates_global_slug_idx), so re-running updates the copy in
-- place rather than duplicating rows.
--
-- Requires 0044_community_templates.sql to have been applied first.
--
-- providedFields (CommunityTemplate, Task 11) is NOT persisted here — 0044
-- has no column for it. Those placeholders (e.g. lease-cap occupancy
-- figures) are supplied by application code at render time, keyed off
-- topic_slug (see Task 14). The registry in code stays the source of
-- truth for template structure; this seed only carries the rendered
-- artifact plus the board-facing question set. A future org-level clone
-- of a global row will NOT inherit providedFields for this reason.

BEGIN;

INSERT INTO public.communication_templates
  (organization_id, association_id, category, topic_slug, name, description,
   shape, accent_color, subject, body_html, body_text, questions, visual_block,
   variables, channels, is_active)
SELECT
  NULL, NULL, 'community', v.slug, v.name, v.description,
  v.shape, v.accent, v.subject, v.body_html, v.body_text, v.questions,
  v.visual_block, v.variables, ARRAY['email']::text[], true
FROM (VALUES
  (
    'community-cleanup-day',
    'Community Cleanup Day — Volunteer Invitation',
    'An invitation to the annual community cleanup and bulk dumpster weekend, when volunteers tidy the common areas and a roll-off dumpster is on site for bulk items. Send a couple of weeks ahead so residents can plan their Saturday.',
    'invitation',
    '#A63A87',
    'Join us for Community Cleanup Day in {{association_name}} — {{event_date}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Bags, gloves, and refreshments provided, plus a dumpster on site for bulk items.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#A63A87" style="background-color:#A63A87;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Volunteer Invitation</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">It&#39;s time for our annual Community Cleanup Day! Grab a pair of gloves and join your neighbors on {{event_date}} from {{start_time}} to {{end_time}} — we&#39;ll spend the morning tidying up our shared spaces, and there&#39;s a roll-off dumpster on site for bulk items you&#39;ve been meaning to get rid of.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f3ebf1" style="background-color:#f3ebf1;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/community-cleanup-day.png" alt="A broom with bright bristles sweeping leaves and yard debris off a pathway" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Meet us at {{meeting_location}}. We&#39;ll form small teams and split up the common areas, so however much time you can spare — an hour or the whole morning — makes a real difference.</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We&#39;ll have trash bags, work gloves, and refreshments on hand to keep everyone going. Just bring closed-toe shoes, sun protection, and a water bottle — and your own gloves too, if you&#39;ve got a favorite pair.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2e9f0" style="background-color:#f2e9f0;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#f2e9f0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #A63A87;">The dumpster is for bulk household items — furniture, yard debris, scrap wood, and the like. It cannot take paint, tires, electronics, chemicals, or mattresses; those need a hazardous-waste or bulk-pickup program instead. If you&#39;re not sure whether something belongs in there, ask one of the volunteers before you toss it in.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">RSVPs: {{rsvp_instructions}}. Either way, come say hi — we&#39;d love to see you.</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Bring a neighbor, bring the kids, and let&#39;s make {{association_name}} look its best together. We&#39;re grateful for every hour you can spare on a Saturday.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

It's time for our annual Community Cleanup Day! Grab a pair of gloves and join your neighbors on {{event_date}} from {{start_time}} to {{end_time}} — we'll spend the morning tidying up our shared spaces, and there's a roll-off dumpster on site for bulk items you've been meaning to get rid of.

Meet us at {{meeting_location}}. We'll form small teams and split up the common areas, so however much time you can spare — an hour or the whole morning — makes a real difference.

We'll have trash bags, work gloves, and refreshments on hand to keep everyone going. Just bring closed-toe shoes, sun protection, and a water bottle — and your own gloves too, if you've got a favorite pair.

The dumpster is for bulk household items — furniture, yard debris, scrap wood, and the like. It cannot take paint, tires, electronics, chemicals, or mattresses; those need a hazardous-waste or bulk-pickup program instead. If you're not sure whether something belongs in there, ask one of the volunteers before you toss it in.

RSVPs: {{rsvp_instructions}}. Either way, come say hi — we'd love to see you.

Bring a neighbor, bring the kids, and let's make {{association_name}} look its best together. We're grateful for every hour you can spare on a Saturday.$tpl$,
    $tpl$[{"id":"event_date","label":"What Saturday is Cleanup Day?","type":"date","required":true},{"id":"start_time","label":"What time does it start?","type":"time","required":true},{"id":"end_time","label":"What time does it wrap up?","type":"time","required":true},{"id":"meeting_location","label":"Where should volunteers meet?","type":"text","required":true,"help":"e.g. \"the clubhouse parking lot\""},{"id":"rsvp_instructions","label":"How should residents let you know they are coming?","type":"select","options":["No RSVP needed — just show up","Reply to this email to let us know","Sign up at the clubhouse front desk","Sign up using the community app"],"required":true}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"community-cleanup-day.png","alt":"A broom with bright bristles sweeping leaves and yard debris off a pathway"}$tpl$::jsonb,
    $tpl$["association_name","end_time","event_date","meeting_location","recipient_name","rsvp_instructions","start_time"]$tpl$::jsonb
  ),
  (
    'dog-leash-and-waste',
    'Dogs — Leash Rules and Picking Up After Your Pet',
    'A community-wide nudge about pet waste and off-leash dogs, naming the areas where it has become a problem and where the bag stations are. Send before anything formal.',
    'reminder',
    '#1C6772',
    'A friendly reminder about dogs in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Where the bag stations are, and a note about leashes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#1C6772" style="background-color:#1C6772;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Leash Rules and Picking Up After Your Pet</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We&#39;ve had a number of reports about {{issue_type}} over the past few weeks, most often around {{affected_areas}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#e8eeef" style="background-color:#e8eeef;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/dog-leash-and-waste.png" alt="A resident walking a leashed dog past a waste bag station" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The overwhelming majority of dog owners here already clean up and keep their dogs leashed in shared spaces. This is just a nudge for everyone to keep at it.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e6edee" style="background-color:#e6edee;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e6edee;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #1C6772;">Bag stations are at {{station_locations}}. If you find one empty or damaged, reply to this email and we will restock it.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Thanks for helping keep the neighborhood pleasant for everyone — including the neighbors who are nervous around dogs they do not know.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

We've had a number of reports about {{issue_type}} over the past few weeks, most often around {{affected_areas}}.

The overwhelming majority of dog owners here already clean up and keep their dogs leashed in shared spaces. This is just a nudge for everyone to keep at it.

Bag stations are at {{station_locations}}. If you find one empty or damaged, reply to this email and we will restock it.

Thanks for helping keep the neighborhood pleasant for everyone — including the neighbors who are nervous around dogs they do not know.$tpl$,
    $tpl$[{"id":"issue_type","label":"What is the problem right now?","type":"select","options":["pet waste left on lawns and paths","dogs off leash in shared spaces","both pet waste and off-leash dogs"],"required":true},{"id":"affected_areas","label":"Where is it worst?","type":"multiselect","options":["the east entrance","the main walking path","the mailboxes","the playground","the clubhouse lawn","the north cul-de-sac"],"required":true,"help":"Naming the actual spots is what makes people recognize themselves."},{"id":"station_locations","label":"Where are the bag stations?","type":"text","required":true,"help":"e.g. \"the clubhouse, the east entrance, and the playground\""}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"dog-leash-and-waste.png","alt":"A resident walking a leashed dog past a waste bag station"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","issue_type","recipient_name","station_locations"]$tpl$::jsonb
  ),
  (
    'guest-parking',
    'Guest Parking — Where to Park and For How Long',
    'A community-wide reminder about guest parking: where visitors may park, how long they may stay, and which spaces are reserved or off-limits. Send when shared parking gets tight.',
    'reminder',
    '#2C6FAF',
    'A note about guest parking in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Where guests can park, how long they may stay, and which spots are off-limits.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#2C6FAF" style="background-color:#2C6FAF;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Where to Park and For How Long</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">With {{reason}}, we want to make sure every guest knows where to park. Visitor vehicles may stay in the marked guest spaces for {{max_guest_stay}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#eaeff4" style="background-color:#eaeff4;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/guest-parking.png" alt="A community map with visitor parking spaces highlighted along the main loop road, and resident-reserved spaces and fire lanes near the clubhouse and mailboxes marked off-limits" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Most guests already park in the right spots without a second thought — this is just a reminder while shared parking is tighter than usual.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e7edf3" style="background-color:#e7edf3;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e7edf3;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #2C6FAF;">Guests should avoid {{affected_areas}} — these stay reserved for residents and for emergency access. Vehicles parked outside the marked guest areas may be subject to towing under our posted policy.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Questions about where guests can park? Reach out to {{report_contact}} and we are happy to help.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

With {{reason}}, we want to make sure every guest knows where to park. Visitor vehicles may stay in the marked guest spaces for {{max_guest_stay}}.

Most guests already park in the right spots without a second thought — this is just a reminder while shared parking is tighter than usual.

Guests should avoid {{affected_areas}} — these stay reserved for residents and for emergency access. Vehicles parked outside the marked guest areas may be subject to towing under our posted policy.

Questions about where guests can park? Reach out to {{report_contact}} and we are happy to help.$tpl$,
    $tpl$[{"id":"reason","label":"What is driving this reminder?","type":"select","options":["shared guest spaces reaching capacity","guests parking in spaces reserved for residents","vehicles left in guest spaces for multiple days","contractor and vendor trucks taking up guest spaces"],"required":true},{"id":"max_guest_stay","label":"How long may a guest vehicle stay?","type":"select","options":["up to 24 hours","up to 48 hours","up to 72 hours","no overnight guest parking"],"required":true},{"id":"affected_areas","label":"Which areas are reserved or off-limits to guests?","type":"multiselect","options":["spaces marked reserved for residents","fire lanes and no-parking zones","the spaces nearest the clubhouse","the visitor lot at the main entrance","accessible spaces without a permit"],"required":true,"help":"Select every area guests should avoid right now."},{"id":"report_contact","label":"Who should residents contact with questions?","type":"text","required":true,"help":"e.g. \"the front office at 555-0134\" or \"the HOA management company\""}]$tpl$::jsonb,
    $tpl${"kind":"map","asset":"guest-parking.png","alt":"A community map with visitor parking spaces highlighted along the main loop road, and resident-reserved spaces and fire lanes near the clubhouse and mailboxes marked off-limits"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","max_guest_stay","reason","recipient_name","report_contact"]$tpl$::jsonb
  ),
  (
    'lease-cap-status',
    'Lease Cap — Where the Community Stands',
    'A status update on the rental cap: how many homes are currently leased against the cap set in the governing documents, how many slots remain, and how many households are on the waiting list. Send periodically or whenever the cap is close to being reached.',
    'notice',
    '#3A5AA8',
    'Lease cap update for {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Where we stand against the rental cap, and what it means for owners.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#3A5AA8" style="background-color:#3A5AA8;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Where the Community Stands</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">This is a periodic update on the community’s rental cap, set under {{policy_reference}}. Right now {{leased_count}} of {{total_units}} homes are leased — that’s {{leased_pct}} against a cap of {{cap_pct}}. {{remaining_slots}} more homes may still be leased, and {{waiting_phrase}}.</p>
{{lease_meter_html}}
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">This cap exists for a reason that affects every owner, not just those who rent out their home: once an association exceeds its allowed share of leased homes, FHA and Fannie Mae owner-occupancy rules can make homes here unmortgageable. That can make it harder for any owner — renter or not — to sell, and harder for a buyer to get financing. Staying under the cap protects resale value for the whole community.</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If you are on the waiting list, we will contact you in order as slots open up. {{waiting_list_status}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e9ecf3" style="background-color:#e9ecf3;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e9ecf3;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #3A5AA8;">Questions about the cap, the waiting list, or how it applies to your home? Reach out to {{contact_name}}.</td></tr></table>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

This is a periodic update on the community’s rental cap, set under {{policy_reference}}. Right now {{leased_count}} of {{total_units}} homes are leased — that’s {{leased_pct}} against a cap of {{cap_pct}}. {{remaining_slots}} more homes may still be leased, and {{waiting_phrase}}.

This cap exists for a reason that affects every owner, not just those who rent out their home: once an association exceeds its allowed share of leased homes, FHA and Fannie Mae owner-occupancy rules can make homes here unmortgageable. That can make it harder for any owner — renter or not — to sell, and harder for a buyer to get financing. Staying under the cap protects resale value for the whole community.

If you are on the waiting list, we will contact you in order as slots open up. {{waiting_list_status}}

Questions about the cap, the waiting list, or how it applies to your home? Reach out to {{contact_name}}.$tpl$,
    $tpl$[{"id":"policy_reference","label":"Which section of the governing documents sets the lease cap?","type":"text","required":true,"help":"e.g. \"Article VII, Section 3 of the Declaration\" — quote it exactly, do not paraphrase."},{"id":"waiting_list_status","label":"Any update on how the waiting list works right now?","type":"select","options":["The waiting list is open and working as usual.","The waiting list is temporarily paused while we confirm current numbers.","We are changing how the waiting list is managed — details to follow separately."],"required":true,"help":"Pick the one that matches what is actually happening today."},{"id":"contact_name","label":"Who should residents contact with questions about the cap or waiting list?","type":"text","required":true,"help":"e.g. \"the management office\" or a board member’s name."}]$tpl$::jsonb,
    $tpl${"kind":"none"}$tpl$::jsonb,
    $tpl$["association_name","cap_pct","contact_name","lease_meter_html","leased_count","leased_pct","policy_reference","recipient_name","remaining_slots","total_units","waiting_list_status","waiting_phrase"]$tpl$::jsonb
  ),
  (
    'pool-pass-renewal',
    'Pool Pass Renewal — Paperwork Needed Before Opening Day',
    'Asks each household to turn in its roster, signed waiver, and fob request ahead of the season so passes are ready before opening day instead of being sorted out at the gate.',
    'submission_request',
    '#1C6F31',
    'Pool passes for {{association_name}} — paperwork due {{deadline_date}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Turn in your roster, waiver, and fob request before opening day.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#1C6F31" style="background-color:#1C6F31;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Paperwork Needed Before Opening Day</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">To have your pass ready before opening day, every household needs to turn in {{required_items}} by {{deadline_date}}. Submit via {{submission_method}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#e8efea" style="background-color:#e8efea;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/pool-pass-renewal.png" alt="A swimmer doing front crawl across sunlit pool water lines" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">This is the same paperwork we ask for every season — nothing new, just a reminder to get it in early rather than at the gate on a busy opening weekend.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e6ede8" style="background-color:#e6ede8;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e6ede8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #1C6F31;">Submission method: {{submission_method}}. Paperwork turned in after {{deadline_date}} will still be processed, but passes may not be ready for the first open weekend — plan on picking yours up in person once it is issued.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Questions about what&#39;s needed or how to submit it? Reach out to {{contact_name}} and we&#39;ll help you get sorted.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

To have your pass ready before opening day, every household needs to turn in {{required_items}} by {{deadline_date}}. Submit via {{submission_method}}.

This is the same paperwork we ask for every season — nothing new, just a reminder to get it in early rather than at the gate on a busy opening weekend.

Submission method: {{submission_method}}. Paperwork turned in after {{deadline_date}} will still be processed, but passes may not be ready for the first open weekend — plan on picking yours up in person once it is issued.

Questions about what's needed or how to submit it? Reach out to {{contact_name}} and we'll help you get sorted.$tpl$,
    $tpl$[{"id":"deadline_date","label":"Paperwork deadline","type":"date","required":true,"help":"The last day paperwork can come in and still guarantee a pass by opening day."},{"id":"required_items","label":"What does each household need to submit?","type":"multiselect","options":["a completed household roster","a signed liability waiver for all household members","a fob or key request form","a current emergency contact card"],"required":true,"help":"Select everything you need back before you can issue a pass."},{"id":"submission_method","label":"How should households submit their paperwork?","type":"select","options":["drop-off at the clubhouse office","email to the property manager","upload through the resident portal","mail to the management office"],"required":true},{"id":"contact_name","label":"Who should residents contact with questions?","type":"text","required":false,"fallback":"the management office","help":"e.g. \"Jamie in the front office\" or \"the property manager\""}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"pool-pass-renewal.png","alt":"A swimmer doing front crawl across sunlit pool water lines"}$tpl$::jsonb,
    $tpl$["association_name","contact_name","deadline_date","recipient_name","required_items","submission_method"]$tpl$::jsonb
  ),
  (
    'trash-and-recycling-bins',
    'Trash & Recycling Bins — Curb Timing and Storage',
    'A community-wide reminder about when trash and recycling bins may go to the curb, when they need to come back in, and where to keep them the rest of the week. Send when bins start living on driveways all week instead of just on collection day.',
    'reminder',
    '#268298',
    'A reminder about trash and recycling bin timing in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">When bins can go out, when they need to come in, and where to keep them between pickups.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#268298" style="background-color:#268298;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Curb Timing and Storage</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Trash and recycling are collected on {{collection_day}}. Bins may go out to the curb starting at {{early_out_time}} the evening before, and need to be back out of sight by {{late_in_time}} that same day.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#e9f0f2" style="background-color:#e9f0f2;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/trash-and-recycling-bins.png" alt="A single trash bin with its lid closed, standing at the curb" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">For the rest of the week, please keep bins {{storage_location}} rather than out on the driveway — it keeps the street looking its best for everyone.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e7eff1" style="background-color:#e7eff1;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e7eff1;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #268298;">{{holiday_note}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Thanks for keeping the curb clear between pickups — most of us already do, and it makes a real difference for the whole street.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Trash and recycling are collected on {{collection_day}}. Bins may go out to the curb starting at {{early_out_time}} the evening before, and need to be back out of sight by {{late_in_time}} that same day.

For the rest of the week, please keep bins {{storage_location}} rather than out on the driveway — it keeps the street looking its best for everyone.

{{holiday_note}}

Thanks for keeping the curb clear between pickups — most of us already do, and it makes a real difference for the whole street.$tpl$,
    $tpl$[{"id":"collection_day","label":"What day is trash and recycling collected?","type":"select","options":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],"required":true},{"id":"early_out_time","label":"How early may bins go out to the curb?","type":"time","required":true,"help":"The earliest time on the evening before pickup, e.g. 6:00 PM."},{"id":"late_in_time","label":"By when must bins be back out of sight?","type":"time","required":true,"help":"The deadline on collection day itself, e.g. 8:00 PM."},{"id":"storage_location","label":"Where should bins be stored the rest of the week?","type":"select","options":["in the side yard","in the garage","behind a fence or screen","in a designated enclosure or pad"],"required":true,"help":"Pick whichever matches your community rule."},{"id":"holiday_note","label":"Any upcoming holiday schedule change to mention?","type":"textarea","required":false,"fallback":"There are no holiday schedule changes at this time.","help":"e.g. \"Collection will run one day late the week of Labor Day.\" Leave blank if none."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"trash-and-recycling-bins.png","alt":"A single trash bin with its lid closed, standing at the curb"}$tpl$::jsonb,
    $tpl$["association_name","collection_day","early_out_time","holiday_note","late_in_time","recipient_name","storage_location"]$tpl$::jsonb
  ),
  (
    'work-on-site',
    'Scheduled Work On-Site — Paving, Landscaping, Roof or Utility Work',
    'A heads-up for scheduled work that will disrupt part of the property — paving, landscaping, roof work, utility or road work, or an amenity closure. Leads with dates, areas, and whether residents need to move their car.',
    'notice',
    '#7A6A1D',
    'Scheduled {{reason}} at {{association_name}}: {{start_date}}–{{end_date}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What&#39;s happening, where, and what to do with your car.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#7A6A1D" style="background-color:#7A6A1D;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Paving, Landscaping, Roof or Utility Work</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">{{association_name}} has scheduled {{reason}} at {{affected_areas}}, expected to run from {{start_date}} through {{end_date}}. {{parking_instructions}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f0eee8" style="background-color:#f0eee8;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/work-on-site.png" alt="An orange traffic cone marking off a work area on a community roadway" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Expect crews, equipment, and some noise in the area during work hours. Access to {{affected_areas}} may be limited while the work is underway.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eeede6" style="background-color:#eeede6;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#eeede6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #7A6A1D;">Please have vehicles clear of {{affected_areas}} before work begins on {{start_date}}. If your schedule doesn&#39;t allow it, reply to this email and we&#39;ll help you find another spot.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We&#39;ll send an update if the schedule changes. Questions in the meantime? Just reply to this email.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

{{association_name}} has scheduled {{reason}} at {{affected_areas}}, expected to run from {{start_date}} through {{end_date}}. {{parking_instructions}}

Expect crews, equipment, and some noise in the area during work hours. Access to {{affected_areas}} may be limited while the work is underway.

Please have vehicles clear of {{affected_areas}} before work begins on {{start_date}}. If your schedule doesn't allow it, reply to this email and we'll help you find another spot.

We'll send an update if the schedule changes. Questions in the meantime? Just reply to this email.$tpl$,
    $tpl$[{"id":"reason","label":"What kind of work is happening?","type":"select","options":["paving","landscaping work","roof work","utility work","road work","an amenity closure"],"required":true},{"id":"affected_areas","label":"Which area is affected?","type":"text","required":true,"help":"Name the exact spot — e.g. \"the visitor lot and the north driveway\" — specifics are what tell someone whether this affects them."},{"id":"start_date","label":"When does the work begin?","type":"date","required":true},{"id":"end_date","label":"When is the work expected to wrap up?","type":"date","required":true,"help":"An estimate is fine — the email phrases this as expected, not guaranteed."},{"id":"parking_instructions","label":"What do residents need to do before work starts?","type":"textarea","required":true,"help":"Be specific: which vehicles need to move, where to park instead, and by what date or time. This is the single most useful line in the email."}]$tpl$::jsonb,
    $tpl${"kind":"map","asset":"work-on-site.png","alt":"An orange traffic cone marking off a work area on a community roadway"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","end_date","parking_instructions","reason","recipient_name","start_date"]$tpl$::jsonb
  ),
  (
    'annual-meeting-notice',
    'Annual Meeting — Date, Quorum and Proxy',
    'The annual meeting announcement, written so people understand that quorum is the thing that actually fails. Explains the proxy in plain language rather than assuming anyone knows what one is.',
    'notice',
    '#3F5C8C',
    '{{association_name}} annual meeting — {{meeting_date}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">The date, what is on the agenda, and why your proxy matters.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#3F5C8C" style="background-color:#3F5C8C;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Date, Quorum and Proxy</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The annual meeting of {{association_name}} is on {{meeting_date}} at {{meeting_location}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#ebedf1" style="background-color:#ebedf1;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/annual-meeting-notice.png" alt="Three people standing together" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">On the agenda: {{agenda_items}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e9ecf0" style="background-color:#e9ecf0;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e9ecf0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #3F5C8C;">If you cannot attend, please return a proxy. A proxy simply lets another owner cast your vote. Without enough owners present or represented, the meeting cannot reach quorum and no business can be conducted — which means it has to be scheduled again, at the association&#39;s expense.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Meetings fail on quorum far more often than on disagreement. Ten minutes returning a proxy is the single most useful thing an owner who cannot attend can do.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

The annual meeting of {{association_name}} is on {{meeting_date}} at {{meeting_location}}.

On the agenda: {{agenda_items}}.

If you cannot attend, please return a proxy. A proxy simply lets another owner cast your vote. Without enough owners present or represented, the meeting cannot reach quorum and no business can be conducted — which means it has to be scheduled again, at the association's expense.

Meetings fail on quorum far more often than on disagreement. Ten minutes returning a proxy is the single most useful thing an owner who cannot attend can do.$tpl$,
    $tpl$[{"id":"meeting_date","label":"Meeting date and time","type":"text","required":true,"help":"Include the time. Check your documents for the minimum notice period before choosing a send date."},{"id":"meeting_location","label":"Where is it?","type":"text","required":true,"help":"Include the video link as well if it is hybrid — but confirm your documents permit electronic attendance and voting first."},{"id":"agenda_items","label":"What is on the agenda?","type":"textarea","required":true,"help":"Board elections, the budget, and any owner vote. Some items must be described specifically in the notice to be voted on at all."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"annual-meeting-notice.png","alt":"Three people standing together"}$tpl$::jsonb,
    $tpl$["agenda_items","association_name","meeting_date","meeting_location","recipient_name"]$tpl$::jsonb
  ),
  (
    'architectural-review-reminder',
    'Before You Build — Architectural Review Reminder',
    'A reminder to submit for approval before starting exterior work, sent ahead of project season. The point is to reach people while a project is still an idea, because the expensive conversation is the one that happens after the fence is up.',
    'reminder',
    '#7A6138',
    'Planning exterior work in {{association_name}}? Submit first',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What needs approval, and how long review takes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#7A6138" style="background-color:#7A6138;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Architectural Review Reminder</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">This is the season when projects start, so a reminder while yours is still an idea: most exterior changes need written approval before work begins.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f0eeea" style="background-color:#f0eeea;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/architectural-review-reminder.png" alt="A drafting compass over architectural lines" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Work that typically requires approval includes {{project_types}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eeece9" style="background-color:#eeece9;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#eeece9;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #7A6138;">Submit to {{submission_route}}. Review takes {{review_window}}, so build that into your contractor&#39;s schedule rather than discovering it the week they are due to start.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The reason to submit first is simple: if something is built without approval and does not conform, the owner can be required to remove it at their own cost. That is a miserable outcome for everyone and it is entirely avoidable with one form.</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Not sure whether your project needs approval? Ask before you order materials. We would much rather answer a quick question than review a finished deck.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

This is the season when projects start, so a reminder while yours is still an idea: most exterior changes need written approval before work begins.

Work that typically requires approval includes {{project_types}}.

Submit to {{submission_route}}. Review takes {{review_window}}, so build that into your contractor's schedule rather than discovering it the week they are due to start.

The reason to submit first is simple: if something is built without approval and does not conform, the owner can be required to remove it at their own cost. That is a miserable outcome for everyone and it is entirely avoidable with one form.

Not sure whether your project needs approval? Ask before you order materials. We would much rather answer a quick question than review a finished deck.$tpl$,
    $tpl$[{"id":"project_types","label":"What needs approval here?","type":"multiselect","options":["fences and walls","decks, patios and pergolas","exterior paint colour changes","roof replacement and material changes","sheds and outbuildings","solar panels, satellite dishes and antennas"],"required":true,"help":"Take this from the architectural guidelines rather than memory — an incomplete list here is read as permission for anything not on it."},{"id":"submission_route","label":"How do owners submit?","type":"text","required":true,"help":"The form, the portal, or the email address — plus what has to accompany it (plans, materials, a survey)."},{"id":"review_window","label":"How long does review take?","type":"text","required":true,"help":"Use the period in your documents. Many set a deadline after which an unanswered application is deemed approved."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"architectural-review-reminder.png","alt":"A drafting compass over architectural lines"}$tpl$::jsonb,
    $tpl$["association_name","project_types","recipient_name","review_window","submission_route"]$tpl$::jsonb
  ),
  (
    'holiday-decoration-timing',
    'Holiday Decorations — When They Can Go Up and Come Down',
    'A seasonal note on decoration timing, written so it applies to every holiday rather than one. Send well before the season so the dates are a plan and not a correction.',
    'reminder',
    '#96407A',
    'Decoration dates for {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">The window for putting decorations up and taking them down.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#96407A" style="background-color:#96407A;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">When They Can Go Up and Come Down</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Decorations are one of the nicer things neighborhoods do, and the association is not trying to referee taste. The only rule worth stating is timing, so nothing lingers into the following season.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f2ebf0" style="background-color:#f2ebf0;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/holiday-decoration-timing.png" alt="A party popper releasing streamers" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1e9ee" style="background-color:#f1e9ee;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#f1e9ee;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #96407A;">Decorations may go up from {{display_start}} and should come down by {{display_end}}.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">{{additional_guidance}}</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If you need longer — a display that takes a while to dismantle, or a stretch away from home — just reply and tell us. We will note it and leave you alone.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Decorations are one of the nicer things neighborhoods do, and the association is not trying to referee taste. The only rule worth stating is timing, so nothing lingers into the following season.

Decorations may go up from {{display_start}} and should come down by {{display_end}}.

{{additional_guidance}}

If you need longer — a display that takes a while to dismantle, or a stretch away from home — just reply and tell us. We will note it and leave you alone.$tpl$,
    $tpl$[{"id":"display_start","label":"Decorations may go up from","type":"date","required":true},{"id":"display_end","label":"And should come down by","type":"date","required":true},{"id":"additional_guidance","label":"Anything else worth saying?","type":"textarea","required":false,"fallback":"Please keep displays clear of sidewalks and driveways, and keep any extension cords off walking paths.","help":"Common additions: limits on inflatables, projected lights, sound, or anything that spills into shared areas."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"holiday-decoration-timing.png","alt":"A party popper releasing streamers"}$tpl$::jsonb,
    $tpl$["additional_guidance","association_name","display_end","display_start","recipient_name"]$tpl$::jsonb
  ),
  (
    'lawn-and-landscaping',
    'Lawn and Landscaping — Seasonal Upkeep Reminder',
    'A community-wide nudge about yard maintenance ahead of the season, sent before individual violation notices go out. Names the standard and the deadline so nobody is surprised by a letter.',
    'reminder',
    '#3E6B22',
    'Yard upkeep in {{association_name}} before {{deadline_date}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What the standard is, and when inspections start.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#3E6B22" style="background-color:#3E6B22;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Seasonal Upkeep Reminder</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Ahead of {{season_context}}, this is a reminder about yard upkeep — sent to everyone, so please do not read it as a note about your particular yard.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#ebefe9" style="background-color:#ebefe9;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/lawn-and-landscaping.png" alt="Blades of grass" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The items that most often come up are {{upkeep_items}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e9ede7" style="background-color:#e9ede7;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e9ede7;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #3E6B22;">Walk-throughs begin {{deadline_date}}. Anything addressed before then will not generate a letter.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If keeping up with your yard is difficult right now — illness, travel, cost, a landscaper who stopped showing up — reply to this email. We would far rather help you find a solution than send a violation notice.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Ahead of {{season_context}}, this is a reminder about yard upkeep — sent to everyone, so please do not read it as a note about your particular yard.

The items that most often come up are {{upkeep_items}}.

Walk-throughs begin {{deadline_date}}. Anything addressed before then will not generate a letter.

If keeping up with your yard is difficult right now — illness, travel, cost, a landscaper who stopped showing up — reply to this email. We would far rather help you find a solution than send a violation notice.$tpl$,
    $tpl$[{"id":"season_context","label":"What is the occasion?","type":"select","options":["the spring growing season","the summer months","fall leaf drop","the annual property walk-through"],"required":true},{"id":"upkeep_items","label":"What needs attention?","type":"multiselect","options":["grass height and edging","weeds in beds and along walkways","overgrown shrubs blocking sidewalks","dead or fallen limbs","leaves left in gutters and drains","bare or eroding areas of lawn"],"required":true},{"id":"deadline_date","label":"When do walk-throughs begin?","type":"date","required":true,"help":"Give people a realistic window — at least two weekends, and more if a landscaper is needed."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"lawn-and-landscaping.png","alt":"Blades of grass"}$tpl$::jsonb,
    $tpl$["association_name","deadline_date","recipient_name","season_context","upkeep_items"]$tpl$::jsonb
  ),
  (
    'mailbox-and-exterior-upkeep',
    'Mailboxes and Exterior Upkeep — Faded, Damaged or Mismatched',
    'A community-wide note about the exterior items that drift out of standard slowly — mailboxes, house numbers, shutters, paint. Includes where to source a matching replacement, which is usually the real blocker.',
    'reminder',
    '#2F6B6B',
    'Mailboxes and exteriors in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What is drifting out of standard, and where to get a match.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#2F6B6B" style="background-color:#2F6B6B;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Faded, Damaged or Mismatched</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Exterior items wear out slowly enough that nobody notices their own — which is why this goes to everyone rather than to the handful of homes we happened to walk past.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#eaefef" style="background-color:#eaefef;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/mailbox-and-exterior-upkeep.png" alt="A mailbox with its flag raised" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The items showing wear across the community are {{upkeep_items}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e8eded" style="background-color:#e8eded;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e8eded;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #2F6B6B;">{{sourcing_info}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Replacing a mailbox is a small job made annoying by not knowing which one to buy. If you are unsure whether yours needs attention, reply with a photo and we will tell you honestly.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Exterior items wear out slowly enough that nobody notices their own — which is why this goes to everyone rather than to the handful of homes we happened to walk past.

The items showing wear across the community are {{upkeep_items}}.

{{sourcing_info}}

Replacing a mailbox is a small job made annoying by not knowing which one to buy. If you are unsure whether yours needs attention, reply with a photo and we will tell you honestly.$tpl$,
    $tpl$[{"id":"upkeep_items","label":"What needs attention?","type":"multiselect","options":["faded or peeling mailbox paint","leaning or damaged mailbox posts","missing or unreadable house numbers","shutters that are faded or coming loose","front doors and trim needing paint","damaged or discolored driveways and walkways"],"required":true},{"id":"sourcing_info","label":"Where do residents get a matching replacement?","type":"textarea","required":true,"help":"This is the part that actually gets it done — the approved model, supplier, colour code, or the vendor the association uses. Without it most people simply postpone."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"mailbox-and-exterior-upkeep.png","alt":"A mailbox with its flag raised"}$tpl$::jsonb,
    $tpl$["association_name","recipient_name","sourcing_info","upkeep_items"]$tpl$::jsonb
  ),
  (
    'noise-and-quiet-hours',
    'Noise — Quiet Hours and Being a Good Neighbor',
    'A community-wide reminder of quiet hours and the kinds of noise that have been generating complaints. Send before anyone files a formal complaint against a specific household.',
    'reminder',
    '#8A4B2A',
    'Quiet hours in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">When quiet hours run, and what has been coming up lately.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#8A4B2A" style="background-color:#8A4B2A;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Quiet Hours and Being a Good Neighbor</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We&#39;ve had a few reports about {{noise_source}} recently, so this is a general reminder rather than a note aimed at anyone in particular.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f1ece9" style="background-color:#f1ece9;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/noise-and-quiet-hours.png" alt="A speaker emitting sound waves" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0eae7" style="background-color:#f0eae7;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#f0eae7;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #8A4B2A;">Quiet hours run from {{quiet_start}} to {{quiet_end}}. Outside those hours, ordinary daytime noise is expected and fine.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Most noise complaints resolve with a short conversation between neighbors, and we would rather that than a formal process. If a direct conversation is uncomfortable or has not worked, reply to this email and we will follow up discreetly.</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Thanks for being considerate — sound carries further between these homes than most people expect.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

We've had a few reports about {{noise_source}} recently, so this is a general reminder rather than a note aimed at anyone in particular.

Quiet hours run from {{quiet_start}} to {{quiet_end}}. Outside those hours, ordinary daytime noise is expected and fine.

Most noise complaints resolve with a short conversation between neighbors, and we would rather that than a formal process. If a direct conversation is uncomfortable or has not worked, reply to this email and we will follow up discreetly.

Thanks for being considerate — sound carries further between these homes than most people expect.$tpl$,
    $tpl$[{"id":"noise_source","label":"What has been generating complaints?","type":"multiselect","options":["late-night music and gatherings","barking dogs","early-morning lawn equipment","vehicle engines and car audio","contractor work outside permitted hours","children playing late in shared areas"],"required":true,"help":"Pick the categories, not the households. Naming a source is a reminder; naming a neighbor is an accusation."},{"id":"quiet_start","label":"Quiet hours start","type":"time","required":true,"help":"Use the time in your governing documents, not a time the board prefers."},{"id":"quiet_end","label":"Quiet hours end","type":"time","required":true}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"noise-and-quiet-hours.png","alt":"A speaker emitting sound waves"}$tpl$::jsonb,
    $tpl$["association_name","noise_source","quiet_end","quiet_start","recipient_name"]$tpl$::jsonb
  ),
  (
    'play-equipment-in-roadway',
    'Basketball Hoops and Play Equipment in the Street',
    'A reminder about portable hoops, goals and toys left in the roadway. Written to protect kids playing outside rather than to stop them, because the version that reads as anti-children generates more complaints than it resolves.',
    'reminder',
    '#9A4E1C',
    'Play equipment in the streets of {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Keeping the roadway clear without pushing kids indoors.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#9A4E1C" style="background-color:#9A4E1C;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Basketball Hoops and Play Equipment in the Street</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Kids playing outside is one of the better things about living here, and nothing in this note is meant to change that. The issue is equipment left in the roadway after everyone has gone in.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f2ece8" style="background-color:#f2ece8;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/play-equipment-in-roadway.png" alt="A basketball, of the kind used with a portable hoop" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">A hoop or goal parked at the curb overnight — most often around {{affected_areas}} — is invisible to a driver at dusk, forces cars into the oncoming lane, and is the first thing a delivery truck hits.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1ebe6" style="background-color:#f1ebe6;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#f1ebe6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #9A4E1C;">{{storage_guidance}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If your equipment is too heavy to move on your own, reply and let us know — that is a solvable problem and not a reason for a violation notice.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Kids playing outside is one of the better things about living here, and nothing in this note is meant to change that. The issue is equipment left in the roadway after everyone has gone in.

A hoop or goal parked at the curb overnight — most often around {{affected_areas}} — is invisible to a driver at dusk, forces cars into the oncoming lane, and is the first thing a delivery truck hits.

{{storage_guidance}}

If your equipment is too heavy to move on your own, reply and let us know — that is a solvable problem and not a reason for a violation notice.$tpl$,
    $tpl$[{"id":"storage_guidance","label":"What are you asking residents to do?","type":"textarea","required":true,"help":"Be concrete and achievable — e.g. \"Please move portable hoops back onto your driveway at the end of the day.\""},{"id":"affected_areas","label":"Where is it happening? (optional)","type":"multiselect","options":["the cul-de-sacs","the main loop road","the streets near the playground","throughout the community"],"required":false,"fallback":"several streets"}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"play-equipment-in-roadway.png","alt":"A basketball, of the kind used with a portable hoop"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","recipient_name","storage_guidance"]$tpl$::jsonb
  ),
  (
    'pool-rules-and-guests',
    'Pool Rules — Guests, Glass and Supervision',
    'In-season conduct at the pool: guest limits, glass, and who must supervise children. Distinct from the pool pass renewal template, which is about paperwork before opening day.',
    'reminder',
    '#1C6F31',
    'Pool rules for the season in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Guests, glass, and supervision — the three that come up every year.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#1C6F31" style="background-color:#1C6F31;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Guests, Glass and Supervision</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The pool is open and mostly runs itself. These are the few rules that come up every season, sent to everyone at once so nobody gets singled out at the gate.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#e8efea" style="background-color:#e8efea;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/pool-rules-and-guests.png" alt="A swimmer doing the front crawl" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<ul style="margin:0 0 11px;padding-left:20px;font-size:14px;line-height:1.6;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;"><li style="margin-bottom:4px;color:#3D454D;">Guests: {{guest_policy}}</li><li style="margin-bottom:4px;color:#3D454D;">No glass of any kind inside the pool area.</li><li style="margin-bottom:4px;color:#3D454D;">Children: {{supervision_policy}}</li><li style="margin-bottom:4px;color:#3D454D;">Pool hours are {{pool_hours}}.</li></ul>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e6ede8" style="background-color:#e6ede8;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e6ede8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #1C6F31;">There is no lifeguard on duty. Everyone swims at their own risk, and an adult must be responsible for every child in the water.</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If something is wrong with the pool itself — cloudy water, a broken gate latch, missing safety equipment — reply immediately. A gate that does not latch is the one problem here that cannot wait.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

The pool is open and mostly runs itself. These are the few rules that come up every season, sent to everyone at once so nobody gets singled out at the gate.

  - Guests: {{guest_policy}}
  - No glass of any kind inside the pool area.
  - Children: {{supervision_policy}}
  - Pool hours are {{pool_hours}}.

There is no lifeguard on duty. Everyone swims at their own risk, and an adult must be responsible for every child in the water.

If something is wrong with the pool itself — cloudy water, a broken gate latch, missing safety equipment — reply immediately. A gate that does not latch is the one problem here that cannot wait.$tpl$,
    $tpl$[{"id":"guest_policy","label":"What is the guest rule?","type":"text","required":true,"help":"e.g. \"up to four guests per household, and a resident must be present with them\""},{"id":"supervision_policy","label":"What is the child supervision rule?","type":"text","required":true,"help":"Use the age from your pool rules, not a guess — this is the rule most likely to be quoted back to you."},{"id":"pool_hours","label":"Pool hours","type":"text","required":true}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"pool-rules-and-guests.png","alt":"A swimmer doing the front crawl"}$tpl$::jsonb,
    $tpl$["association_name","guest_policy","pool_hours","recipient_name","supervision_policy"]$tpl$::jsonb
  ),
  (
    'severe-weather-prep',
    'Severe Weather — What to Secure and Who to Call',
    'Ahead of a storm or a season: what residents should secure, what the association handles, and who to call when. The division of responsibility is the part people get wrong at 2am.',
    'notice',
    '#5560B4',
    'Storm preparation for {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What to secure, and who handles what afterwards.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#5560B4" style="background-color:#5560B4;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">What to Secure and Who to Call</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">With {{weather_event}} expected, here is what is worth doing in advance and how responsibility divides once it passes.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#edeef4" style="background-color:#edeef4;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/severe-weather-prep.png" alt="A cloud with a lightning bolt" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Before it arrives, please secure {{items_to_secure}}. Loose items in shared areas become projectiles, and most storm damage in a neighborhood like ours is caused by a neighbor&#39;s patio furniture rather than by the wind itself.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ebecf4" style="background-color:#ebecf4;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#ebecf4;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #5560B4;">{{responsibility_split}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">For anything genuinely dangerous — downed power lines, a gas smell, structural damage, water rising into a home — call 911 first. Do not wait on the association, and do not reply to this email and wait for us to see it.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

With {{weather_event}} expected, here is what is worth doing in advance and how responsibility divides once it passes.

Before it arrives, please secure {{items_to_secure}}. Loose items in shared areas become projectiles, and most storm damage in a neighborhood like ours is caused by a neighbor's patio furniture rather than by the wind itself.

{{responsibility_split}}

For anything genuinely dangerous — downed power lines, a gas smell, structural damage, water rising into a home — call 911 first. Do not wait on the association, and do not reply to this email and wait for us to see it.$tpl$,
    $tpl$[{"id":"weather_event","label":"What are you preparing for?","type":"select","options":["severe thunderstorms","a tropical storm or hurricane","a winter storm and freezing temperatures","the coming storm season","high winds"],"required":true},{"id":"items_to_secure","label":"What should residents secure?","type":"multiselect","options":["patio furniture and umbrellas","trash and recycling bins","grills and fire pits","garden decorations and planters","trampolines and play equipment","holiday decorations and flags"],"required":true},{"id":"responsibility_split","label":"Who handles what afterwards?","type":"textarea","required":true,"help":"The most useful thing in this email. State plainly what the association clears versus what an owner is responsible for, and the number to call for each."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"severe-weather-prep.png","alt":"A cloud with a lightning bolt"}$tpl$::jsonb,
    $tpl$["association_name","items_to_secure","recipient_name","responsibility_split","weather_event"]$tpl$::jsonb
  ),
  (
    'short-term-rental-policy',
    'Short-Term Rentals — What the Documents Allow',
    'A statement of the association''s short-term rental position, sent community-wide so owners considering listing find out before they book guests rather than after. Pairs with the lease cap template.',
    'notice',
    '#7A5A1F',
    'Short-term rentals in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">What the governing documents allow, and what to do before listing.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#7A5A1F" style="background-color:#7A5A1F;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">What the Documents Allow</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Short-term rentals come up regularly, so here is the association&#39;s position in one place — sent to every owner, not prompted by any particular listing.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f0ede8" style="background-color:#f0ede8;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/short-term-rental-policy.png" alt="A door key with a looped handle, as handed to a tenant" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eeece6" style="background-color:#eeece6;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#eeece6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #7A5A1F;">{{policy_summary}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If you are considering renting your home, {{owner_next_step}}</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">A practical note: whatever the association&#39;s rules, your mortgage, your insurer and the county may each have their own position on short-term rentals, and those are not the association&#39;s to waive. Check all three before you list.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

Short-term rentals come up regularly, so here is the association's position in one place — sent to every owner, not prompted by any particular listing.

{{policy_summary}}

If you are considering renting your home, {{owner_next_step}}

A practical note: whatever the association's rules, your mortgage, your insurer and the county may each have their own position on short-term rentals, and those are not the association's to waive. Check all three before you list.$tpl$,
    $tpl$[{"id":"policy_summary","label":"What do the documents actually say?","type":"textarea","required":true,"help":"Quote or closely paraphrase the leasing provision, including any minimum lease term. If the documents are genuinely silent or ambiguous, say so plainly rather than stating a position the board wishes were true."},{"id":"owner_next_step","label":"What should an owner do first?","type":"textarea","required":true,"help":"e.g. \"please contact the board before listing, so we can confirm whether the lease cap has room and register the tenancy.\""}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"short-term-rental-policy.png","alt":"A door key with a looped handle, as handed to a tenant"}$tpl$::jsonb,
    $tpl$["association_name","owner_next_step","policy_summary","recipient_name"]$tpl$::jsonb
  ),
  (
    'speeding-and-traffic-safety',
    'Speeding and Traffic Safety in the Neighborhood',
    'A community-wide note about driving speed, stop signs and visibility. Written on the assumption that most speeders live here, which is what makes this worth sending at all.',
    'reminder',
    '#A33A3A',
    'Slowing down in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Where it is worst, and what the board is doing about it.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#A33A3A" style="background-color:#A33A3A;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Speeding and Traffic Safety in the Neighborhood</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We have had repeated reports of {{traffic_issue}}, particularly around {{affected_areas}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#f3ebeb" style="background-color:#f3ebeb;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/speeding-and-traffic-safety.png" alt="A speedometer with its needle low in the range" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Worth saying plainly: almost everyone driving through this neighborhood lives in it. This is not about outsiders. It is about the gap between the speed that feels normal on a familiar street and the speed at which a driver can stop for a child stepping out between parked cars.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2e9e9" style="background-color:#f2e9e9;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#f2e9e9;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #A33A3A;">The posted limit is {{speed_limit}}. {{board_action}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If there is a spot where sightlines are genuinely bad — an overgrown corner, a blind driveway, a missing sign — reply and tell us where. That is a fixable problem and we would rather fix it than ask everyone to compensate for it.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

We have had repeated reports of {{traffic_issue}}, particularly around {{affected_areas}}.

Worth saying plainly: almost everyone driving through this neighborhood lives in it. This is not about outsiders. It is about the gap between the speed that feels normal on a familiar street and the speed at which a driver can stop for a child stepping out between parked cars.

The posted limit is {{speed_limit}}. {{board_action}}

If there is a spot where sightlines are genuinely bad — an overgrown corner, a blind driveway, a missing sign — reply and tell us where. That is a fixable problem and we would rather fix it than ask everyone to compensate for it.$tpl$,
    $tpl$[{"id":"traffic_issue","label":"What is happening?","type":"multiselect","options":["speeding on the main road","rolling through stop signs","cutting through the parking areas","distracted driving near the playground","speeding during school drop-off and pickup"],"required":true},{"id":"affected_areas","label":"Where is it worst?","type":"multiselect","options":["the main entrance","the loop road","the streets near the playground","the clubhouse and pool area","the school bus stop"],"required":true},{"id":"speed_limit","label":"Posted speed limit","type":"text","required":true,"help":"e.g. \"25 mph\". Use what is actually posted, not what the board wishes it were."},{"id":"board_action","label":"What is the board doing?","type":"textarea","required":false,"fallback":"The board is reviewing options and welcomes suggestions.","help":"A reminder with no action behind it reads as noise. Signage, a speed study, striping, or a request to the county all count."}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"speeding-and-traffic-safety.png","alt":"A speedometer with its needle low in the range"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","board_action","recipient_name","speed_limit","traffic_issue"]$tpl$::jsonb
  ),
  (
    'street-parking-and-vehicles',
    'Street Parking — Blocked Access and Inoperable Vehicles',
    'A community-wide reminder about parking on the street, blocking access, and vehicles that have not moved in weeks. Distinct from guest parking: this is about resident vehicles and access, not visitors.',
    'reminder',
    '#2C5F8A',
    'Parking and access in {{association_name}}',
    $tpl$<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#F1F3F5;color:#1A1D21;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F3F5;">Keeping the streets passable for trucks and emergency vehicles.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F3F5" style="background-color:#F1F3F5;color:#1A1D21;">
<tr><td align="center" bgcolor="#F1F3F5" style="padding:18px;background-color:#F1F3F5;color:#1A1D21;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;background-color:#FFFFFF;color:#1A1D21;border:1px solid #E8EBED;">
<tr><td bgcolor="#2C5F8A" style="background-color:#2C5F8A;color:#ffffff;padding:13px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">{{association_name}}</td></tr>
<tr><td bgcolor="#FFFFFF" style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Blocked Access and Inoperable Vehicles</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">We&#39;ve had trouble lately with {{parking_issue}}, most often around {{affected_areas}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="#eaeef1" style="background-color:#eaeef1;color:#1A1D21;">
<img src="https://www.homeownerledger.com/email/v1/street-parking-and-vehicles.png" alt="A parked car seen from the front three-quarter view" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">The practical concern is access. A fire truck needs a clear lane, and a moving van or trash truck that cannot get through simply leaves — which means the whole street waits another week.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e7ecf0" style="background-color:#e7ecf0;color:#1A1D21;margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:#1A1D21;background-color:#e7ecf0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;border-left:4px solid #2C5F8A;">{{parking_guidance}}</td></tr></table>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">If you are expecting a delivery, a contractor, or a stretch of guests, reply to this email and let us know. A heads-up prevents almost every complaint we receive.</p>
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:#8A939B;padding:14px 22px;border-top:1px solid #E8EBED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;">
Sent to residents of {{association_name}}.
</td></tr>
</table>
</td></tr></table>
</body></html>$tpl$,
    $tpl${{association_name}}

Hi {{recipient_name}},

We've had trouble lately with {{parking_issue}}, most often around {{affected_areas}}.

The practical concern is access. A fire truck needs a clear lane, and a moving van or trash truck that cannot get through simply leaves — which means the whole street waits another week.

{{parking_guidance}}

If you are expecting a delivery, a contractor, or a stretch of guests, reply to this email and let us know. A heads-up prevents almost every complaint we receive.$tpl$,
    $tpl$[{"id":"parking_issue","label":"What is the problem?","type":"multiselect","options":["vehicles parked in the roadway overnight","cars blocking driveways or mailboxes","parking too close to corners and fire hydrants","vehicles that have not moved in weeks","trailers, boats or RVs parked in view","commercial vehicles parked overnight"],"required":true},{"id":"affected_areas","label":"Where is it worst?","type":"multiselect","options":["the main entrance","the cul-de-sacs","the clubhouse lot","the visitor spaces","the streets near the playground","throughout the community"],"required":true},{"id":"parking_guidance","label":"What should residents do instead?","type":"textarea","required":true,"help":"State the rule plainly — e.g. \"Park in your driveway or garage first. On-street parking is for guests, and never overnight.\""}]$tpl$::jsonb,
    $tpl${"kind":"illustration","asset":"street-parking-and-vehicles.png","alt":"A parked car seen from the front three-quarter view"}$tpl$::jsonb,
    $tpl$["affected_areas","association_name","parking_guidance","parking_issue","recipient_name"]$tpl$::jsonb
  )
) AS v(slug, name, description, shape, accent, subject, body_html, body_text,
       questions, visual_block, variables)
ON CONFLICT (topic_slug) WHERE organization_id IS NULL
DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  shape        = EXCLUDED.shape,
  accent_color = EXCLUDED.accent_color,
  subject      = EXCLUDED.subject,
  body_html    = EXCLUDED.body_html,
  body_text    = EXCLUDED.body_text,
  questions    = EXCLUDED.questions,
  visual_block = EXCLUDED.visual_block,
  variables    = EXCLUDED.variables,
  updated_at   = now();

COMMIT;

-- Verification
SELECT 'global community templates' AS check,
       CASE WHEN count(*) = 19 THEN 'PASS'
            ELSE 'FAIL — got ' || count(*) END AS result
FROM public.communication_templates
WHERE organization_id IS NULL AND category = 'community';
