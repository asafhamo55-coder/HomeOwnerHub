/**
 * scripts/test-bids.ts
 *
 * Characterization tests for the bid-award state machine implemented in
 * apps/hoa/src/lib/bids.ts → awardBid(). The server action itself
 * depends on next/cache + cookie-bound auth and can't be invoked from a
 * CLI, so this harness:
 *
 *   (a) seeds a real RFP + bids using createAdminClient (service-role,
 *       bypasses RLS — mirrors what awardBid sees after the auth gate)
 *   (b) replays awardBid's transitions inline via the same admin client
 *   (c) asserts the resulting row states
 *
 * If apps/hoa/src/lib/bids.ts grows new transitions, mirror them in
 * `replayAwardBid` below.
 *
 * Cases:
 *   - happy path: award → RFP awarded, winner awarded, losers declined
 *   - idempotency: re-running for the same bid does not regress state
 *   - bid from a different RFP → refused
 *   - non-'submitted' bid → refused
 *   - RFP not 'open' → refused (winner update guarded by .eq('status','open'))
 *
 * Cleanup: all rows seeded by this harness are tagged with the
 * HARNESS_TAG in rfp_number / vendor.legal_name and removed in finally.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-bids] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-bids-harness'

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

interface Fixture {
  organizationId: string
  associationId: string
}

interface AwardResult {
  ok: boolean
  error?: string
}

// Mirror of apps/hoa/src/lib/bids.ts → awardBid, minus the cookie-bound
// auth + revalidatePath. Kept in lock-step with that file.
async function replayAwardBid(
  db: Db,
  rfpId: string,
  bidId: string,
): Promise<AwardResult> {
  const { data: bid } = await db
    .from('bids')
    .select('id, vendor_id, status, rfp_id')
    .eq('id', bidId)
    .maybeSingle()

  if (!bid) return { ok: false, error: 'Bid not found.' }
  if (bid.rfp_id !== rfpId) {
    return { ok: false, error: 'Bid does not belong to this RFP.' }
  }
  if (bid.status !== 'submitted') {
    return {
      ok: false,
      error: `Only submitted bids can be awarded; this one is '${bid.status}'.`,
    }
  }

  const now = new Date().toISOString()
  // Production uses .eq('status','open') as a guard — but does NOT
  // check the affected-rows count. If no rows match, the update is a
  // silent no-op and execution proceeds to flip the bid statuses.
  // That's a real consistency gap (the bid ends up 'awarded' on an
  // RFP that's still 'cancelled') and we characterize it as such.
  const { error: rfpErr } = await db
    .from('rfps')
    .update({
      status: 'awarded',
      awarded_to_vendor_id: bid.vendor_id,
      awarded_at: now,
    })
    .eq('id', rfpId)
    .eq('status', 'open')
  if (rfpErr) return { ok: false, error: rfpErr.message }

  const { error: winErr } = await db
    .from('bids')
    .update({ status: 'awarded' })
    .eq('id', bidId)
  if (winErr) return { ok: false, error: winErr.message }

  const { error: declineErr } = await db
    .from('bids')
    .update({ status: 'declined' })
    .eq('rfp_id', rfpId)
    .eq('status', 'submitted')
    .neq('id', bidId)
  if (declineErr) {
    // Same policy as production: log loudly, but the award itself stands.
    console.error('[test-bids] decline losing bids failed', declineErr.message)
  }
  return { ok: true }
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(
    `[test-bids] assoc=${fixture.associationId} org=${fixture.organizationId}\n`,
  )

  try {
    await testHappyPath(db, fixture)
    await testIdempotentReAward(db, fixture)
    await testBidFromDifferentRfp(db, fixture)
    await testNonSubmittedBid(db, fixture)
    await testRfpNotOpen(db, fixture)
  } finally {
    await cleanup(db, fixture)
  }

  console.log(`\n[test-bids] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── tests ───────────────────────────────────────────────────────────

async function testHappyPath(db: Db, f: Fixture): Promise<void> {
  console.log('happy path — award → RFP awarded + winner awarded + losers declined:')
  const { rfpId, bids } = await seedRfpWithBids(db, f, {
    bidStatuses: ['submitted', 'submitted', 'submitted'],
  })

  const result = await replayAwardBid(db, rfpId, bids[0])
  check('award ok', result.ok === true, result.ok ? '' : result.error)

  const { data: rfpRow } = await db
    .from('rfps')
    .select('status, awarded_to_vendor_id')
    .eq('id', rfpId)
    .single()
  check('rfp.status=awarded', rfpRow?.status === 'awarded', rfpRow?.status)
  check('rfp.awarded_to_vendor_id set', !!rfpRow?.awarded_to_vendor_id)

  const { data: bidRows } = await db
    .from('bids')
    .select('id, status')
    .eq('rfp_id', rfpId)
  const statusById = new Map(
    (bidRows ?? []).map((r) => [r.id as string, r.status as string]),
  )
  check('winner.status=awarded', statusById.get(bids[0]) === 'awarded')
  check(
    'losers.status=declined',
    statusById.get(bids[1]) === 'declined' && statusById.get(bids[2]) === 'declined',
    `[${statusById.get(bids[1])}, ${statusById.get(bids[2])}]`,
  )
}

async function testIdempotentReAward(db: Db, f: Fixture): Promise<void> {
  console.log('\nidempotency — re-running awardBid on the same bid is safe:')
  const { rfpId, bids } = await seedRfpWithBids(db, f, {
    bidStatuses: ['submitted', 'submitted'],
  })

  const first = await replayAwardBid(db, rfpId, bids[0])
  check('first award ok', first.ok === true, first.ok ? '' : first.error)

  // Second call should be refused — the winning bid is now 'awarded',
  // not 'submitted', so the status guard rejects. This is the "safe"
  // path: no state regresses.
  const second = await replayAwardBid(db, rfpId, bids[0])
  check(
    'second award refused (winning bid no longer submitted)',
    second.ok === false &&
      second.error !== undefined &&
      second.error.includes('Only submitted bids'),
    second.ok ? 'unexpectedly succeeded' : second.error,
  )

  // Confirm state didn't regress.
  const { data: rfp2 } = await db
    .from('rfps')
    .select('status')
    .eq('id', rfpId)
    .single()
  check('rfp still awarded after re-run', rfp2?.status === 'awarded', rfp2?.status)
}

async function testBidFromDifferentRfp(db: Db, f: Fixture): Promise<void> {
  console.log("\nrefused — bid_id belongs to a different RFP:")
  const a = await seedRfpWithBids(db, f, { bidStatuses: ['submitted'] })
  const b = await seedRfpWithBids(db, f, { bidStatuses: ['submitted'] })

  // Try to award rfp A using a bid from rfp B.
  const result = await replayAwardBid(db, a.rfpId, b.bids[0])
  check(
    "refused with 'does not belong to this RFP'",
    result.ok === false &&
      result.error !== undefined &&
      result.error.includes('does not belong'),
    result.ok ? 'unexpectedly succeeded' : result.error,
  )

  // Nothing should have flipped on either RFP.
  const { data: rfpA } = await db.from('rfps').select('status').eq('id', a.rfpId).single()
  const { data: rfpB } = await db.from('rfps').select('status').eq('id', b.rfpId).single()
  check('rfp A still open', rfpA?.status === 'open', rfpA?.status)
  check('rfp B still open', rfpB?.status === 'open', rfpB?.status)
}

async function testNonSubmittedBid(db: Db, f: Fixture): Promise<void> {
  console.log("\nrefused — awarding a 'draft' bid:")
  const { rfpId, bids } = await seedRfpWithBids(db, f, {
    bidStatuses: ['draft'],
  })

  const result = await replayAwardBid(db, rfpId, bids[0])
  check(
    'refused with non-submitted message',
    result.ok === false &&
      result.error !== undefined &&
      result.error.includes('Only submitted bids'),
    result.ok ? 'unexpectedly succeeded' : result.error,
  )
}

async function testRfpNotOpen(db: Db, f: Fixture): Promise<void> {
  console.log("\nRFP is not 'open' — production silently no-ops the RFP flip:")
  const { rfpId, bids } = await seedRfpWithBids(db, f, {
    bidStatuses: ['submitted'],
    rfpStatus: 'cancelled',
  })

  // Production's awardBid uses .eq('status','open') as a guard on the
  // RFP update but doesn't check rowcount — so the RFP stays
  // 'cancelled' while the bid gets flipped to 'awarded'. That's a
  // known consistency gap. This test pins down the actual behavior so
  // a future fix has a clear baseline to break.
  const result = await replayAwardBid(db, rfpId, bids[0])
  check(
    'replay returns ok=true (production does not surface the no-op)',
    result.ok === true,
    result.ok ? '' : result.error,
  )

  const { data: rfpAfter } = await db
    .from('rfps')
    .select('status')
    .eq('id', rfpId)
    .single()
  check(
    "rfp.status stays 'cancelled' (the .eq('open') guard blocks the flip)",
    rfpAfter?.status === 'cancelled',
    rfpAfter?.status,
  )

  const { data: bidAfter } = await db
    .from('bids')
    .select('status')
    .eq('id', bids[0])
    .single()
  check(
    "winning bid becomes 'awarded' despite RFP not flipping (CONSISTENCY GAP)",
    bidAfter?.status === 'awarded',
    bidAfter?.status,
  )
}

// ─── helpers ─────────────────────────────────────────────────────────

let seedCounter = 0
async function seedRfpWithBids(
  db: Db,
  f: Fixture,
  opts: { bidStatuses: string[]; rfpStatus?: string },
): Promise<{ rfpId: string; bids: string[] }> {
  seedCounter += 1
  const stamp = `${HARNESS_TAG}-${Date.now()}-${seedCounter}`

  // Insert RFP with a future deadline so the row is valid; status defaults
  // to 'open' for happy paths but the test for "not open" overrides it.
  const { data: rfp, error: rfpErr } = await db
    .from('rfps')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      rfp_number: stamp.slice(-20),
      title: `${HARNESS_TAG} ${stamp}`,
      scope: 'harness scope',
      status: opts.rfpStatus ?? 'open',
      submission_deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (rfpErr || !rfp) throw new Error(`seed rfp: ${rfpErr?.message}`)

  // Mint one vendor per bid so we don't trip the (rfp_id, vendor_id)
  // uniqueness assumed by RFP bidding flows.
  const bidIds: string[] = []
  for (let i = 0; i < opts.bidStatuses.length; i++) {
    const { data: vendor, error: vErr } = await db
      .from('vendors')
      .insert({
        organization_id: f.organizationId,
        legal_name: `${HARNESS_TAG} vendor ${stamp}-${i}`,
        status: 'prospect',
      })
      .select('id')
      .single()
    if (vErr || !vendor) throw new Error(`seed vendor: ${vErr?.message}`)

    const { data: bid, error: bErr } = await db
      .from('bids')
      .insert({
        organization_id: f.organizationId,
        rfp_id: rfp.id,
        vendor_id: vendor.id,
        total_amount: 1000 + i * 100,
        status: opts.bidStatuses[i],
        submitted_at:
          opts.bidStatuses[i] === 'submitted' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (bErr || !bid) throw new Error(`seed bid: ${bErr?.message}`)
    bidIds.push(bid.id)
  }

  return { rfpId: rfp.id, bids: bidIds }
}

async function loadFixture(db: Db): Promise<Fixture> {
  const targetOrgName = process.env.SEED_ORG_NAME

  const { data: assocs } = await db
    .from('associations')
    .select('id, organization_id, orgs:organization_id(name, hub_type)')
    .order('created_at', { ascending: true })

  const assoc = (assocs ?? []).find((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetOrgName && org.name !== targetOrgName) return false
    return true
  })
  if (!assoc) {
    throw new Error('no HOA association found — run pnpm seed:accounting first')
  }

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
  }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // Bids cascade with RFPs? Probably not — delete bids → vendors → rfps
  // explicitly, scoped to our HARNESS_TAG.
  const { data: rfps } = await db
    .from('rfps')
    .select('id')
    .eq('association_id', f.associationId)
    .like('title', `${HARNESS_TAG}%`)
  const rfpIds = (rfps ?? []).map((r) => r.id as string)

  const { data: vendors } = await db
    .from('vendors')
    .select('id')
    .eq('organization_id', f.organizationId)
    .like('legal_name', `${HARNESS_TAG}%`)
  const vendorIds = (vendors ?? []).map((v) => v.id as string)

  if (rfpIds.length > 0) {
    await db.from('bids').delete().in('rfp_id', rfpIds)
    await db.from('rfps').delete().in('id', rfpIds)
  }
  if (vendorIds.length > 0) {
    await db.from('vendors').delete().in('id', vendorIds)
  }
  console.log(
    `\n[test-bids] cleaned up ${rfpIds.length} rfp(s), ${vendorIds.length} vendor(s)`,
  )
}

main().catch((err) => {
  console.error('[test-bids] crashed:', err)
  process.exit(1)
})
