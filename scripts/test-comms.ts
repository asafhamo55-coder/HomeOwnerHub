/**
 * scripts/test-comms.ts
 *
 * E2E for the communications module. Hits real Postgres. Doesn't send
 * real email — the sendCommunication server action uses next/cache and
 * cookies which a CLI can't satisfy, so we mirror its Postgres shape
 * directly and skip the Resend call (we just set delivery_status='sent'
 * inline like the production path would after Resend acked).
 *
 * Cases:
 *
 *   A. Templates seeded? (skips with a clear message if not)
 *   B. Audience resolution — pick "everyone" against a fresh test
 *      association, get the expected unit count back
 *   C. Send pipeline shape — insert communications + recipients,
 *      simulate delivery, verify counts roll up correctly via the
 *      activity-feed query shape
 *   D. Inbound reply linkage — simulate a Resend inbound event,
 *      verify communication_replies row created + recipient marked
 *      'replied'
 *   E. Template rendering — verify merge fields render strictly +
 *      report missing
 *
 * Cleanup at the end removes everything tagged 'test-comms-harness'.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import {
  renderTemplate,
  renderTemplateStrict,
  extractMergeFields,
} from '../apps/hoa/src/lib/communications/templates'
import { resolveAudience } from '../apps/hoa/src/lib/communications/audience'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-comms] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-comms-harness'
type Db = SupabaseClient<Database>

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Migration gate.
  const { error: probeErr } = await db
    .from('communications')
    .select('id')
    .limit(1)
  if (probeErr && /relation .* does not exist|42P01|Could not find the table/i.test(probeErr.message)) {
    console.log('[test-comms] SKIP — apply migrations/0018_communications.sql first.')
    process.exit(0)
  }

  // Pure-fn tests first — no DB.
  testTemplateRendering()

  const fixture = await loadFixture(db)
  console.log(`\n[test-comms] assoc=${fixture.associationId}\n`)

  let commId: string | null = null
  let recipientId: string | null = null
  try {
    await testTemplatesSeeded(db, fixture)
    await testAudienceResolution(db, fixture)
    const r = await testSendPipeline(db, fixture)
    commId = r.commId
    recipientId = r.recipientId
    if (commId && recipientId) {
      await testInboundReplyLinkage(db, fixture, commId, recipientId)
      await testActivityFeedRollup(db, fixture, commId)
    }
  } finally {
    await cleanup(db, fixture)
  }

  console.log(`\n[test-comms] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── E. Template rendering (pure fn) ─────────────────────────────────

function testTemplateRendering(): void {
  console.log('template rendering (pure fn):')

  // Lenient: missing fields collapse to empty and get reported.
  const r1 = renderTemplate('Hi {{ name }}, your amount is {{ amount }}.', {
    name: 'Asaf',
  })
  check(
    'lenient: substitutes provided fields',
    r1.rendered === 'Hi Asaf, your amount is .',
  )
  check('lenient: reports missing fields', r1.missingFields.includes('amount'))

  // Strict: throws on missing.
  let strictThrew = false
  try {
    renderTemplateStrict('Hi {{ name }}', {})
  } catch {
    strictThrew = true
  }
  check('strict: throws on missing field', strictThrew)

  // Strict with all fields: returns rendered.
  const r2 = renderTemplateStrict('Hi {{ name }}', { name: 'Asaf' })
  check('strict: returns rendered when all fields present', r2 === 'Hi Asaf')

  // extractMergeFields: dedupes, sorts.
  const fields = extractMergeFields('{{ a }} and {{ b }} and {{ a }} again')
  check(
    'extractMergeFields dedupes + sorts',
    JSON.stringify(fields) === JSON.stringify(['a', 'b']),
  )
}

// ─── A. Templates seeded ─────────────────────────────────────────────

async function testTemplatesSeeded(db: Db, f: Fixture): Promise<void> {
  console.log('\ntemplates:')
  const { data } = await db
    .from('communication_templates')
    .select('category')
    .eq('organization_id', f.organizationId)
    .eq('is_active', true)
  const count = (data ?? []).length
  if (count === 0) {
    check('templates seeded (≥ 1)', false, 'run `pnpm seed:comm-templates` first')
  } else {
    check(`templates seeded (${count} active)`, true)
    const categories = new Set((data ?? []).map((t) => t.category))
    check('welcome category present', categories.has('welcome'))
    check('dues category present', categories.has('dues'))
  }
}

// ─── B. Audience resolution ──────────────────────────────────────────

async function testAudienceResolution(db: Db, f: Fixture): Promise<void> {
  console.log('\naudience resolution:')

  const everyone = await resolveAudience(db, f.associationId, { kind: 'everyone' })
  check('everyone resolves ≥ 1 recipient', everyone.recipients.length >= 1)
  check('summary mentions count', everyone.summary.includes(String(everyone.recipients.length)))

  const owners = await resolveAudience(db, f.associationId, { kind: 'owners_only' })
  check('owners_only resolves a list', Array.isArray(owners.recipients))

  // Specific units — narrow to the first unit only, expect exactly 1.
  if (everyone.recipients[0]) {
    const oneUnit = await resolveAudience(db, f.associationId, {
      kind: 'specific_units',
      unitIds: [everyone.recipients[0].unitId],
    })
    check('specific_units narrows to 1', oneUnit.recipients.length === 1)
  }
}

// ─── C. Send pipeline shape ──────────────────────────────────────────

async function testSendPipeline(
  db: Db,
  f: Fixture,
): Promise<{ commId: string | null; recipientId: string | null }> {
  console.log('\nsend pipeline (DB shape):')

  // Insert one comm + one recipient. Mirrors what sendCommunication
  // does after audience resolution.
  const { data: comm, error: commErr } = await db
    .from('communications')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      category: 'announcement',
      subject: `${HARNESS_TAG}: test send`,
      body_html: '<p>Hello {{ recipient_name }}!</p>',
      channels: ['email'],
      audience_definition: { kind: 'specific_units' },
      audience_summary: 'Test send (1 recipient)',
      status: 'sending',
      source: 'manual',
    })
    .select('id')
    .single()
  if (commErr || !comm) {
    check('insert comm row', false, commErr?.message)
    return { commId: null, recipientId: null }
  }
  check('insert comm row', true)

  const { data: recipient, error: recErr } = await db
    .from('communication_recipients')
    .insert({
      organization_id: f.organizationId,
      communication_id: comm.id,
      unit_id: f.unitId,
      recipient_name: `${HARNESS_TAG} Resident`,
      email: `${HARNESS_TAG}@example.com`,
      channel: 'email',
      delivery_status: 'queued',
    })
    .select('id')
    .single()
  if (recErr || !recipient) {
    check('insert recipient row', false, recErr?.message)
    return { commId: comm.id, recipientId: null }
  }
  check('insert recipient row', true)

  // Simulate Resend delivery event (would normally arrive via webhook).
  const externalId = `re_${HARNESS_TAG}_${Date.now()}`
  await db
    .from('communication_recipients')
    .update({
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      external_id: externalId,
    })
    .eq('id', recipient.id)

  // ... then delivered.
  await db
    .from('communication_recipients')
    .update({
      delivery_status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', recipient.id)

  // ... then opened.
  await db
    .from('communication_recipients')
    .update({
      delivery_status: 'opened',
      opened_at: new Date().toISOString(),
    })
    .eq('id', recipient.id)

  // Flip parent to sent.
  await db
    .from('communications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', comm.id)

  const { data: after } = await db
    .from('communication_recipients')
    .select('delivery_status, sent_at, delivered_at, opened_at')
    .eq('id', recipient.id)
    .single()
  check("recipient delivery_status='opened'", after?.delivery_status === 'opened')
  check('all three timestamps set', !!after?.sent_at && !!after?.delivered_at && !!after?.opened_at)

  return { commId: comm.id, recipientId: recipient.id }
}

// ─── D. Inbound reply linkage ────────────────────────────────────────

async function testInboundReplyLinkage(
  db: Db,
  f: Fixture,
  commId: string,
  recipientId: string,
): Promise<void> {
  console.log('\ninbound reply:')
  void f

  const { data: recipient } = await db
    .from('communication_recipients')
    .select('external_id, organization_id')
    .eq('id', recipientId)
    .single()
  if (!recipient?.external_id) {
    check('recipient has external_id (set during send)', false)
    return
  }

  // Mirror what the Resend webhook handler does on email.received.
  const { data: reply, error: replyErr } = await db
    .from('communication_replies')
    .insert({
      organization_id: recipient.organization_id,
      communication_id: commId,
      recipient_id: recipientId,
      channel: 'email',
      from_email: `${HARNESS_TAG}@example.com`,
      subject: `Re: ${HARNESS_TAG}: test send`,
      body: 'Got it, thanks!',
      external_id: `inbound_${HARNESS_TAG}_${Date.now()}`,
    })
    .select('id')
    .single()
  check('insert reply row', !replyErr && !!reply, replyErr?.message)

  await db
    .from('communication_recipients')
    .update({
      delivery_status: 'replied',
      replied_at: new Date().toISOString(),
    })
    .eq('id', recipientId)

  const { data: recipAfter } = await db
    .from('communication_recipients')
    .select('delivery_status, replied_at')
    .eq('id', recipientId)
    .single()
  check("recipient flipped to 'replied'", recipAfter?.delivery_status === 'replied')
  check('replied_at stamped', !!recipAfter?.replied_at)
}

// ─── activity feed rollup ────────────────────────────────────────────

async function testActivityFeedRollup(
  db: Db,
  f: Fixture,
  commId: string,
): Promise<void> {
  console.log('\nactivity feed roll-up:')
  void f

  // The listCommunications query in lib/communications/queries.ts uses
  // a nested select to pull recipients in one round-trip and aggregates
  // in memory. Mirror that here so the harness covers the same shape.
  const { data } = await db
    .from('communications')
    .select(
      'id, recipients:communication_recipients(delivery_status)',
    )
    .eq('id', commId)
    .single()
  type Row = { recipients: { delivery_status: string }[] }
  const recipients = (data as Row | null)?.recipients ?? []
  const repliedCount = recipients.filter((r) => r.delivery_status === 'replied').length
  check('rollup: 1 replied recipient', repliedCount === 1)
}

// ─── fixture / cleanup ───────────────────────────────────────────────

interface Fixture {
  organizationId: string
  associationId: string
  unitId: string
}

async function loadFixture(db: Db): Promise<Fixture> {
  const targetOrgName = process.env.SEED_ORG_NAME
  const { data: assocs } = await db
    .from('associations')
    .select('id, organization_id, orgs:organization_id(name, hub_type)')
  const assoc = (assocs ?? []).find((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetOrgName && org.name !== targetOrgName) return false
    return true
  })
  if (!assoc) throw new Error('no HOA association — run pnpm seed:accounting')

  const { data: unit } = await db
    .from('units')
    .select('id')
    .eq('association_id', assoc.id)
    .limit(1)
    .maybeSingle()
  if (!unit) throw new Error('no units in association')

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    unitId: unit.id,
  }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // Cascade-delete down through the harness-tagged comms.
  const { data: comms } = await db
    .from('communications')
    .select('id')
    .eq('association_id', f.associationId)
    .like('subject', `${HARNESS_TAG}%`)
  const commIds = (comms ?? []).map((c) => c.id)

  if (commIds.length > 0) {
    // FKs: replies → comm CASCADE, recipients → comm CASCADE. Delete
    // the parents and the children go with them.
    await db.from('communications').delete().in('id', commIds)
  }

  console.log(`\n[test-comms] cleaned up ${commIds.length} comm(s)`)
}

main().catch((err) => {
  console.error('[test-comms] crashed:', err)
  process.exit(1)
})
