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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#1A1D21;font-weight:700;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Where the Community Stands</h1><p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">Hi {{recipient_name}},</p>
<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:#3D454D;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">This is a periodic update on the community’s rental cap, set under {{policy_reference}}. Right now {{leased_count}} of {{total_units}} homes are leased — that’s {{leased_pct}} against a cap of {{cap_pct}}. {{remaining_slots}} more homes may still be leased, and {{waiting_phrase}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f5" style="background-color:#eef0f5;color:#1A1D21;margin:14px 0;">
<tr><td style="padding:15px 17px;background-color:#eef0f5;color:#1A1D21;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="font-size:12px;font-weight:700;color:#1A1D21;">Homes currently leased</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:9px 0 7px;">
<tr>
<td width="0%" bgcolor="#3A5AA8" style="width:0%;background-color:#3A5AA8;color:#3A5AA8;font-size:1px;line-height:18px;">&nbsp;</td>
<td bgcolor="#E8EBED" style="background-color:#E8EBED;color:#E8EBED;font-size:1px;line-height:18px;">&nbsp;</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:11px;color:#5C6670;background-color:#eef0f5;"></td>
<td align="right" style="font-size:11px;font-weight:700;color:#1A1D21;background-color:#eef0f5;"></td>
</tr></table>

</td></tr></table>
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
    $tpl${"kind":"meter","label":"Homes currently leased","valuePct":0,"capPct":1,"valueLabel":"","capLabel":""}$tpl$::jsonb,
    $tpl$["association_name","cap_pct","contact_name","leased_count","leased_pct","policy_reference","recipient_name","remaining_slots","total_units","waiting_list_status","waiting_phrase"]$tpl$::jsonb
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
<tr><td style="padding:22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1D21;background-color:#FFFFFF;">
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
       CASE WHEN count(*) = 7 THEN 'PASS'
            ELSE 'FAIL — got ' || count(*) END AS result
FROM public.communication_templates
WHERE organization_id IS NULL AND category = 'community';
