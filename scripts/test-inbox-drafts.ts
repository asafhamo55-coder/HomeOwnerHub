/**
 * scripts/test-inbox-drafts.ts
 *
 * Integration test for Phase B's human-loop reply drafting: proves the
 * guarantees that only a live database can prove, against the real
 * `inbox_drafts` / `inbox_reply_embeddings` tables and their `board_access`
 * RLS policies — not against mocks. Two groups of checks:
 *
 *   1. RLS isolation (B1-B6). A real, authenticated board member of org A
 *      can read org A's drafts and reply embeddings, and cannot read org
 *      B's — both tables, both directions — proved with a genuine
 *      `signInWithPassword` session, not merely the anon API key. As
 *      `scripts/test-inbox-rls.ts` documents at length: with an anon
 *      client, `auth.uid()` is NULL, so `board_access`'s
 *      `auth_is_board_or_admin()` predicate returns false regardless of
 *      whether the org check is even present — a security test built only
 *      on the anon key cannot fail, so it cannot prove anything. B1/B3
 *      prove the policy isn't simply denying everyone (a prerequisite for
 *      B2/B4 to mean anything); B5/B6 prove an anon client reads neither
 *      table at all.
 *
 *   2. The cancel race (C1-C3), the reason this script exists. `cancelDraft`
 *      (apps/hoa/src/lib/inbox/draft/actions.ts) and the send job's claim
 *      (packages/jobs/src/mailbox-send.ts, runMailboxSend) both issue a
 *      CONDITIONAL update on `status='queued'`, never read-then-decide, so
 *      that whichever one commits first, the other matches zero rows. C1
 *      and C2 prove both directions of that race hold against Postgres for
 *      real: sending a reply a board member cancelled cannot be undone;
 *      telling them it was cancelled when it actually went out is the same
 *      lie from the other side. C3 proves `approveDraft`'s
 *      `'draft' -> 'queued'` transition is single-shot under concurrency
 *      the same way.
 *
 *      Neither server action is called directly — both are `'use server'`
 *      functions that resolve their Supabase client via `next/headers`
 *      `cookies()` (apps/hoa/src/lib/supabase/server.ts), which throws
 *      outside a real Next.js request. Instead this script issues the
 *      IDENTICAL conditional update each action issues, against the same
 *      client type: `cancelDraft`'s and `approveDraft`'s updates run
 *      through a genuine signed-in board session (exercising RLS exactly
 *      as production does), and the send job's claim runs through the
 *      service-role client, matching `createAdminClient()` in
 *      packages/jobs/src/mailbox-send.ts.
 *
 *   C4/C5 round out the guarantees that only need a live-ish harness for
 *   parity with the rest of this file, not the database itself:
 *   `validateCitations` throwing `InvalidCitationError` for a refId that
 *   was never retrieved, and `hasUnfilledBlanks` catching all four blank
 *   kinds plus a spacing variant.
 *
 * Uses the service role to seed two throwaway orgs, a real confirmed auth
 * user, and cross-org fixtures, then reads/writes back with the anon key
 * and with the authenticated user's own session. Cleans up everything it
 * created, even if an assertion throws partway through, AND sweeps for
 * anything a previous interrupted run left behind.
 *
 * This runs against a LIVE database. Every row and user created is tagged
 * with TAG below so it is findable, and cleanup is verified, not assumed.
 * Never touches anything not carrying the tag — in particular, never
 * touches org a4906f16-baf3-4232-a2bd-a78ea432ad86 (Madison Park, a live
 * tenant). Never logs an email address, subject, or body — counts, ids,
 * and PASS/FAIL only.
 *
 * Run:
 *   rtk npx tsx scripts/test-inbox-drafts.ts
 *
 * Credential resolution matches scripts/test-inbox-rls.ts (first non-empty
 * wins, since Vercel writes empty-string placeholders for Sensitive env
 * vars it can't decrypt locally):
 *   URL:     NEXT_PUBLIC_SUPABASE_URL       -> SUPABASE_URL
 *   anon:    NEXT_PUBLIC_SUPABASE_ANON_KEY   -> SUPABASE_ANON_KEY
 *   service: SUPABASE_SERVICE_ROLE_KEY       -> SUPABASE_SECRET_KEY
 */

import './_load-env'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { validateCitations, InvalidCitationError } from '../packages/workflows/src/W32-reply-drafter/tools'
import { hasUnfilledBlanks } from '../apps/hoa/src/lib/inbox/draft/blanks'

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

const TAG = 'test-inbox-drafts-harness'
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

function rowsSeen<T>(data: T[] | null): number {
  return (data ?? []).length
}

/**
 * Preflight sweep — same rationale as scripts/test-inbox-rls.ts: finds and
 * deletes anything a previous interrupted run left behind. Strictly
 * tag-scoped: orgs matched by `name ilike '%' || TAG || '%'`, auth users
 * matched by email containing TAG. Never a broad delete.
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

  // ── C4/C5: pure-function checks, no database involved ───────────────
  // Run early so a fixture-seeding failure below never masks these.
  {
    try {
      validateCitations([{ refId: 'never-retrieved', quote: 'anything' }], [])
      check('C4 validateCitations throws InvalidCitationError for an unretrieved refId', false, 'did not throw')
    } catch (err) {
      const isRightType = err instanceof InvalidCitationError
      const carriesRefId = isRightType && (err as InvalidCitationError).invalidRefIds.includes('never-retrieved')
      check(
        'C4 validateCitations throws InvalidCitationError for an unretrieved refId',
        isRightType && carriesRefId,
        isRightType ? `invalidRefIds=${JSON.stringify((err as InvalidCitationError).invalidRefIds)}` : String(err),
      )
    }
  }

  {
    const kinds = ['money', 'enforcement', 'legal', 'other_resident']
    const perKind = kinds.map((k) => hasUnfilledBlanks(`x [[BLANK: ${k}]] y`))
    check(
      'C5 hasUnfilledBlanks is true for all four blank kinds',
      perKind.every(Boolean),
      kinds.map((k, i) => `${k}=${perKind[i]}`).join(' '),
    )
    const spacedOk =
      hasUnfilledBlanks('x [[BLANK:money]] y') && hasUnfilledBlanks('x [[ BLANK : money ]] y')
    check('C5b hasUnfilledBlanks tolerates the spaced variant', spacedOk)
  }

  console.log('')

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
    if (acctErr || !accounts) throw new Error(`Could not seed mailbox_accounts: ${acctErr?.message}`)
    const acctA = accounts.find((a) => a.organization_id === orgA.id)
    const acctB = accounts.find((a) => a.organization_id === orgB.id)
    if (!acctA || !acctB) throw new Error('Could not find seeded mailbox_accounts rows for both orgs')

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
    if (threadErr || !threads) throw new Error(`Could not seed inbox_threads: ${threadErr?.message}`)
    const threadA = threads.find((t) => t.organization_id === orgA.id)
    const threadB = threads.find((t) => t.organization_id === orgB.id)
    if (!threadA || !threadB) throw new Error('Could not find seeded inbox_threads rows for both orgs')

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
    if (msgErr || !messages) throw new Error(`Could not seed inbox_messages: ${msgErr?.message}`)
    const messageA = messages.find((m) => m.organization_id === orgA.id)
    const messageB = messages.find((m) => m.organization_id === orgB.id)
    if (!messageA || !messageB) throw new Error('Could not find seeded inbox_messages rows for both orgs')

    // ── fixture drafts + reply embeddings for the RLS reads (B1-B6) ────
    const { data: drafts, error: draftErr } = await admin
      .from('inbox_drafts')
      .insert([
        {
          organization_id: orgA.id,
          thread_id: threadA.id,
          status: 'draft',
          subject: 'org A draft subject',
          body_text: 'org A draft body',
        },
        {
          organization_id: orgB.id,
          thread_id: threadB.id,
          status: 'draft',
          subject: 'org B draft subject',
          body_text: 'org B draft body',
        },
      ])
      .select('id, organization_id')
    if (draftErr || !drafts) throw new Error(`Could not seed inbox_drafts: ${draftErr?.message}`)
    const draftFixtureA = drafts.find((d) => d.organization_id === orgA.id)
    const draftFixtureB = drafts.find((d) => d.organization_id === orgB.id)
    if (!draftFixtureA || !draftFixtureB) throw new Error('Could not find seeded inbox_drafts rows for both orgs')

    const { data: embeddings, error: embErr } = await admin
      .from('inbox_reply_embeddings')
      .insert([
        {
          organization_id: orgA.id,
          message_id: messageA.id,
          embedding: null,
          text_sha256: `${TAG}-sha-a`,
          skip_reason: 'harness_probe',
        },
        {
          organization_id: orgB.id,
          message_id: messageB.id,
          embedding: null,
          text_sha256: `${TAG}-sha-b`,
          skip_reason: 'harness_probe',
        },
      ])
      .select('id, organization_id')
    if (embErr || !embeddings) throw new Error(`Could not seed inbox_reply_embeddings: ${embErr?.message}`)
    const embFixtureA = embeddings.find((e) => e.organization_id === orgA.id)
    const embFixtureB = embeddings.find((e) => e.organization_id === orgB.id)
    if (!embFixtureA || !embFixtureB) throw new Error('Could not find seeded inbox_reply_embeddings rows for both orgs')

    // ── real authenticated user: board member of org A ONLY ────────────
    const { data: createdUser, error: createUserErr } = await admin.auth.admin.createUser({
      email: BOARD_EMAIL,
      password: BOARD_PASSWORD,
      email_confirm: true,
    })
    if (createUserErr || !createdUser?.user) throw new Error(`Could not create harness auth user: ${createUserErr?.message}`)
    boardUserId = createdUser.user.id

    const { data: profileRow } = await admin
      .from('profiles')
      .select('id')
      .eq('id', boardUserId)
      .maybeSingle()
    if (!profileRow) {
      const { error: profileInsertErr } = await admin
        .from('profiles')
        .insert({ id: boardUserId, email: BOARD_EMAIL })
      if (profileInsertErr) throw new Error(`Could not backfill profiles row for harness user: ${profileInsertErr.message}`)
    }

    const { error: memberErr } = await admin.from('org_members').insert({
      org_id: orgA.id,
      user_id: boardUserId,
      role: 'board',
      joined_at: new Date().toISOString(),
    })
    if (memberErr) throw new Error(`Could not insert org_members row for harness user: ${memberErr.message}`)

    // Sign in for real — a genuine session with auth.uid() populated, not
    // just an API key. This is the same client type `cancelDraft` and
    // `approveDraft` receive in production (a per-request, cookie-bound
    // session), so the C1-C3 updates below exercise `board_access` exactly
    // as those server actions do.
    const board = createClient<Database>(url, anonKey)
    const { data: signInData, error: signInErr } = await board.auth.signInWithPassword({
      email: BOARD_EMAIL,
      password: BOARD_PASSWORD,
    })
    const boardAuthed = !signInErr && signInData.session !== null
    check(
      'B0. org A board member obtained a real authenticated session',
      boardAuthed,
      signInErr ? `${signInErr.name}: ${signInErr.message}` : 'session established',
    )

    // ── B5/B6: anon client reads neither table ──────────────────────────
    {
      const { data, error } = await anon.from('inbox_drafts').select('id')
      if (error) {
        skip('B5. anon client cannot read inbox_drafts', `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`)
      } else {
        check('B5. anon client cannot read inbox_drafts', rowsSeen(data) === 0, `saw ${rowsSeen(data)} row(s)`)
      }
    }
    {
      const { data, error } = await anon.from('inbox_reply_embeddings').select('id')
      if (error) {
        skip('B6. anon client cannot read inbox_reply_embeddings', `query failed, not a proof of RLS denial — ${error.code ?? '?'} ${error.message}`)
      } else {
        check('B6. anon client cannot read inbox_reply_embeddings', rowsSeen(data) === 0, `saw ${rowsSeen(data)} row(s)`)
      }
    }

    if (!boardAuthed) {
      const reason = 'org A board member never obtained a session (see check B0)'
      skip('B1. org A board member CAN read org A inbox_drafts (positive proof)', reason)
      skip('B2. org A board member CANNOT read org B inbox_drafts', reason)
      skip('B3. org A board member CAN read org A inbox_reply_embeddings (positive proof)', reason)
      skip('B4. org A board member CANNOT read org B inbox_reply_embeddings', reason)
      skip('C1. cancel-then-claim: claim matches zero rows', reason)
      skip('C2. claim-then-cancel: cancel matches zero rows', reason)
      skip('C3. approve is single-shot under concurrency', reason)
    } else {
      // B1. Positive proof first: the policy is not simply denying everyone.
      {
        const { data, error } = await board.from('inbox_drafts').select('id').eq('organization_id', orgA.id)
        if (error) {
          skip('B1. org A board member CAN read org A inbox_drafts (positive proof)', `query failed — ${error.code ?? '?'} ${error.message}`)
        } else {
          const ids = (data ?? []).map((r) => r.id)
          check(
            'B1. org A board member CAN read org A inbox_drafts (positive proof)',
            ids.includes(draftFixtureA.id),
            `saw ${ids.length} row(s), expected org A's draft ${draftFixtureA.id} among them`,
          )
        }
      }
      // B2. The actual isolation claim.
      {
        const { data, error } = await board.from('inbox_drafts').select('id').eq('organization_id', orgB.id)
        if (error) {
          skip('B2. org A board member CANNOT read org B inbox_drafts', `query failed — ${error.code ?? '?'} ${error.message}`)
        } else {
          check(
            'B2. org A board member CANNOT read org B inbox_drafts',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — org B's draft ${draftFixtureB.id} exists and must not be visible`,
          )
        }
      }
      // B3. Positive proof for the embeddings table.
      {
        const { data, error } = await board.from('inbox_reply_embeddings').select('id').eq('organization_id', orgA.id)
        if (error) {
          skip('B3. org A board member CAN read org A inbox_reply_embeddings (positive proof)', `query failed — ${error.code ?? '?'} ${error.message}`)
        } else {
          const ids = (data ?? []).map((r) => r.id)
          check(
            'B3. org A board member CAN read org A inbox_reply_embeddings (positive proof)',
            ids.includes(embFixtureA.id),
            `saw ${ids.length} row(s), expected org A's embedding ${embFixtureA.id} among them`,
          )
        }
      }
      // B4. The actual isolation claim for the embeddings table.
      {
        const { data, error } = await board.from('inbox_reply_embeddings').select('id').eq('organization_id', orgB.id)
        if (error) {
          skip('B4. org A board member CANNOT read org B inbox_reply_embeddings', `query failed — ${error.code ?? '?'} ${error.message}`)
        } else {
          check(
            'B4. org A board member CANNOT read org B inbox_reply_embeddings',
            rowsSeen(data) === 0,
            `saw ${rowsSeen(data)} row(s) — org B's embedding ${embFixtureB.id} exists and must not be visible`,
          )
        }
      }

      // ── C1: insert queued -> cancel (board session) -> claim (admin) ───
      // The cancel must win outright (one row), and the claim that follows
      // must then match ZERO rows: a cancelled draft must never be sent.
      {
        const { data: raceDraft, error: insErr } = await admin
          .from('inbox_drafts')
          .insert({
            organization_id: orgA.id,
            thread_id: threadA.id,
            status: 'queued',
            subject: 'race c1 subject',
            body_text: 'race c1 body',
            send_after: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (insErr || !raceDraft) throw new Error(`C1 fixture insert failed: ${insErr?.message}`)

        // Identical predicate to cancelDraft (apps/hoa/src/lib/inbox/draft/actions.ts).
        const { data: cancelResult, error: cancelErr } = await board
          .from('inbox_drafts')
          .update({ status: 'cancelled' })
          .eq('id', raceDraft.id)
          .eq('organization_id', orgA.id)
          .eq('status', 'queued')
          .select('id, thread_id')
          .maybeSingle()
        if (cancelErr) throw new Error(`C1 cancel step errored: ${cancelErr.message}`)
        check('C1a. cancel-first matches exactly one row', cancelResult !== null)

        // Identical predicate to the send job's claim (packages/jobs/src/mailbox-send.ts).
        const { data: claimResult, error: claimErr } = await admin
          .from('inbox_drafts')
          .update({ status: 'sending' })
          .eq('id', raceDraft.id)
          .eq('status', 'queued')
          .select('id')
          .maybeSingle()
        if (claimErr) throw new Error(`C1 claim step errored: ${claimErr.message}`)
        check(
          'C1. cancel-then-claim: the send job\'s claim matches zero rows once cancelled',
          claimResult === null,
          claimResult ? 'claim matched a row — a cancelled draft would have been sent' : 'zero rows matched',
        )
      }

      // ── C2: insert queued -> claim (admin) -> attempt cancel (board) ───
      // The claim must win outright, and the cancel that follows must then
      // match ZERO rows: the user must be told the truth, not shown a
      // cancellation that did not happen.
      {
        const { data: raceDraft, error: insErr } = await admin
          .from('inbox_drafts')
          .insert({
            organization_id: orgA.id,
            thread_id: threadA.id,
            status: 'queued',
            subject: 'race c2 subject',
            body_text: 'race c2 body',
            send_after: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (insErr || !raceDraft) throw new Error(`C2 fixture insert failed: ${insErr?.message}`)

        const { data: claimResult, error: claimErr } = await admin
          .from('inbox_drafts')
          .update({ status: 'sending' })
          .eq('id', raceDraft.id)
          .eq('status', 'queued')
          .select('id')
          .maybeSingle()
        if (claimErr) throw new Error(`C2 claim step errored: ${claimErr.message}`)
        check('C2a. claim-first matches exactly one row', claimResult !== null)

        const { data: cancelResult, error: cancelErr } = await board
          .from('inbox_drafts')
          .update({ status: 'cancelled' })
          .eq('id', raceDraft.id)
          .eq('organization_id', orgA.id)
          .eq('status', 'queued')
          .select('id, thread_id')
          .maybeSingle()
        if (cancelErr) throw new Error(`C2 cancel step errored: ${cancelErr.message}`)
        check(
          'C2. claim-then-cancel: cancelDraft matches zero rows once claimed',
          cancelResult === null,
          cancelResult ? 'cancel matched a row — the user would be told a lie' : 'zero rows matched',
        )
      }

      // ── C3: two concurrent 'draft' -> 'queued' updates ──────────────────
      // Exactly one may match a row, regardless of how the two requests
      // actually interleave over the wire — the WHERE status='draft'
      // predicate makes this true whether they race at the DB row lock or
      // simply execute one after the other.
      {
        const { data: approveDraftRow, error: insErr } = await admin
          .from('inbox_drafts')
          .insert({
            organization_id: orgA.id,
            thread_id: threadA.id,
            status: 'draft',
            subject: 'race c3 subject',
            body_text: 'race c3 body',
          })
          .select('id')
          .single()
        if (insErr || !approveDraftRow) throw new Error(`C3 fixture insert failed: ${insErr?.message}`)

        const approveUpdate = () =>
          board
            .from('inbox_drafts')
            .update({
              status: 'queued',
              subject: 'race c3 subject (approved)',
              body_text: 'race c3 body (approved)',
              approved_by: boardUserId,
              approved_at: new Date().toISOString(),
              send_after: new Date(Date.now() + 30_000).toISOString(),
            })
            .eq('id', approveDraftRow.id)
            .eq('organization_id', orgA.id)
            .eq('status', 'draft')
            .select('id, thread_id')
            .maybeSingle()

        const [r1, r2] = await Promise.all([approveUpdate(), approveUpdate()])
        if (r1.error) throw new Error(`C3 concurrent update 1 errored: ${r1.error.message}`)
        if (r2.error) throw new Error(`C3 concurrent update 2 errored: ${r2.error.message}`)
        const matches = [r1.data, r2.data].filter((d) => d !== null).length
        check(
          'C3. approve is single-shot: exactly one of two concurrent updates matches',
          matches === 1,
          `${matches} of 2 concurrent updates matched a row`,
        )
      }
    }
  } catch (err) {
    console.error('\nUnexpected error during test body:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    // ── cleanup (cascades handle children: mailbox_accounts,
    // inbox_threads, inbox_messages, inbox_drafts, inbox_reply_embeddings,
    // org_members all FK to orgs ON DELETE CASCADE) ─────────────────────
    const { error: cleanupErr } = await admin.from('orgs').delete().in('id', orgIds)
    check('Z1. cleanup deleted the harness orgs', !cleanupErr, cleanupErr?.message)

    if (boardUserId) {
      const { error: deleteUserErr } = await admin.auth.admin.deleteUser(boardUserId)
      check('Z2. cleanup deleted the harness auth user', !deleteUserErr, deleteUserErr ? deleteUserErr.message : boardUserId)
    } else {
      check('Z2. cleanup deleted the harness auth user', true, 'no harness user was created')
    }

    const [
      { data: leftoverOrgs },
      { data: leftoverAccounts },
      { data: leftoverThreads },
      { data: leftoverMessages },
      { data: leftoverDrafts },
      { data: leftoverEmbeddings },
    ] = await Promise.all([
      admin.from('orgs').select('id').in('id', orgIds),
      admin.from('mailbox_accounts').select('id').in('organization_id', orgIds),
      admin.from('inbox_threads').select('id').in('organization_id', orgIds),
      admin.from('inbox_messages').select('id').in('organization_id', orgIds),
      admin.from('inbox_drafts').select('id').in('organization_id', orgIds),
      admin.from('inbox_reply_embeddings').select('id').in('organization_id', orgIds),
    ])
    check('Z1a. no harness orgs remain', (leftoverOrgs ?? []).length === 0)
    check('Z1b. no harness mailbox_accounts remain', (leftoverAccounts ?? []).length === 0)
    check('Z1c. no harness inbox_threads remain', (leftoverThreads ?? []).length === 0)
    check('Z1d. no harness inbox_messages remain', (leftoverMessages ?? []).length === 0)
    check('Z1e. no harness inbox_drafts remain', (leftoverDrafts ?? []).length === 0)
    check('Z1f. no harness inbox_reply_embeddings remain', (leftoverEmbeddings ?? []).length === 0)

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
      leftoverUserCount += users.filter((u) => (u.email ?? '').toLowerCase().includes(TAG.toLowerCase())).length
      if (users.length < perPage) break
      page++
    }
    check('Z2a. no harness auth users remain', leftoverUserCount === 0, `found ${leftoverUserCount}`)

    console.log(
      '\nCleanup verification query: ' +
        `select id from orgs where id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from mailbox_accounts where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_threads where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_messages where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_drafts where organization_id in ('${orgA.id}','${orgB.id}'); ` +
        `select id from inbox_reply_embeddings where organization_id in ('${orgA.id}','${orgB.id}')\n` +
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
