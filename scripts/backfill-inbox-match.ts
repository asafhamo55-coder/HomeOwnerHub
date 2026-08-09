/**
 * scripts/backfill-inbox-match.ts
 *
 * Re-runs the inbox matcher over threads that were never attributed to a
 * unit.
 *
 * WHY THIS EXISTS. `matchThread` only runs at ingest. Any thread that
 * arrived before its sender was on file — before the owner's email was
 * filled in, before the resident record existed — was filed as
 * `match_confidence = 'none'` and stayed that way forever, because nothing
 * re-evaluates a thread once it has landed. On Madison Park that left 12
 * threads unmatched whose sender IS in `hoa_properties.owner_email` or
 * `property_residents.email` today.
 *
 * The matcher itself is not suspected: `matchThread` trims and lowercases
 * the sender address and compares with `ilike`, so case and whitespace are
 * already handled. This script exists to give those threads a second look
 * now that the roster has caught up, not to work around a matcher bug.
 *
 * SAFETY
 *
 *   - Dry run by default. Pass --apply to write.
 *   - Only writes when the outcome is HIGH confidence. Medium/low/none are
 *     counted and skipped: a medium match is by definition ambiguous, and
 *     guessing would attach a neighbour's mail to the wrong household.
 *   - Only touches threads where `unit_id IS NULL`. An existing match is
 *     never overwritten, so a human's manual re-file always wins.
 *   - Scoped to one org per invocation. Required, not optional — there is
 *     no "all orgs" mode by design.
 *
 * OUTPUT contains ids and counts only. Never an email address, sender
 * name, or subject: this walks resident correspondence, and a backfill log
 * is exactly the kind of place PII quietly accumulates.
 *
 * RUN IT UNTIL IT REPORTS high = 0.
 *
 * Matches cascade. `matchThread` also resolves a thread through its
 * `in_reply_to` / `references_ids` chain, so attributing one thread can
 * make a reply to it newly matchable on the next pass. The first run on
 * Madison Park wrote 5; a second pass then found a 6th that only became
 * reachable once its parent had a unit; the third found none. A single
 * invocation silently leaves those on the table.
 *
 * Usage:
 *   rtk proxy pnpm tsx scripts/backfill-inbox-match.ts --org <uuid>
 *   rtk proxy pnpm tsx scripts/backfill-inbox-match.ts --org <uuid> --apply
 */
import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { applyMatch, matchThread } from '../apps/hoa/src/lib/inbox/match'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const ORG_ID = arg('org')
const APPLY = process.argv.includes('--apply')

async function main(): Promise<void> {
  if (!ORG_ID) {
    console.error('Missing --org <uuid>. Refusing to run across every org.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  // Service role: the matcher reads property_residents and hoa_properties
  // across the org, which no single user's RLS context can see in full.
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await db
    .from('inbox_threads')
    .select('id')
    .eq('organization_id', ORG_ID)
    .is('unit_id', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error(`Could not list threads: ${error.message}`)
    process.exit(1)
  }

  const threads = (data ?? []) as Array<{ id: string }>
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} — org ${ORG_ID}: ${threads.length} unmatched threads`,
  )

  const tally = { high: 0, medium: 0, low: 0, none: 0, failed: 0, written: 0 }

  for (const t of threads) {
    let outcome
    try {
      outcome = await matchThread(db as unknown as Parameters<typeof matchThread>[0], ORG_ID, t.id)
    } catch (err) {
      // matchThread throws on a DB failure rather than returning "no
      // match" — that distinction is deliberate upstream and must not be
      // flattened here into a silent skip.
      tally.failed++
      console.error(`  thread ${t.id}: match failed — ${err instanceof Error ? err.message : 'unknown'}`)
      continue
    }

    tally[outcome.confidence]++

    if (outcome.confidence !== 'high' || !outcome.unitId) continue

    console.log(`  thread ${t.id} -> unit ${outcome.unitId} (rule ${outcome.rule})`)

    if (APPLY) {
      try {
        await applyMatch(db as unknown as Parameters<typeof applyMatch>[0], ORG_ID, t.id, outcome)
        tally.written++
      } catch (err) {
        tally.failed++
        console.error(`  thread ${t.id}: write failed — ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }
  }

  console.log('')
  console.log(`high     ${tally.high}${APPLY ? '' : '  <- would be written'}`)
  console.log(`medium   ${tally.medium}  (ambiguous, skipped)`)
  console.log(`low      ${tally.low}  (skipped)`)
  console.log(`none     ${tally.none}  (sender not on file)`)
  console.log(`failed   ${tally.failed}`)
  if (APPLY) console.log(`written  ${tally.written}`)
  if (!APPLY && tally.high > 0) {
    console.log('')
    console.log('Re-run with --apply to write these.')
  }

  process.exit(tally.failed > 0 ? 1 : 0)
}

void main()
