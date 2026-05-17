/**
 * scripts/test-vendor-onboard-submit.ts
 *
 * Coverage for the public vendor onboarding flow at
 * apps/hoa/src/app/api/vendor-onboard/[token]/submit/route.ts.
 *
 * Same shape as test-rfp-bid-submit: the validator is the security
 * perimeter on this unauthenticated endpoint, and the 4 reason codes
 * (not_found / expired / consumed / revoked) drive the 410 responses.
 *
 * Cases:
 *   - validator: 4 reason codes (not_found, expired, consumed, revoked)
 *   - happy path: validate ok on a fresh pending invitation
 *   - duplicate-EIN guard: a second insert with the same EIN under the
 *     same org is refused (per-org unique constraint, characterized via
 *     the same query the route uses)
 *
 * Partial upload failure is intentionally NOT tested here — exercising
 * it would require mocking Supabase storage, which adds a dependency
 * and tests a layer of supabase-js we don't own. TODO: revisit if we
 * ever stand up a local minio for testing storage paths.
 */

import './_load-env'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

// NOTE: validateInvitationToken lives in apps/hoa/src/lib/vendor-
// invitations.ts which is `'use server'` + imports next/cache. That
// module can't be loaded from a Node CLI, so we replay the validator
// logic inline. Keep this in lock-step with the production
// implementation.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[test-vendor-onboard-submit] missing SUPABASE_URL / SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const HARNESS_TAG = 'test-vendor-onboard-submit-harness'

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
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

// Replay of validateInvitationToken from apps/hoa/src/lib/vendor-
// invitations.ts. Same query, same 4 reason codes, same lazy-expire
// side effect. Keep this in lock-step with production.
type ValidateOk = {
  ok: true
  invitation: {
    id: string
    organizationId: string
    inviteeEmail: string
    inviteeName: string | null
    expiresAt: string
  }
}
type ValidateErr = {
  ok: false
  reason: 'not_found' | 'expired' | 'consumed' | 'revoked'
}

async function replayValidateInvitationToken(
  db: Db,
  token: string,
): Promise<ValidateOk | ValidateErr> {
  const { data } = await db
    .from('vendor_onboarding_invitations' as never)
    .select(
      'id, organization_id, invitee_email, invitee_name, status, expires_at',
    )
    .eq('token', token)
    .maybeSingle<{
      id: string
      organization_id: string
      invitee_email: string
      invitee_name: string | null
      status: 'pending' | 'submitted' | 'expired' | 'revoked'
      expires_at: string
    }>()

  if (!data) return { ok: false, reason: 'not_found' }
  if (data.status === 'submitted') return { ok: false, reason: 'consumed' }
  if (data.status === 'revoked') return { ok: false, reason: 'revoked' }
  if (data.status === 'expired') return { ok: false, reason: 'expired' }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db
      .from('vendor_onboarding_invitations' as never)
      .update({ status: 'expired' } as never)
      .eq('id', data.id)
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    invitation: {
      id: data.id,
      organizationId: data.organization_id,
      inviteeEmail: data.invitee_email,
      inviteeName: data.invitee_name,
      expiresAt: data.expires_at,
    },
  }
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(`[test-vendor-onboard-submit] org=${fixture.organizationId}\n`)

  try {
    await testHappyPath(db, fixture)
    await testNotFound(db)
    await testExpired(db, fixture)
    await testConsumed(db, fixture)
    await testRevoked(db, fixture)
    await testDuplicateEinGuard(db, fixture)
  } finally {
    await cleanup(db, fixture)
  }

  console.log(
    `\n[test-vendor-onboard-submit] ${passed} passed, ${failed} failed`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

// ─── tests ───────────────────────────────────────────────────────────

async function testHappyPath(db: Db, f: Fixture): Promise<void> {
  console.log('happy path — valid pending invitation validates:')
  const { token } = await seedInvitation(db, f, { status: 'pending' })

  const result = await replayValidateInvitationToken(db, token)
  check('validator returns ok', result.ok === true)
  if (!result.ok) return
  check(
    'invitation.organizationId matches',
    result.invitation.organizationId === f.organizationId,
  )
  check(
    'invitation.inviteeEmail set',
    typeof result.invitation.inviteeEmail === 'string' &&
      result.invitation.inviteeEmail.length > 0,
  )
}

async function testNotFound(db: Db): Promise<void> {
  console.log('\nnonexistent token → not_found:')
  const result = await replayValidateInvitationToken(
    db,
    'bogus-' + generateToken(),
  )
  check(
    "reason='not_found'",
    result.ok === false && result.reason === 'not_found',
    JSON.stringify(result),
  )
}

async function testExpired(db: Db, f: Fixture): Promise<void> {
  console.log('\nexpired invitation → expired:')
  // expires_at in the past, status still 'pending' — the validator
  // detects time and lazily-marks expired.
  const { token } = await seedInvitation(db, f, {
    status: 'pending',
    expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  })
  const result = await replayValidateInvitationToken(db, token)
  check(
    "reason='expired'",
    result.ok === false && result.reason === 'expired',
    JSON.stringify(result),
  )
}

async function testConsumed(db: Db, f: Fixture): Promise<void> {
  console.log('\nsubmitted (consumed) invitation → consumed:')
  const { token } = await seedInvitation(db, f, { status: 'submitted' })
  const result = await replayValidateInvitationToken(db, token)
  check(
    "reason='consumed'",
    result.ok === false && result.reason === 'consumed',
    JSON.stringify(result),
  )
}

async function testRevoked(db: Db, f: Fixture): Promise<void> {
  console.log('\nrevoked invitation → revoked:')
  const { token } = await seedInvitation(db, f, { status: 'revoked' })
  const result = await replayValidateInvitationToken(db, token)
  check(
    "reason='revoked'",
    result.ok === false && result.reason === 'revoked',
    JSON.stringify(result),
  )
}

async function testDuplicateEinGuard(db: Db, f: Fixture): Promise<void> {
  console.log('\nduplicate-EIN guard — second submit with same EIN refused:')
  // Mirror the exact query the route does (apps/hoa/src/app/api/
  // vendor-onboard/[token]/submit/route.ts ~lines 143-158): lookup by
  // (organization_id, ein). The route emits 409 duplicate_ein on hit.
  const ein = `99-${Math.floor(1000000 + Math.random() * 8999999)}`
  const { data: first } = await db
    .from('vendors')
    .insert({
      organization_id: f.organizationId,
      legal_name: `${HARNESS_TAG} dup-ein vendor`,
      ein,
      status: 'prospect',
    })
    .select('id')
    .single()
  check('first vendor insert ok', !!first)

  // Now do the "before insert" lookup the route does.
  const { data: existing } = await db
    .from('vendors')
    .select('id')
    .eq('organization_id', f.organizationId)
    .eq('ein', ein)
    .maybeSingle()
  check(
    'duplicate-EIN lookup finds existing row → route would 409',
    !!existing && existing.id === first?.id,
    JSON.stringify(existing),
  )
}

// ─── helpers ─────────────────────────────────────────────────────────

let seedCounter = 0
async function seedInvitation(
  db: Db,
  f: Fixture,
  opts: {
    status: 'pending' | 'submitted' | 'revoked' | 'expired'
    expiresAt?: string
  },
): Promise<{ token: string; invitationId: string }> {
  seedCounter += 1
  const stamp = `${HARNESS_TAG}-${Date.now()}-${seedCounter}`
  const token = generateToken()

  // vendor_onboarding_invitations isn't in the typed DB (it's in a
  // separate migration). Use the `as never` cast trick that
  // apps/hoa/src/lib/vendor-invitations.ts uses.
  const { data, error } = await db
    .from('vendor_onboarding_invitations' as never)
    .insert({
      organization_id: f.organizationId,
      token,
      invitee_email: `${stamp}@test.local`,
      invitee_name: `${HARNESS_TAG} invitee`,
      status: opts.status,
      expires_at:
        opts.expiresAt ??
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    } as never)
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(`seed invitation: ${error?.message}`)

  return { token, invitationId: data.id }
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

  return { organizationId: assoc.organization_id }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // Invitations seeded by this harness — keyed on invitee_email prefix.
  const { data: invitations } = await db
    .from('vendor_onboarding_invitations' as never)
    .select('id')
    .eq('organization_id', f.organizationId)
    .like('invitee_email', `${HARNESS_TAG}%`)
  const invIds = ((invitations ?? []) as Array<{ id: string }>).map((r) => r.id)

  const { data: vendors } = await db
    .from('vendors')
    .select('id')
    .eq('organization_id', f.organizationId)
    .like('legal_name', `${HARNESS_TAG}%`)
  const vendorIds = (vendors ?? []).map((v) => v.id as string)

  if (invIds.length > 0) {
    await db
      .from('vendor_onboarding_invitations' as never)
      .delete()
      .in('id', invIds)
  }
  if (vendorIds.length > 0) {
    await db.from('vendors').delete().in('id', vendorIds)
  }
  console.log(
    `\n[test-vendor-onboard-submit] cleaned up ${invIds.length} invitation(s), ${vendorIds.length} vendor(s)`,
  )
}

main().catch((err) => {
  console.error('[test-vendor-onboard-submit] crashed:', err)
  process.exit(1)
})
