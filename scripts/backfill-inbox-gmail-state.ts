/**
 * scripts/backfill-inbox-gmail-state.ts
 *
 * Stamps Gmail filing state onto mail that was ingested before the
 * mailbox integration could observe it (migration 0043).
 *
 * The integration used to be append-only: sync captured a message once
 * and nothing ever reconciled it, so archiving a thread, filing it into a
 * folder, or trashing it in Gmail was invisible to HomeownerHub. Every
 * row ingested before the fix therefore sits at gmail_state='unknown',
 * which every read path treats as VISIBLE — deliberately, since hiding
 * mail whose state has never been observed would invent a cleanup the
 * board never performed. This script turns those unknowns into real
 * observations.
 *
 * `mailboxReconcileJob` does the same work on a 15-minute cron, and this
 * script calls the IDENTICAL function it does
 * (`reconcileAccountGmailState` in packages/jobs/src/mailbox-reconcile.ts)
 * rather than reimplementing the rule. The point of running it by hand is
 * immediacy and the dry run: see exactly what would change, on one named
 * mailbox, before it changes.
 *
 * Note it is a full reconcile, not an unknown-only pass — it will also
 * correct any row whose stored state has drifted from Gmail.
 *
 * DRY RUN BY DEFAULT. Run from repo root (`pnpm exec tsx`, not `npx tsx`,
 * so workspace dependencies resolve):
 *
 *   pnpm exec tsx scripts/backfill-inbox-gmail-state.ts                     # preview, all mailboxes
 *   pnpm exec tsx scripts/backfill-inbox-gmail-state.ts --org <uuid>        # preview, one org
 *   pnpm exec tsx scripts/backfill-inbox-gmail-state.ts --apply             # write
 *
 * Output is ids and counts only — never an address, subject, or body.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { GmailClient } from '@homeowner-portal/mailbox'
import { reconcileAccountGmailState } from '../packages/jobs/src/mailbox-reconcile'
import { getAccessTokenFor } from '../packages/jobs/src/mailbox-tokens'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const orgFlagIndex = process.argv.indexOf('--org')
const ORG_ID = orgFlagIndex !== -1 ? process.argv[orgFlagIndex + 1] : null

if (orgFlagIndex !== -1 && !ORG_ID) {
  console.error('[backfill] --org requires an organization id')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main(): Promise<void> {
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`)
  if (ORG_ID) console.log(`[backfill] scoped to organization ${ORG_ID}`)

  let query = db
    .from('mailbox_accounts')
    .select('id, organization_id, scope_mode, scope_value')
    .is('disconnected_at', null)

  if (ORG_ID) query = query.eq('organization_id', ORG_ID)

  const { data: accounts, error } = await query

  if (error) {
    console.error('[backfill] failed to load mailbox_accounts:', error.message)
    process.exit(1)
  }
  if (!accounts || accounts.length === 0) {
    console.log('[backfill] no connected mailboxes matched')
    return
  }

  let failures = 0

  for (const account of accounts) {
    // Account id only — the email address is the mailbox owner's and has
    // no place in script output.
    console.log(`[backfill] mailbox ${account.id} (org ${account.organization_id})`)

    try {
      const client = new GmailClient(await getAccessTokenFor(db as never, account.id))

      const summary = await reconcileAccountGmailState(
        db as never,
        client,
        {
          id: account.id,
          scopeMode: account.scope_mode as 'address' | 'label' | 'all',
          scopeValue: account.scope_value,
        },
        { dryRun: !APPLY },
      )

      if (!summary.applied && summary.skipReason !== 'dry run') {
        // The fail-safe fired: Gmail returned more than one pass can read,
        // so "archived" could not be derived from absence. Report it as a
        // refusal, never as a clean run that happened to change nothing.
        failures++
        console.error(`[backfill]   SKIPPED — ${summary.skipReason}`)
        continue
      }

      console.log(
        `[backfill]   scanned ${summary.messagesScanned} inbound message(s) · ` +
          `${APPLY ? 'restated' : 'would restate'} ${summary.messagesChanged} · ` +
          `thread(s) ${APPLY ? 'changed' : 'that would change'}: ${summary.threadsChanged}`,
      )
      console.log(
        `[backfill]   resulting thread states — active ${summary.threadStateCounts.active}, ` +
          `archived ${summary.threadStateCounts.archived}, ` +
          `trashed ${summary.threadStateCounts.trashed} · ` +
          `${summary.pagesFetched} Gmail page(s) read`,
      )
    } catch (accountError) {
      // One bad mailbox must not abandon the rest; the script is
      // idempotent, so re-running retries whatever failed.
      failures++
      console.error(
        `[backfill]   FAILED:`,
        accountError instanceof Error ? accountError.message : String(accountError),
      )
    }
  }

  if (!APPLY) console.log('[backfill] re-run with --apply to write these changes')
  if (failures > 0) {
    console.error(`[backfill] ${failures} mailbox(es) did not complete`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
