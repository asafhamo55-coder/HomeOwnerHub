/**
 * scripts/seed-demo-comms.ts
 *
 * Populates a demo HOA association with 30 varied communications across
 * all 8 categories. Each comm gets realistic recipient counts, dates
 * spread over the last 90 days, and a believable delivery-state mix
 * (mostly delivered+opened, some replied, a few bounced).
 *
 * Idempotent: each comm row has a stable subject prefix the script
 * uses to skip already-seeded rows on re-run.
 *
 * Usage:
 *   pnpm seed:demo-comms
 *   SEED_ORG_NAME="Creek Valley HOA (Demo)" pnpm seed:demo-comms
 *
 * Defaults to the first HOA org whose name contains "Demo". When you
 * want to wipe + reseed:
 *   pnpm seed:demo-comms --reset
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[seed-demo-comms] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

const DEMO_TAG = 'demo-comm-seed'                // memo / external_id prefix

// ─── 30 communications, spread across categories ─────────────────────

type Category =
  | 'welcome' | 'dues' | 'meeting' | 'violation' | 'arc'
  | 'financial' | 'emergency' | 'announcement'

type Status = 'sent' | 'scheduled' | 'draft' | 'failed'

interface CommSeed {
  category: Category
  subject: string
  bodyHtml: string
  channels: string[]
  audienceLabel: string
  audienceKind: 'everyone' | 'owners_only' | 'tenants_only' | 'late_on_dues' | 'open_violations' | 'specific_units'
  recipientCount: number
  daysAgo: number             // when the comm was sent (or scheduled-for if status === 'scheduled')
  status: Status
}

const COMMS: CommSeed[] = [
  // ─── Welcome (3) ────────────────────────────────────────────────────
  { category: 'welcome', subject: 'Welcome to Creek Valley, the Murphy family!',
    bodyHtml: '<p>Hi Murphys,</p><p>Welcome to your new home at <strong>4825 Park Ave</strong>. We\'re thrilled to have you join the community.</p><p>Your resident portal invite is on its way separately — please use it to set up dues autopay and review the governing documents.</p><p>Welcome aboard!<br/>— The Board at Creek Valley</p>',
    channels: ['email', 'portal'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 2, status: 'sent' },
  { category: 'welcome', subject: 'Resident portal invitation — set up your account',
    bodyHtml: '<p>Hi Garcia family,</p><p>Click below to activate your resident portal account. Once active, you can:</p><ul><li>Pay dues with autopay</li><li>Submit ARC requests</li><li>Browse community documents</li><li>Report issues</li></ul><p>— Creek Valley Board</p>',
    channels: ['email'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 8, status: 'sent' },
  { category: 'welcome', subject: 'New homeowner orientation — May 25 at 6pm',
    bodyHtml: '<p>Three families have joined Creek Valley in the past two months. We\'re hosting an informal orientation at the clubhouse on <strong>May 25 at 6pm</strong> — covers amenity access, parking, gate codes, and how to reach the board.</p><p>RSVP by replying to this email.</p>',
    channels: ['email', 'portal'], audienceLabel: '3 new owners', audienceKind: 'specific_units',
    recipientCount: 3, daysAgo: 14, status: 'sent' },

  // ─── Dues (8) ──────────────────────────────────────────────────────
  { category: 'dues', subject: 'May dues reminder — due May 15',
    bodyHtml: '<p>Friendly reminder: your <strong>$345 May assessment</strong> is due Wednesday, May 15. Pay via the resident portal — takes about a minute.</p><p>If you\'ve already paid, please disregard.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 10, status: 'sent' },
  { category: 'dues', subject: 'Past due: $345 for May',
    bodyHtml: '<p>Our records show your May dues of <strong>$345</strong> were due May 15 and remain unpaid. A late fee of $17.25 has been added.</p><p>Please pay the balance of <strong>$362.25</strong> through the resident portal, or reply to set up a payment plan.</p>',
    channels: ['email'], audienceLabel: 'Units late on dues (8)', audienceKind: 'late_on_dues',
    recipientCount: 8, daysAgo: 1, status: 'sent' },
  { category: 'dues', subject: 'Final notice before referral to collections — 3 units',
    bodyHtml: '<p>This is the final notice for your outstanding balance of <strong>$1,127.50</strong> covering Feb–May assessments and accrued late fees.</p><p>If payment or a written payment plan is not received by <strong>June 1</strong>, the account will be referred to collections per CC&R Article 8.</p>',
    channels: ['email', 'mail'], audienceLabel: '3 hand-picked units', audienceKind: 'specific_units',
    recipientCount: 3, daysAgo: 4, status: 'sent' },
  { category: 'dues', subject: 'Q2 special assessment — $480 per unit for asphalt resurfacing',
    bodyHtml: '<p>The board has approved a <strong>special assessment of $480 per unit</strong> to fund the long-deferred east-driveway asphalt resurfacing scheduled for July.</p><p>Charge appears on your July statement; payment is due July 15. A 6-month payment plan is available — reply if you\'d like to set one up.</p><p>The full board resolution and updated reserve study are posted in the portal.</p>',
    channels: ['email', 'portal', 'mail'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 21, status: 'sent' },
  { category: 'dues', subject: 'Thank you — May payment received',
    bodyHtml: '<p>We received your May payment of $345 on May 12. Thanks for paying early!</p><p>Your next statement (June) posts June 1.</p>',
    channels: ['email'], audienceLabel: '54 paid-early units', audienceKind: 'specific_units',
    recipientCount: 54, daysAgo: 5, status: 'sent' },
  { category: 'dues', subject: '2026 dues increase — board vote May 30',
    bodyHtml: '<p>The board is considering a <strong>4.2% dues increase</strong> ($14.50/month) for 2026 to keep pace with insurance, water, and reserve contributions.</p><p>Vote happens at the May 30 board meeting. Comments welcome by reply or in person.</p>',
    channels: ['email', 'portal'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 32, status: 'sent' },
  { category: 'dues', subject: 'June dues reminder — due June 15',
    bodyHtml: '<p>Friendly reminder: your <strong>$345 June assessment</strong> is due Saturday, June 15. Pay via the resident portal.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: -7, status: 'scheduled' },
  { category: 'dues', subject: 'Late fee waived — one-time courtesy',
    bodyHtml: '<p>The $17.25 late fee on your April statement has been waived as a one-time courtesy. Your account is back in good standing.</p><p>Please note: late fees accrue automatically going forward.</p>',
    channels: ['email'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 18, status: 'sent' },

  // ─── Violation (4) ─────────────────────────────────────────────────
  { category: 'violation', subject: 'Notice of violation — lawn height exceeds 6"',
    bodyHtml: '<p>Per a routine compliance walk on <strong>May 9</strong>, your front lawn height exceeds the 6" maximum (CC&R Article 4.3.2).</p><p>Please bring the lawn into compliance by <strong>May 23</strong> (14-day cure period). If you need a referral to a local landscaping vendor, reply and we\'ll send a few options.</p>',
    channels: ['email', 'mail'], audienceLabel: '4 hand-picked units', audienceKind: 'specific_units',
    recipientCount: 4, daysAgo: 9, status: 'sent' },
  { category: 'violation', subject: 'Final cure notice — RV parked in driveway (Article 4.6)',
    bodyHtml: '<p>Your RV has been parked in the driveway since April 14, exceeding the 72-hour limit per CC&R Article 4.6.1.</p><p>This is a final notice. If not relocated to approved off-site storage by <strong>May 25</strong>, the matter will be referred to the board for a fine hearing.</p>',
    channels: ['email', 'mail'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 6, status: 'sent' },
  { category: 'violation', subject: 'Violation resolved — thank you for cooperating',
    bodyHtml: '<p>We confirmed today that the trash bins behind your unit have been brought back inside the gate. The violation is closed.</p><p>Thanks for your prompt response.</p>',
    channels: ['email'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 12, status: 'sent' },
  { category: 'violation', subject: 'Compliance hearing scheduled — June 4 at 7pm',
    bodyHtml: '<p>Per CC&R Article 8, a compliance hearing is scheduled for your account to address the unresolved parking violation.</p><p><strong>Date:</strong> Tuesday, June 4 at 7pm<br/><strong>Location:</strong> Clubhouse</p><p>You may attend in person or submit a written response by June 1.</p>',
    channels: ['email', 'mail'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 3, status: 'sent' },

  // ─── ARC (3) ───────────────────────────────────────────────────────
  { category: 'arc', subject: 'ARC approval — exterior paint (Sherwin Williams "Mindful Gray")',
    bodyHtml: '<p>Your architectural request for exterior repaint has been <strong>approved</strong>.</p><p><strong>Conditions:</strong></p><ul><li>Approved color: Sherwin Williams "Mindful Gray" (SW 7016)</li><li>Trim must match existing white</li><li>Work begins within 60 days, completes within 90</li></ul><p>Notify the board within 7 days of completion for a brief inspection.</p>',
    channels: ['email', 'portal'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 16, status: 'sent' },
  { category: 'arc', subject: 'ARC application — additional documentation needed',
    bodyHtml: '<p>Your ARC request for a backyard shed (8x10 wood, dark green) is under review. To proceed, the committee needs:</p><ul><li>Site plan showing setback from rear fence (5\' minimum)</li><li>Drainage plan if grading is changing</li><li>Confirmation that the shed will not be plumbed</li></ul><p>Once received, the committee will respond within 14 days.</p>',
    channels: ['email', 'portal'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 24, status: 'sent' },
  { category: 'arc', subject: 'ARC denial — proposed satellite dish location',
    bodyHtml: '<p>After review, the ARC has <strong>denied</strong> your proposal to install a satellite dish on the front-facing roofline.</p><p><strong>Reason:</strong> CC&R Article 5.7 prohibits visible exterior equipment on front-facing facades.</p><p>You may submit a revised proposal placing the dish on the rear roofline, behind the chimney line of sight. We\'re happy to talk through alternatives.</p>',
    channels: ['email', 'portal'], audienceLabel: '1 hand-picked unit', audienceKind: 'specific_units',
    recipientCount: 1, daysAgo: 20, status: 'sent' },

  // ─── Meeting (4) ───────────────────────────────────────────────────
  { category: 'meeting', subject: '2026 Annual Meeting Notice — June 15 at 7pm',
    bodyHtml: '<p>Dear residents of Creek Valley,</p><p>You are hereby notified that the <strong>2026 Annual Meeting</strong> will be held:</p><p><strong>Date:</strong> Saturday, June 15 at 7pm<br/><strong>Location:</strong> Clubhouse main room<br/><strong>Quorum:</strong> 33% of owners (or 28 owners)</p><p><strong>Agenda highlights:</strong></p><ul><li>Election of 3 board seats</li><li>2026 budget approval</li><li>Reserve study summary</li><li>Pool resurfacing proposals</li></ul><p>Proxies accepted by reply or in person.</p>',
    channels: ['email', 'mail', 'portal'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 28, status: 'sent' },
  { category: 'meeting', subject: 'May board meeting agenda',
    bodyHtml: '<p>The monthly board meeting is <strong>Tuesday, May 21 at 7pm</strong> at the clubhouse.</p><p><strong>Agenda:</strong></p><ul><li>Treasurer\'s report (Q1)</li><li>Reserve study update</li><li>Landscape contract renewal</li><li>3 compliance hearings (closed session)</li></ul><p>Open session begins at 7pm; owners welcome.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 19, status: 'sent' },
  { category: 'meeting', subject: 'April board meeting minutes available',
    bodyHtml: '<p>The minutes from the April 17 board meeting have been posted in the resident portal under Documents → Minutes.</p><p>Key decisions: approved Q1 vendor renewals, accepted the reserve study, scheduled the asphalt resurfacing for July.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 22, status: 'sent' },
  { category: 'meeting', subject: 'Special meeting — Reserve study review, May 30',
    bodyHtml: '<p>A special meeting is called for <strong>Thursday, May 30 at 6:30pm</strong> at the clubhouse.</p><p><strong>Sole agenda item:</strong> Review and accept the 2026 reserve study prepared by Anderson + Co. The study reflects updated component lifespans and recommends a 6% reserve funding increase.</p>',
    channels: ['email', 'mail'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 11, status: 'sent' },

  // ─── Financial (2) ─────────────────────────────────────────────────
  { category: 'financial', subject: 'Q1 2026 Financial Statement — now posted',
    bodyHtml: '<p>The Q1 2026 financial statement is available in the resident portal under Documents → Financials.</p><p><strong>Highlights:</strong></p><ul><li>Operating: $42,180 surplus vs. budget</li><li>Reserve contribution: on target</li><li>Delinquency rate: 4.1% (down from 5.8% Q4)</li></ul>',
    channels: ['email', 'portal'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 38, status: 'sent' },
  { category: 'financial', subject: '2026 reserve study completed — see resident portal',
    bodyHtml: '<p>Anderson + Co. has completed the 2026 reserve study. The full report is in the resident portal under Documents → Reserve Study.</p><p>The board will discuss findings at the May 30 special meeting (separate notice sent).</p>',
    channels: ['email', 'portal'], audienceLabel: 'All owners (82)', audienceKind: 'owners_only',
    recipientCount: 82, daysAgo: 13, status: 'sent' },

  // ─── Emergency (2) ─────────────────────────────────────────────────
  { category: 'emergency', subject: 'URGENT: water main break — east side, shutoff at 4pm',
    bodyHtml: '<p>A water main break has been reported on the east side near units 1240–1268. The water company will shut off service to that section <strong>starting at 4pm today</strong> for emergency repair.</p><p>Estimated restoration: <strong>9pm tonight</strong>.</p><p>If you live in that section, please fill containers now if needed.</p>',
    channels: ['email', 'portal', 'sms'], audienceLabel: '14 east-side units', audienceKind: 'specific_units',
    recipientCount: 14, daysAgo: 17, status: 'sent' },
  { category: 'emergency', subject: 'Gate code changed effective immediately',
    bodyHtml: '<p>The main gate access code has been changed effective immediately.</p><p><strong>New code:</strong> 4837</p><p>This is due to the previous code being shared outside the community. Please share the new code only with people who genuinely need access (visitors, contractors, deliveries).</p><p>The code will rotate again in 60 days.</p>',
    channels: ['email', 'portal', 'sms'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 26, status: 'sent' },

  // ─── Announcement (4) ──────────────────────────────────────────────
  { category: 'announcement', subject: 'Pool opens this Saturday — Memorial Day weekend',
    bodyHtml: '<p>The community pool opens this <strong>Saturday, May 25 at 10am</strong> for the 2026 season.</p><p>A few reminders:</p><ul><li>Hours: 10am–9pm daily</li><li>Children under 14 require adult supervision</li><li>No glass, no alcohol</li><li>Guest passes available at the clubhouse</li></ul><p>See you poolside!</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 7, status: 'sent' },
  { category: 'announcement', subject: 'New landscape contractor starting June 1',
    bodyHtml: '<p>Effective <strong>June 1</strong>, GreenLeaf Landscaping replaces Acme Lawn Care as the community-wide landscape vendor.</p><p><strong>Schedule:</strong> Same as before — mowing Tuesdays, edging Wednesdays.</p><p>Please report any concerns directly to the board (not to the new crew) during the first two weeks of transition.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 25, status: 'sent' },
  { category: 'announcement', subject: 'Community garage sale — Saturday June 8',
    bodyHtml: '<p>The annual community garage sale is set for <strong>Saturday, June 8 from 8am to 2pm</strong>. The board will advertise on Craigslist, NextDoor, and the local Patch.</p><p>Want a yard-sale-prep checklist? Reply and I\'ll send one.</p>',
    channels: ['email', 'portal'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: -3, status: 'scheduled' },
  { category: 'announcement', subject: 'Holiday office hours — Memorial Day weekend',
    bodyHtml: '<p>The board mailbox will be checked daily over the Memorial Day weekend, but in-person availability is limited.</p><p><strong>Emergencies only this weekend</strong> — call the after-hours line at (555) 123-9999.</p>',
    channels: ['email'], audienceLabel: 'Everyone (96 units)', audienceKind: 'everyone',
    recipientCount: 96, daysAgo: 1, status: 'draft' },
]

// ─── Fake residents to populate recipient rows ───────────────────────
// We don't require these to map to real units — `unit_id` is nullable
// and the demo audience labels already report believable counts.

const FAKE_RESIDENTS = [
  'Sarah Murphy', 'James Garcia', 'Emily Chen', 'Michael Thompson', 'Jessica Patel',
  'David Kim', 'Lauren Rodriguez', 'Ryan O\'Brien', 'Amanda Walker', 'Brian Singh',
  'Rachel Davis', 'Tyler Nguyen', 'Stephanie Lopez', 'Jonathan Reed', 'Megan Hill',
  'Christopher Park', 'Olivia Martinez', 'Daniel Foster', 'Ashley Wright', 'Andrew Mitchell',
  'Nicole Hayes', 'Justin Bennett', 'Brittany Cooper', 'Eric Sanchez', 'Hannah Brooks',
  'Matthew Reyes', 'Allison Carter', 'Patrick Bell', 'Kelsey Murphy', 'Joshua Russell',
  'Madison Price', 'Caleb Stewart', 'Hailey Watson', 'Logan Phillips', 'Sophia Diaz',
]

const SAMPLE_REPLIES = [
  { ai_category: 'question',   ai_summary: 'Asks for clarification on payment plan terms.',  body: 'Hi — could you send the payment plan details? Happy to settle this, just need to know the schedule. Thanks.' },
  { ai_category: 'compliance', ai_summary: 'Confirms violation has been cured.',             body: 'Done — mowed today. Thanks for flagging.' },
  { ai_category: 'question',   ai_summary: 'Asks about pool guest pass policy.',             body: 'Quick question: how many guests can we bring on a single visit? Family in town next weekend.' },
  { ai_category: 'complaint',  ai_summary: 'Disputes the violation; provides photo evidence.',body: 'I think this is an error. My lawn was mowed on the 8th — see attached. Please confirm.' },
  { ai_category: 'question',   ai_summary: 'Asks where to find the reserve study.',          body: 'Where do I find the reserve study in the portal? I clicked Documents → Financials but only see the Q1 statement.' },
]

// ─── delivery profiles ───────────────────────────────────────────────

interface DeliveryRoll {
  delivery_status: string
  sent_at?: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  replied_at?: string
  failed_at?: string
  error_message?: string
}

function rollDelivery(sentAt: Date): DeliveryRoll {
  // Probability mix tuned for "looks like a healthy comms feed".
  const r = Math.random()
  const sentIso = sentAt.toISOString()
  const delivered = new Date(sentAt.getTime() + 60_000 + Math.random() * 600_000).toISOString()
  const opened = new Date(sentAt.getTime() + 5 * 60_000 + Math.random() * 4 * 3600_000).toISOString()

  if (r < 0.50) {
    return { delivery_status: 'opened', sent_at: sentIso, delivered_at: delivered, opened_at: opened }
  }
  if (r < 0.65) {
    return { delivery_status: 'delivered', sent_at: sentIso, delivered_at: delivered }
  }
  if (r < 0.78) {
    return {
      delivery_status: 'clicked',
      sent_at: sentIso,
      delivered_at: delivered,
      opened_at: opened,
      clicked_at: new Date(new Date(opened).getTime() + 90_000).toISOString(),
    }
  }
  if (r < 0.85) {
    return {
      delivery_status: 'replied',
      sent_at: sentIso,
      delivered_at: delivered,
      opened_at: opened,
      replied_at: new Date(new Date(opened).getTime() + 30 * 60_000).toISOString(),
    }
  }
  if (r < 0.92) {
    return { delivery_status: 'sent', sent_at: sentIso }
  }
  return {
    delivery_status: 'bounced',
    sent_at: sentIso,
    failed_at: delivered,
    error_message: 'Mailbox does not exist',
  }
}

// ─── main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset')

  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const targetName = process.env.SEED_ORG_NAME
  const { data: assocs } = await db
    .from('associations')
    .select('id, name, organization_id, orgs:organization_id(name, hub_type)')
    .order('created_at', { ascending: true })

  // Prefer an org with "Demo" in its name. Fall back to first HOA assoc.
  const candidates = (assocs ?? []).filter((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetName && org.name === targetName) return true
    return !targetName
  })

  const demo = candidates.find((a) => {
    const org = a.orgs as { name: string } | null
    return org?.name.toLowerCase().includes('demo')
  }) ?? candidates[0]

  if (!demo) {
    console.error('[seed-demo-comms] no HOA association found')
    process.exit(1)
  }

  const orgName = (demo.orgs as { name: string }).name
  console.log(`[seed-demo-comms] target: ${orgName} → ${demo.name} (${demo.id})`)

  if (reset) {
    console.log('[seed-demo-comms] --reset: removing prior demo seed rows…')
    const { data: priorComms } = await db
      .from('communications')
      .select('id')
      .eq('association_id', demo.id)
      .like('subject', '%')                  // we'll narrow via memo audit
      .like('audience_summary', '%')
      .eq('source', 'manual')
    void priorComms
    // Cheapest: delete every demo-tagged audit row (the audience_summary
    // text matches what this script writes). Recipients + replies cascade.
    await db
      .from('communications')
      .delete()
      .eq('association_id', demo.id)
      .ilike('audience_summary', '%(% units)')
    // (the ' (X units)' format is unique to this script)
  }

  let createdCount = 0
  let recipientCount = 0
  for (const seed of COMMS) {
    const created = await seedOne(db, demo, seed)
    if (created.created) {
      createdCount += 1
      recipientCount += created.recipientCount
    }
  }

  console.log(`\n[seed-demo-comms] ✅ created ${createdCount}/${COMMS.length} comms, ${recipientCount} recipients`)
}

async function seedOne(
  db: Db,
  demo: { id: string; organization_id: string },
  seed: CommSeed,
): Promise<{ created: boolean; recipientCount: number }> {
  // Idempotency: skip if a comm with the same subject already exists.
  const { data: existing } = await db
    .from('communications')
    .select('id')
    .eq('association_id', demo.id)
    .eq('subject', seed.subject)
    .maybeSingle()
  if (existing) {
    console.log(`  · skipped (exists): ${seed.subject.slice(0, 60)}`)
    return { created: false, recipientCount: 0 }
  }

  const sentAt = new Date(Date.now() - seed.daysAgo * 86_400_000)
  const scheduledFor = seed.daysAgo < 0 ? new Date(Date.now() - seed.daysAgo * 86_400_000) : null

  const { data: comm, error: commErr } = await db
    .from('communications')
    .insert({
      organization_id: demo.organization_id,
      association_id: demo.id,
      category: seed.category,
      subject: seed.subject,
      body_html: seed.bodyHtml,
      channels: seed.channels,
      audience_definition: { kind: seed.audienceKind },
      audience_summary: seed.audienceLabel,
      status: seed.status,
      source: 'manual',
      sent_at: seed.status === 'sent' ? sentAt.toISOString() : null,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      created_at: new Date(sentAt.getTime() - 1800_000).toISOString(), // 30 min before send
    })
    .select('id')
    .single()
  if (commErr || !comm) {
    console.warn(`  ✗ ${seed.subject.slice(0, 60)}: ${commErr?.message}`)
    return { created: false, recipientCount: 0 }
  }

  // Recipients. Status-dependent:
  //   sent      → fan out N recipients with rolled delivery state
  //   scheduled → fan out N recipients in delivery_status='queued', no sent_at
  //   draft     → no recipients
  //   failed    → fan out with delivery_status='failed' for all
  if (seed.status === 'draft') {
    console.log(`  + ${seed.category.padEnd(13)} draft   · ${seed.subject.slice(0, 60)}`)
    return { created: true, recipientCount: 0 }
  }

  const channels = seed.channels.filter((c) => c === 'email' || c === 'portal')
  const recipientRows: Database['public']['Tables']['communication_recipients']['Insert'][] = []
  for (let i = 0; i < seed.recipientCount; i++) {
    const name = FAKE_RESIDENTS[(i + seed.daysAgo) % FAKE_RESIDENTS.length]
    const email = name.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com'
    for (const channel of channels) {
      const roll =
        seed.status === 'sent'
          ? rollDelivery(sentAt)
          : seed.status === 'scheduled'
            ? { delivery_status: 'queued' as const }
            : ({
                delivery_status: 'failed' as const,
                failed_at: sentAt.toISOString(),
                error_message: 'send aborted',
              } as DeliveryRoll)
      recipientRows.push({
        organization_id: demo.organization_id,
        communication_id: comm.id,
        recipient_name: name,
        email: channel === 'email' ? email : null,
        channel,
        external_id: `${DEMO_TAG}-${comm.id.slice(0, 8)}-${i}`,
        ...roll,
      })
    }
  }

  if (recipientRows.length > 0) {
    const { error: recErr } = await db
      .from('communication_recipients')
      .insert(recipientRows)
    if (recErr) {
      console.warn(`    ✗ recipients: ${recErr.message}`)
    }
  }

  // Sprinkle 1-2 replies on a subset of sent comms — gives the activity
  // feed some 'replied' counts. Triggered when the comm category is one
  // residents typically respond to (dues / violation / arc).
  if (
    seed.status === 'sent' &&
    ['dues', 'violation', 'arc', 'meeting'].includes(seed.category) &&
    Math.random() < 0.4 &&
    recipientRows.length > 0
  ) {
    const replyCount = Math.min(2, recipientRows.length)
    for (let i = 0; i < replyCount; i++) {
      const sample = SAMPLE_REPLIES[Math.floor(Math.random() * SAMPLE_REPLIES.length)]
      const repliedAt = new Date(sentAt.getTime() + (1 + Math.random() * 36) * 3600_000)
      await db.from('communication_replies').insert({
        organization_id: demo.organization_id,
        communication_id: comm.id,
        channel: 'email',
        from_email: 'resident@example.com',
        subject: `Re: ${seed.subject}`,
        body: sample.body,
        ai_summary: sample.ai_summary,
        ai_category: sample.ai_category,
        received_at: repliedAt.toISOString(),
      })
    }
  }

  console.log(
    `  + ${seed.category.padEnd(13)} ${seed.status.padEnd(10)} · ${recipientRows.length} recipients · ${seed.subject.slice(0, 60)}`,
  )
  return { created: true, recipientCount: recipientRows.length }
}

main().catch((err) => {
  console.error('[seed-demo-comms] crashed:', err)
  process.exit(1)
})
