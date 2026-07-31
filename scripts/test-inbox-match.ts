/**
 * scripts/test-inbox-match.ts
 *
 * Integration test for matchThread() against real Postgres. Seeds a
 * throwaway org with one property, one resident, and several threads that
 * should hit different signals, then asserts the outcome for each.
 *
 * Run:
 *   rtk proxy pnpm exec tsx scripts/test-inbox-match.ts
 *
 * Credential resolution deviates from a naive `process.env.X` check, same
 * pattern as scripts/test-inbox-rls.ts: Vercel writes empty-string
 * placeholders for Sensitive env vars it can't decrypt locally, so an
 * empty string is treated the same as unset. Fallback order (first
 * non-empty wins):
 *   URL:     NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL
 *   service: SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SECRET_KEY
 *
 * This runs against a LIVE database. Every row created is tagged with TAG
 * so it is findable, cleanup runs even if an assertion throws (wrapped in
 * try/finally), and a tag-scoped preflight sweep removes anything a prior
 * interrupted run left behind. Never touches org
 * a4906f16-baf3-4232-a2bd-a78ea432ad86 (Madison Park, a live tenant) or any
 * row this script did not create.
 *
 * Follows the skip-counter pattern in scripts/test-inbox-rls.ts: a skipped
 * check prints a distinct SKIP line and is never counted as a pass — any
 * skip makes the run exit non-zero.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { matchThread } from '../apps/hoa/src/lib/inbox/match'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error(
    'Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and ' +
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
  )
  process.exit(1)
}

const db = createClient<Database>(url, key)
const TAG = 'test-inbox-match-harness'

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
 * Preflight sweep — finds and deletes anything a previous run left behind
 * (SIGKILL, OOM, or a network drop during that run's own `finally` block
 * would leave a harness org and its cascaded children live in this
 * database with no record of their ids). Strictly tag-scoped: orgs matched
 * by `name ilike '%' || TAG || '%'`. Never a broad delete.
 */
async function sweepPreviousRuns(): Promise<void> {
  const { data: staleOrgs, error } = await db
    .from('orgs')
    .select('id, name')
    .ilike('name', `%${TAG}%`)

  if (error) {
    console.error(`Preflight sweep: could not query for stale orgs — ${error.message}`)
    return
  }

  if (staleOrgs && staleOrgs.length > 0) {
    const staleIds = staleOrgs.map((o) => o.id)
    const { error: deleteErr } = await db.from('orgs').delete().in('id', staleIds)
    if (deleteErr) {
      console.error(`Preflight sweep: could not delete stale orgs — ${deleteErr.message}`)
    } else {
      console.log(
        `Preflight sweep: removed ${staleOrgs.length} stale org(s) from a previous run.`,
      )
    }
  } else {
    console.log('Preflight sweep: no stale orgs found.')
  }
  console.log('')
}

async function seedThread(
  orgId: string,
  accountId: string,
  gmailThreadId: string,
  message: {
    fromEmail: string
    fromName?: string
    subject?: string
    strippedText?: string
  },
): Promise<string> {
  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .insert({
      organization_id: orgId,
      mailbox_account_id: accountId,
      gmail_thread_id: gmailThreadId,
      subject: message.subject ?? 'test',
    })
    .select('id')
    .single()

  if (threadError || !thread) {
    throw new Error(`seedThread: could not insert inbox_threads — ${threadError?.message}`)
  }

  // mailbox_account_id is NOT NULL on inbox_messages as of migration
  // 0030_inbox_message_uniq_scope.sql — must be supplied here.
  const { error: messageError } = await db.from('inbox_messages').insert({
    organization_id: orgId,
    thread_id: thread.id,
    mailbox_account_id: accountId,
    gmail_message_id: `${gmailThreadId}-m1`,
    rfc822_message_id: `<${gmailThreadId}@mail>`,
    direction: 'inbound',
    from_email: message.fromEmail,
    from_name: message.fromName ?? null,
    subject: message.subject ?? 'test',
    stripped_text: message.strippedText ?? 'body',
    sent_at: new Date().toISOString(),
  })

  if (messageError) {
    throw new Error(`seedThread: could not insert inbox_messages — ${messageError.message}`)
  }

  return thread.id
}

async function main(): Promise<void> {
  await sweepPreviousRuns()

  const { data: org, error: orgError } = await db
    .from('orgs')
    .insert({ name: `${TAG}-org`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (orgError || !org) {
    console.error(`Could not seed org: ${orgError?.message}`)
    process.exit(1)
  }

  console.log(`Seeded org: ${org.id}\n`)

  try {
    const { data: property, error: propertyError } = await db
      .from('hoa_properties')
      .insert({ org_id: org.id, address: '214 Oak Ln', owner_email: 'owner@example.test' })
      .select('id')
      .single()
    if (propertyError || !property) {
      throw new Error(`Could not seed hoa_properties: ${propertyError?.message}`)
    }

    const { data: unit, error: unitError } = await db
      .from('units')
      .insert({
        organization_id: org.id,
        address_line1: '214 Oak Ln',
        legacy_hoa_property_id: property.id,
      })
      .select('id')
      .single()
    if (unitError || !unit) {
      throw new Error(`Could not seed units: ${unitError?.message}`)
    }

    const { data: resident, error: residentError } = await db
      .from('property_residents')
      .insert({
        organization_id: org.id,
        property_id: property.id,
        full_name: 'Jenna Rivera',
        email: 'j.rivera@example.test',
        role: 'owner',
      })
      .select('id')
      .single()
    if (residentError || !resident) {
      throw new Error(`Could not seed property_residents: ${residentError?.message}`)
    }

    const { data: account, error: accountError } = await db
      .from('mailbox_accounts')
      .insert({
        organization_id: org.id,
        email_address: `board@${TAG}.test`,
        scope_mode: 'all',
      })
      .select('id')
      .single()
    if (accountError || !account) {
      throw new Error(`Could not seed mailbox_accounts: ${accountError?.message}`)
    }

    // A: known resident email → high, auto-attach
    const tA = await seedThread(org.id, account.id, `${TAG}-a`, {
      fromEmail: 'j.rivera@example.test',
    })
    const rA = await matchThread(db, org.id, tA)
    check(
      'A. known resident email → high + unit attached',
      rA.confidence === 'high' && rA.unitId === unit.id && rA.residentId === resident.id,
      `${rA.confidence}/${rA.rule}`,
    )

    // B: owner_email → high
    const tB = await seedThread(org.id, account.id, `${TAG}-b`, {
      fromEmail: 'owner@example.test',
    })
    const rB = await matchThread(db, org.id, tB)
    check(
      'B. owner_email → high',
      rB.confidence === 'high' && rB.unitId === unit.id,
      `${rB.confidence}/${rB.rule}`,
    )

    // C: unknown sender, address in body → medium, NOT attached
    const tC = await seedThread(org.id, account.id, `${TAG}-c`, {
      fromEmail: 'stranger@example.test',
      strippedText: 'I am writing about 214 Oak Lane, the gate is broken.',
    })
    const rC = await matchThread(db, org.id, tC)
    check(
      'C. address in body → medium, unit NOT auto-attached',
      rC.confidence === 'medium' &&
        rC.unitId === null &&
        rC.reason.candidate_unit_ids?.[0] === unit.id,
      `${rC.confidence}/${rC.rule}`,
    )

    // D: fully unknown → none
    const tD = await seedThread(org.id, account.id, `${TAG}-d`, {
      fromEmail: 'vendor@example.test',
      strippedText: 'Invoice 4417 attached, $340 due.',
    })
    const rD = await matchThread(db, org.id, tD)
    check(
      'D. unknown sender, no address → none',
      rD.confidence === 'none' && rD.unitId === null,
      `${rD.confidence}/${rD.rule}`,
    )

    // E: sender alias overrides
    const { error: aliasError } = await db.from('inbox_sender_aliases').insert({
      organization_id: org.id,
      email_address: 'vendor@example.test',
      unit_id: unit.id,
    })
    if (aliasError) {
      throw new Error(`Could not seed inbox_sender_aliases: ${aliasError.message}`)
    }
    const rE = await matchThread(db, org.id, tD)
    check(
      'E. learned alias promotes the same sender to high',
      rE.confidence === 'high' && rE.unitId === unit.id && rE.rule === 'sender_alias',
      `${rE.confidence}/${rE.rule}`,
    )

    // Ruling check: only HIGH confidence may ever auto-attach a unitId.
    // If a medium/low outcome above carried a non-null unitId, that is a
    // BLOCKED-severity bug, not a test-assertion tweak.
    check(
      'Ruling: no medium/low outcome auto-attached a unit',
      [rC, rD].every((r) => r.confidence === 'high' || r.unitId === null),
      `C=${rC.confidence}/${rC.unitId} D=${rD.confidence}/${rD.unitId}`,
    )
  } catch (err) {
    console.error('\nUnexpected error during test body:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    // ── cleanup (cascades handle children: hoa_properties, units,
    // property_residents, mailbox_accounts, inbox_threads, inbox_messages,
    // inbox_sender_aliases all FK to orgs ON DELETE CASCADE) ────────────
    const { error: cleanupErr } = await db.from('orgs').delete().eq('id', org.id)
    if (cleanupErr) {
      check('Z. cleanup deleted the harness org', false, cleanupErr.message)
    } else {
      check('Z. cleanup deleted the harness org', true)
    }

    const { data: leftoverOrgs } = await db.from('orgs').select('id').eq('id', org.id)
    check('Za. no harness org remains', (leftoverOrgs ?? []).length === 0)
  }

  if (skipped > 0) {
    console.log(`\n${skipped} CHECK(S) COULD NOT RUN — RESULT IS NOT A PASS`)
    process.exit(1)
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
