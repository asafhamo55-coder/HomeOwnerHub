/**
 * scripts/test-inbox-rls.ts
 *
 * Security test for the Phase A inbox schema. Two properties:
 *
 *   1. Cross-org isolation — a client without the service role (here, a
 *      genuinely unauthenticated anon-key client) cannot see another
 *      org's inbox rows. If it can't see ANY org's rows, it certainly
 *      can't see a specific other org's rows — the stronger claim
 *      subsumes the isolation claim.
 *   2. mailbox_account_secrets is unreachable from ANY user session.
 *      RLS is enabled with no permissive policy (see migrations/0029_inbox.sql),
 *      so every non-service-role read returns zero rows and every write
 *      is rejected outright.
 *
 * Uses the service role to seed two throwaway orgs, then reads back with
 * the anon key. Cleans up everything it created, even if an assertion
 * throws partway through.
 *
 * This runs against a LIVE database. Every row created is tagged with
 * TAG below so it is findable, and cleanup is verified, not assumed.
 *
 * Run:
 *   rtk proxy pnpm exec tsx scripts/test-inbox-rls.ts
 *
 * Credential resolution deviates from a naive `process.env.X` check:
 * Vercel writes empty-string placeholders for Sensitive env vars it
 * can't decrypt locally, so an empty string is treated the same as
 * unset. Fallback order (first non-empty wins):
 *   URL:     NEXT_PUBLIC_SUPABASE_URL       → SUPABASE_URL
 *   anon:    NEXT_PUBLIC_SUPABASE_ANON_KEY   → SUPABASE_ANON_KEY
 *   service: SUPABASE_SERVICE_ROLE_KEY       → SUPABASE_SECRET_KEY
 * (`||` already treats '' as falsy, so this chain handles both unset
 * and empty-string cases without an extra check — see scripts/test-property-resolve.ts.)
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !anonKey || !serviceKey) {
  console.error(
    'Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY), ' +
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
  )
  process.exit(1)
}

const admin = createClient<Database>(url, serviceKey)
const anon = createClient<Database>(url, anonKey)

const TAG = 'test-inbox-rls-harness'
let failures = 0
let skipped = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function skip(name: string, reason: string): void {
  console.log(`SKIP  ${name} — ${reason}`)
  skipped++
}

/**
 * Best-effort role introspection for a Supabase API key. Never logs the
 * key itself — only the derived role label. Handles both legacy JWT keys
 * (three base64url segments, a `role` claim in the payload) and the
 * modern `sb_publishable_…` / `sb_secret_…` key formats, which are not
 * JWTs at all.
 */
function describeKeyRole(key: string): string {
  if (key.startsWith('sb_secret_')) return 'service_role (modern sb_secret_ key)'
  if (key.startsWith('sb_publishable_')) return 'anon (modern sb_publishable_ key)'
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        role?: unknown
      }
      return typeof payload.role === 'string' ? payload.role : 'unknown (JWT, no role claim)'
    } catch {
      return 'unknown (JWT decode failed)'
    }
  }
  return 'unknown key format'
}

async function main(): Promise<void> {
  // ── 0. sanity: the "anon" client is genuinely non-privileged ────────
  // If this key is secretly the service role (e.g. a copy-paste mistake
  // in env setup), every "anon can't read X" check below would pass for
  // the wrong reason — the service role bypasses RLS entirely. Abort
  // rather than produce a false proof.
  const anonRole = describeKeyRole(anonKey)
  const anonIsPrivileged = anonRole.startsWith('service_role')
  check('0. anon key role is not service_role', !anonIsPrivileged, anonRole)
  if (anonIsPrivileged) {
    console.error(
      '\nABORT — the "anon" credential resolved to a service-role key. ' +
        'Every downstream "anon cannot read" check would be meaningless. ' +
        'Fix NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY and re-run.',
    )
    process.exit(1)
  }

  const { data: session } = await anon.auth.getSession()
  check(
    '0b. anon client carries no active session',
    session.session === null,
    session.session ? 'a session IS present — not unauthenticated' : 'no session',
  )

  // ── seed two throwaway orgs (service role) ──────────────────────────
  const { data: orgs, error: orgErr } = await admin
    .from('orgs')
    .insert([
      { name: `${TAG}-A`, hub_type: 'hoa' },
      { name: `${TAG}-B`, hub_type: 'hoa' },
    ])
    .select('id, name')

  if (orgErr || !orgs || orgs.length !== 2) {
    console.error('Could not seed orgs:', orgErr?.message)
    process.exit(1)
  }
  const [orgA, orgB] = orgs
  const orgIds = [orgA.id, orgB.id]

  console.log(`Seeded orgs: A=${orgA.id} B=${orgB.id}\n`)

  try {
    const { data: accounts, error: acctErr } = await admin
      .from('mailbox_accounts')
      .insert([
        { organization_id: orgA.id, email_address: `a@${TAG}.test`, scope_mode: 'all' },
        { organization_id: orgB.id, email_address: `b@${TAG}.test`, scope_mode: 'all' },
      ])
      .select('id, organization_id')

    if (acctErr || !accounts) {
      throw new Error(`Could not seed mailbox_accounts: ${acctErr?.message}`)
    }
    const acctA = accounts.find((a) => a.organization_id === orgA.id)
    if (!acctA) {
      throw new Error('Could not find seeded mailbox_accounts row for org A')
    }

    const SECRET_VALUE = 'v1:not-a-real-token'
    const { error: secretErr } = await admin.from('mailbox_account_secrets').insert({
      mailbox_account_id: acctA.id,
      refresh_token_enc: SECRET_VALUE,
      key_version: 1,
    })
    if (secretErr) {
      throw new Error(`Could not seed mailbox_account_secrets: ${secretErr.message}`)
    }

    const { error: threadErr } = await admin.from('inbox_threads').insert([
      {
        organization_id: orgA.id,
        mailbox_account_id: acctA.id,
        gmail_thread_id: `${TAG}-thread-a`,
        subject: 'org A private thread',
      },
    ])
    if (threadErr) {
      throw new Error(`Could not seed inbox_threads: ${threadErr.message}`)
    }

    // ── 1. cross-org isolation: unauthenticated client sees nothing ──
    // Distinguish "query ran and returned zero rows" (a real proof) from
    // "query failed" (proves nothing — could be a bad table name or a
    // network blip masquerading as a pass).
    {
      const { data, error } = await anon.from('inbox_threads').select('id')
      if (error) {
        skip(
          '1. unauthenticated client sees no inbox_threads',
          `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`,
        )
      } else {
        check(
          '1. unauthenticated client sees no inbox_threads',
          (data ?? []).length === 0,
          `saw ${(data ?? []).length} row(s)`,
        )
      }
    }

    {
      const { data, error } = await anon.from('mailbox_accounts').select('id')
      if (error) {
        skip(
          '2. unauthenticated client sees no mailbox_accounts',
          `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`,
        )
      } else {
        check(
          '2. unauthenticated client sees no mailbox_accounts',
          (data ?? []).length === 0,
          `saw ${(data ?? []).length} row(s)`,
        )
      }
    }

    // ── 2. the secrets table is unreachable, period ───────────────────
    {
      const { data, error } = await anon
        .from('mailbox_account_secrets')
        .select('mailbox_account_id')
      if (error) {
        skip(
          '3. mailbox_account_secrets unreadable from a user session',
          `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`,
        )
      } else {
        check(
          '3. mailbox_account_secrets unreadable from a user session',
          (data ?? []).length === 0,
          `saw ${(data ?? []).length} row(s) — ANY row here is a critical leak`,
        )
      }
    }

    {
      const { error: insertErr } = await anon
        .from('mailbox_account_secrets')
        .insert({ mailbox_account_id: acctA.id, refresh_token_enc: 'injected' })
      check(
        '4. mailbox_account_secrets rejects a user-session insert',
        insertErr !== null,
        insertErr ? `${insertErr.code ?? '?'} ${insertErr.message}` : 'insert SUCCEEDED',
      )

      // Don't trust the error alone — confirm nothing was actually
      // persisted by the rejected insert.
      const { data: postInsert } = await admin
        .from('mailbox_account_secrets')
        .select('refresh_token_enc')
        .eq('mailbox_account_id', acctA.id)
        .maybeSingle()
      check(
        '4b. rejected insert did not persist a row',
        postInsert?.refresh_token_enc === SECRET_VALUE,
        `refresh_token_enc is now ${JSON.stringify(postInsert?.refresh_token_enc)}`,
      )
    }

    // ── 3. the service role still works (sanity) ──────────────────────
    const { data: adminSecrets } = await admin
      .from('mailbox_account_secrets')
      .select('mailbox_account_id')
      .eq('mailbox_account_id', acctA.id)
    check('5. service role CAN read secrets', (adminSecrets ?? []).length === 1)
  } catch (err) {
    console.error('\nUnexpected error during test body:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    // ── cleanup (cascades handle children: mailbox_accounts,
    // mailbox_account_secrets, inbox_threads all FK to orgs/accounts
    // ON DELETE CASCADE) ────────────────────────────────────────────
    const { error: cleanupErr } = await admin.from('orgs').delete().in('id', orgIds)
    if (cleanupErr) {
      check('6. cleanup deleted the harness orgs', false, cleanupErr.message)
    } else {
      check('6. cleanup deleted the harness orgs', true)
    }

    const [{ data: leftoverOrgs }, { data: leftoverAccounts }, { data: leftoverThreads }] =
      await Promise.all([
        admin.from('orgs').select('id').in('id', orgIds),
        admin.from('mailbox_accounts').select('id').in('organization_id', orgIds),
        admin.from('inbox_threads').select('id').in('organization_id', orgIds),
      ])
    check('6a. no harness orgs remain', (leftoverOrgs ?? []).length === 0)
    check('6b. no harness mailbox_accounts remain', (leftoverAccounts ?? []).length === 0)
    check('6c. no harness inbox_threads remain', (leftoverThreads ?? []).length === 0)

    console.log(
      '\nCleanup verification query: ' +
        `select id from orgs where id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from mailbox_accounts where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_threads where organization_id in ('${orgA.id}','${orgB.id}')`,
    )
  }

  if (skipped > 0) {
    console.log(`\n${skipped} CHECK(S) COULD NOT RUN — RESULT IS NOT A PASS`)
    process.exit(1)
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
