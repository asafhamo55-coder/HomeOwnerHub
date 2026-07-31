/**
 * scripts/test-inbox-rls.ts
 *
 * Security test for the Phase A inbox schema. Three distinct properties,
 * proved by three distinct groups of checks — do not conflate them:
 *
 *   1. Logged-out denial (checks 1-2, anon key, no session). A client
 *      with no `auth.uid()` cannot read `inbox_threads` or
 *      `mailbox_accounts`. This is necessary but NOT sufficient to prove
 *      tenant isolation: `public.auth_org_ids()` (migrations/0000_schema.sql)
 *      returns `'{}'` and `public.auth_is_board_or_admin()`
 *      (migrations/0012_rbac_roles.sql) returns false whenever
 *      `auth.uid()` is NULL — true for ANY organization_id, regardless of
 *      how (or whether) the `board_access` policy's org predicate is
 *      written. An anon client seeing zero rows is consistent with a
 *      correct policy AND with a policy that omits the org check
 *      entirely. It cannot tell the two apart.
 *
 *   2. Cross-org isolation (checks 6-12, a REAL authenticated session).
 *      A confirmed user, made a `board` member of org A ONLY via
 *      `org_members`, signs in for real (`signInWithPassword`, not just
 *      an API key) and is asserted to (a) be able to read org A's rows —
 *      proving the policy isn't simply denying everyone, which would
 *      make the negative assertions meaningless — and (b) be UNABLE to
 *      read org B's rows, across `inbox_threads` and `inbox_messages`
 *      (`mailbox_accounts` gets a negative-only check). This is the
 *      property that actually protects tenants and is the only group of
 *      checks in this file that exercises the `organization_id = ANY
 *      (auth_org_ids())` predicate with a non-null `auth.uid()`.
 *
 *   3. Unconditional denial of `mailbox_account_secrets` (checks 3-5,
 *      10). RLS is enabled on that table with ZERO permissive policies
 *      (see migrations/0029_inbox.sql), so denial has no dependency on
 *      `auth.uid()`, session state, or org membership — every non-
 *      service-role caller is denied identically. Unlike (1), the anon
 *      proof here IS complete and sound on its own; check 10 additionally
 *      re-proves it from an authenticated board-member session (the
 *      strongest version of the claim: not even a legitimate org A board
 *      member can read org A's own secret).
 *
 * Uses the service role to seed two throwaway orgs, a real confirmed
 * auth user, and cross-org fixtures, then reads back with the anon key
 * and with the authenticated user's own session. Cleans up everything it
 * created, even if an assertion throws partway through, AND sweeps for
 * anything a previous interrupted run left behind (SIGKILL/OOM/network
 * drop during a prior cleanup would otherwise leave rows and an auth user
 * live in this database with no record of their ids).
 *
 * This runs against a LIVE database. Every row and user created is
 * tagged with TAG below so it is findable, and cleanup is verified, not
 * assumed. Never touches anything not carrying the tag — in particular,
 * never touches org a4906f16-baf3-4232-a2bd-a78ea432ad86 (Madison Park,
 * a live tenant).
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
import { randomBytes, randomUUID } from 'node:crypto'
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
// A real, deliverable-looking address whose local part carries TAG, so the
// preflight sweep's substring match finds it even after an interrupted run.
const BOARD_EMAIL = `${TAG}+${randomUUID()}@example.com`
// Never logged, never persisted anywhere but the auth provider.
const BOARD_PASSWORD = randomBytes(24).toString('base64url')

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

/**
 * Best-effort read of a Postgrest error's row count for logging purposes.
 */
function rowsSeen<T>(data: T[] | null): number {
  return (data ?? []).length
}

/**
 * Preflight sweep — finds and deletes anything a previous run left behind
 * (SIGKILL, OOM, or a network drop during that run's own `finally` block
 * would leave orgs, their cascaded child rows, and an auth user live in
 * this database with no record of their ids). Strictly tag-scoped: orgs
 * matched by `name ilike '%' || TAG || '%'`, auth users matched by email
 * containing TAG. Never a broad delete.
 */
async function sweepPreviousRuns(): Promise<void> {
  const { data: staleOrgs, error: staleOrgsErr } = await admin
    .from('orgs')
    .select('id, name')
    .ilike('name', `%${TAG}%`)
  if (staleOrgsErr) {
    console.error(`Preflight sweep: could not query for stale orgs — ${staleOrgsErr.message}`)
  } else if (staleOrgs && staleOrgs.length > 0) {
    const staleIds = staleOrgs.map((o) => o.id)
    const { error: deleteErr } = await admin.from('orgs').delete().in('id', staleIds)
    if (deleteErr) {
      console.error(`Preflight sweep: could not delete stale orgs — ${deleteErr.message}`)
    } else {
      console.log(
        `Preflight sweep: removed ${staleOrgs.length} stale org(s) from a previous run: ` +
          staleOrgs.map((o) => o.name).join(', '),
      )
    }
  } else {
    console.log('Preflight sweep: no stale orgs found.')
  }

  let staleUserCount = 0
  let page = 1
  const perPage = 200
  for (;;) {
    const { data: page_, error: listErr } = await admin.auth.admin.listUsers({ page, perPage })
    if (listErr) {
      console.error(`Preflight sweep: could not list auth users — ${listErr.message}`)
      break
    }
    const users = page_?.users ?? []
    const staleUsers = users.filter((u) => (u.email ?? '').toLowerCase().includes(TAG.toLowerCase()))
    for (const u of staleUsers) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
      if (delErr) {
        console.error(`Preflight sweep: could not delete stale auth user ${u.id} — ${delErr.message}`)
      } else {
        staleUserCount++
      }
    }
    if (users.length < perPage) break
    page++
  }
  console.log(
    staleUserCount > 0
      ? `Preflight sweep: removed ${staleUserCount} stale auth user(s) from a previous run.`
      : 'Preflight sweep: no stale auth users found.',
  )
  console.log('')
}

async function main(): Promise<void> {
  await sweepPreviousRuns()

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

  let boardUserId: string | null = null

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
    const acctB = accounts.find((a) => a.organization_id === orgB.id)
    if (!acctA || !acctB) {
      throw new Error('Could not find seeded mailbox_accounts rows for both orgs')
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

    const { data: threads, error: threadErr } = await admin
      .from('inbox_threads')
      .insert([
        {
          organization_id: orgA.id,
          mailbox_account_id: acctA.id,
          gmail_thread_id: `${TAG}-thread-a`,
          subject: 'org A private thread',
        },
        {
          organization_id: orgB.id,
          mailbox_account_id: acctB.id,
          gmail_thread_id: `${TAG}-thread-b`,
          subject: 'org B private thread',
        },
      ])
      .select('id, organization_id')
    if (threadErr || !threads) {
      throw new Error(`Could not seed inbox_threads: ${threadErr?.message}`)
    }
    const threadA = threads.find((t) => t.organization_id === orgA.id)
    const threadB = threads.find((t) => t.organization_id === orgB.id)
    if (!threadA || !threadB) {
      throw new Error('Could not find seeded inbox_threads rows for both orgs')
    }

    // migrations/0030_inbox_message_uniq_scope.sql made mailbox_account_id
    // NOT NULL on inbox_messages — supply it for both org fixtures.
    const { data: messages, error: msgErr } = await admin
      .from('inbox_messages')
      .insert([
        {
          organization_id: orgA.id,
          thread_id: threadA.id,
          mailbox_account_id: acctA.id,
          gmail_message_id: `${TAG}-msg-a`,
          direction: 'inbound',
          from_email: `resident@${TAG}.test`,
          subject: 'org A private message',
          body_text: 'org A message body',
        },
        {
          organization_id: orgB.id,
          thread_id: threadB.id,
          mailbox_account_id: acctB.id,
          gmail_message_id: `${TAG}-msg-b`,
          direction: 'inbound',
          from_email: `resident@${TAG}.test`,
          subject: 'org B private message',
          body_text: 'org B message body',
        },
      ])
      .select('id, organization_id')
    if (msgErr || !messages) {
      throw new Error(`Could not seed inbox_messages: ${msgErr?.message}`)
    }
    const messageA = messages.find((m) => m.organization_id === orgA.id)
    const messageB = messages.find((m) => m.organization_id === orgB.id)
    if (!messageA || !messageB) {
      throw new Error('Could not find seeded inbox_messages rows for both orgs')
    }

    // ── real authenticated user: board member of org A ONLY ────────────
    const { data: createdUser, error: createUserErr } = await admin.auth.admin.createUser({
      email: BOARD_EMAIL,
      password: BOARD_PASSWORD,
      email_confirm: true,
    })
    if (createUserErr || !createdUser?.user) {
      throw new Error(`Could not create harness auth user: ${createUserErr?.message}`)
    }
    boardUserId = createdUser.user.id

    // handle_new_user() (migrations/0000_schema.sql / 0001_auth_fixes.sql)
    // inserts profiles on auth.users insert via trigger, in the same
    // transaction — but insert defensively in case that trigger is ever
    // disabled, since org_members.user_id FKs to profiles(id).
    const { data: profileRow } = await admin
      .from('profiles')
      .select('id')
      .eq('id', boardUserId)
      .maybeSingle()
    if (!profileRow) {
      const { error: profileInsertErr } = await admin
        .from('profiles')
        .insert({ id: boardUserId, email: BOARD_EMAIL })
      if (profileInsertErr) {
        throw new Error(`Could not backfill profiles row for harness user: ${profileInsertErr.message}`)
      }
    }

    // public.auth_is_board_or_admin() (migrations/0012_rbac_roles.sql)
    // requires role IN ('admin','board'). Use 'board' — the least-
    // privileged role that still satisfies the board_access policy.
    const { error: memberErr } = await admin.from('org_members').insert({
      org_id: orgA.id,
      user_id: boardUserId,
      role: 'board',
      joined_at: new Date().toISOString(),
    })
    if (memberErr) {
      throw new Error(`Could not insert org_members row for harness user: ${memberErr.message}`)
    }

    // Sign in for real — a genuine session with auth.uid() populated, not
    // just an API key. Use a fresh client so the earlier unauthenticated
    // `anon` client's checks (and its "no session" assertion) stay valid.
    const board = createClient<Database>(url, anonKey)
    const { data: signInData, error: signInErr } = await board.auth.signInWithPassword({
      email: BOARD_EMAIL,
      password: BOARD_PASSWORD,
    })
    const boardAuthed = !signInErr && signInData.session !== null
    check(
      '6. org A board member obtained a real authenticated session',
      boardAuthed,
      signInErr ? `${signInErr.name}: ${signInErr.message}` : 'session established',
    )

    // ── 1. logged-out denial: unauthenticated client sees nothing ──────
    // Distinguish "query ran and returned zero rows" (a real proof) from
    // "query failed" (proves nothing — could be a bad table name or a
    // network blip masquerading as a pass). NOTE: this does not prove
    // cross-org isolation — see checks 6-12 for that. See docstring.
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
          rowsSeen(data) === 0,
          `saw ${rowsSeen(data)} row(s)`,
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
          rowsSeen(data) === 0,
          `saw ${rowsSeen(data)} row(s)`,
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
          '3. mailbox_account_secrets unreadable from an anon session',
          `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`,
        )
      } else {
        check(
          '3. mailbox_account_secrets unreadable from an anon session',
          rowsSeen(data) === 0,
          `saw ${rowsSeen(data)} row(s) — ANY row here is a critical leak`,
        )
      }
    }

    {
      const { error: insertErr } = await anon
        .from('mailbox_account_secrets')
        .insert({ mailbox_account_id: acctA.id, refresh_token_enc: 'injected' })
      check(
        '4. mailbox_account_secrets rejects an anon-session insert',
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

    // ── 4. cross-org isolation: a REAL org A board-member session ──────
    // These are the only checks in this file that exercise
    // `organization_id = ANY (auth_org_ids())` with a non-null auth.uid().
    if (!boardAuthed) {
      const reason = 'org A board member never obtained a session (see check 6)'
      skip('7. org A board member CAN read org A inbox_threads (positive proof)', reason)
      skip('8. org A board member CANNOT read org B inbox_threads', reason)
      skip('9. org A board member CANNOT read org B mailbox_accounts', reason)
      skip('10. org A board member CANNOT read mailbox_account_secrets (authenticated)', reason)
      skip('11. org A board member CAN read org A inbox_messages (positive proof)', reason)
      skip('12. org A board member CANNOT read org B inbox_messages', reason)
    } else {
      // 7. Positive proof first: the policy is not simply denying
      // everyone. If this fails, checks 8-9 and 12 would be meaningless.
      {
        const { data, error } = await board
          .from('inbox_threads')
          .select('id')
          .eq('organization_id', orgA.id)
        if (error) {
          skip(
            '7. org A board member CAN read org A inbox_threads (positive proof)',
            `query failed — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          const ids = (data ?? []).map((r) => r.id)
          check(
            '7. org A board member CAN read org A inbox_threads (positive proof)',
            ids.includes(threadA.id),
            `saw ${ids.length} row(s), expected org A's thread ${threadA.id} among them`,
          )
        }
      }

      // 8. The actual isolation claim: cannot read org B's real row.
      {
        const { data, error } = await board
          .from('inbox_threads')
          .select('id')
          .eq('organization_id', orgB.id)
        if (error) {
          skip(
            '8. org A board member CANNOT read org B inbox_threads',
            `query failed — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          check(
            '8. org A board member CANNOT read org B inbox_threads',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — org B's thread ${threadB.id} exists and must not be visible`,
          )
        }
      }

      // 9. mailbox_accounts cross-org isolation (negative only — org A's
      // own mailbox_accounts row is not asserted here since checks 7/11
      // already prove the policy isn't denying everyone).
      {
        const { data, error } = await board
          .from('mailbox_accounts')
          .select('id')
          .eq('organization_id', orgB.id)
        if (error) {
          skip(
            '9. org A board member CANNOT read org B mailbox_accounts',
            `query failed — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          check(
            '9. org A board member CANNOT read org B mailbox_accounts',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — org B's account ${acctB.id} exists and must not be visible`,
          )
        }
      }

      // 10. Strongest form of the secrets claim: not even a legitimate,
      // authenticated org A board member can read org A's own secret.
      {
        const { data, error } = await board
          .from('mailbox_account_secrets')
          .select('mailbox_account_id')
        if (error) {
          skip(
            '10. org A board member CANNOT read mailbox_account_secrets (authenticated)',
            `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          check(
            '10. org A board member CANNOT read mailbox_account_secrets (authenticated)',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — ANY row here is a critical leak`,
          )
        }
      }

      // 11-12. Same shape, extended to inbox_messages (the highest-value
      // table not previously covered — it holds actual email content).
      {
        const { data, error } = await board
          .from('inbox_messages')
          .select('id')
          .eq('organization_id', orgA.id)
        if (error) {
          skip(
            '11. org A board member CAN read org A inbox_messages (positive proof)',
            `query failed — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          const ids = (data ?? []).map((r) => r.id)
          check(
            '11. org A board member CAN read org A inbox_messages (positive proof)',
            ids.includes(messageA.id),
            `saw ${ids.length} row(s), expected org A's message ${messageA.id} among them`,
          )
        }
      }

      {
        const { data, error } = await board
          .from('inbox_messages')
          .select('id')
          .eq('organization_id', orgB.id)
        if (error) {
          skip(
            '12. org A board member CANNOT read org B inbox_messages',
            `query failed — ${error.code ?? '?'} ${error.message}`,
          )
        } else {
          check(
            '12. org A board member CANNOT read org B inbox_messages',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — org B's message ${messageB.id} exists and must not be visible`,
          )
        }
      }
    }
  } catch (err) {
    console.error('\nUnexpected error during test body:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    // ── cleanup (cascades handle children: mailbox_accounts,
    // mailbox_account_secrets, inbox_threads, inbox_messages,
    // org_members all FK to orgs/accounts ON DELETE CASCADE) ──────────
    const { error: cleanupErr } = await admin.from('orgs').delete().in('id', orgIds)
    if (cleanupErr) {
      check('13. cleanup deleted the harness orgs', false, cleanupErr.message)
    } else {
      check('13. cleanup deleted the harness orgs', true)
    }

    if (boardUserId) {
      const { error: deleteUserErr } = await admin.auth.admin.deleteUser(boardUserId)
      check(
        '14. cleanup deleted the harness auth user',
        !deleteUserErr,
        deleteUserErr ? deleteUserErr.message : boardUserId,
      )
    } else {
      // User creation itself failed before boardUserId was set — nothing
      // to delete, and that failure already surfaced as an unexpected
      // error above.
      check('14. cleanup deleted the harness auth user', true, 'no harness user was created')
    }

    const [
      { data: leftoverOrgs },
      { data: leftoverAccounts },
      { data: leftoverThreads },
      { data: leftoverMessages },
    ] = await Promise.all([
      admin.from('orgs').select('id').in('id', orgIds),
      admin.from('mailbox_accounts').select('id').in('organization_id', orgIds),
      admin.from('inbox_threads').select('id').in('organization_id', orgIds),
      admin.from('inbox_messages').select('id').in('organization_id', orgIds),
    ])
    check('13a. no harness orgs remain', (leftoverOrgs ?? []).length === 0)
    check('13b. no harness mailbox_accounts remain', (leftoverAccounts ?? []).length === 0)
    check('13c. no harness inbox_threads remain', (leftoverThreads ?? []).length === 0)
    check('13d. no harness inbox_messages remain', (leftoverMessages ?? []).length === 0)

    let leftoverUserCount = 0
    let page = 1
    const perPage = 200
    for (;;) {
      const { data: page_, error: listErr } = await admin.auth.admin.listUsers({ page, perPage })
      if (listErr) {
        console.error(`Cleanup verification: could not list auth users — ${listErr.message}`)
        break
      }
      const users = page_?.users ?? []
      leftoverUserCount += users.filter((u) =>
        (u.email ?? '').toLowerCase().includes(TAG.toLowerCase()),
      ).length
      if (users.length < perPage) break
      page++
    }
    check('14a. no harness auth users remain', leftoverUserCount === 0, `found ${leftoverUserCount}`)

    console.log(
      '\nCleanup verification query: ' +
        `select id from orgs where id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from mailbox_accounts where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_threads where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_messages where organization_id in ('${orgA.id}','${orgB.id}')\n` +
        'Auth users verified via supabase.auth.admin.listUsers(), filtered for email containing ' +
        `"${TAG}" (cannot be expressed as a SQL query against auth.users from this key).`,
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
