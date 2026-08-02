/**
 * scripts/backfill-inbox-html-bodies.ts
 *
 * Repairs `inbox_messages` rows that were ingested before the parser knew
 * how to read an HTML-only message.
 *
 * Apple Mail on iOS (and most marketing senders) ship text/html with NO
 * text/plain alternative. The old parser only ever read a text/plain
 * part, so those messages landed with `body_text` and `stripped_text`
 * NULL — which the thread view renders as "(no body)" and the reply
 * drafter reads as an empty string. packages/mailbox/src/parse.ts now
 * derives text from the HTML at ingest time; this script applies the same
 * derivation to the rows already in the table.
 *
 * Idempotent — only touches rows where `body_text IS NULL AND body_html
 * IS NOT NULL`, so re-running is a no-op. Never overwrites a body the
 * sender actually supplied.
 *
 * DRY RUN BY DEFAULT. Run from repo root (`pnpm exec tsx`, not `npx tsx`,
 * so workspace dependencies resolve):
 *
 *   pnpm exec tsx scripts/backfill-inbox-html-bodies.ts            # preview
 *   pnpm exec tsx scripts/backfill-inbox-html-bodies.ts --apply    # write
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { htmlToText } from '../packages/mailbox/src/html'
import { stripQuotedReply } from '../packages/mailbox/src/quote'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 200

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

interface Row {
  id: string
  from_email: string | null
  subject: string | null
  body_html: string | null
}

async function main(): Promise<void> {
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`)

  let scanned = 0
  let updated = 0
  let emptyDerivation = 0
  // Page by id rather than by offset: under --apply each updated row drops
  // out of the `body_text is null` filter, so a fixed offset would skip
  // PAGE_SIZE unprocessed rows on every iteration.
  let afterId = '00000000-0000-0000-0000-000000000000'

  for (;;) {
    const { data, error } = await db
      .from('inbox_messages')
      .select('id, from_email, subject, body_html')
      .is('body_text', null)
      .not('body_html', 'is', null)
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (error) {
      console.error('[backfill] read failed:', error.message)
      process.exit(1)
    }
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) break

    for (const row of rows) {
      scanned++
      afterId = row.id

      const derived = htmlToText(row.body_html ?? '')
      if (derived === '') {
        // An image-only marketing mail genuinely has no text. Leaving it
        // NULL keeps "(no body)" honest instead of writing an empty string
        // that every downstream `?? '(no body)'` fallback would miss.
        emptyDerivation++
        continue
      }
      const stripped = stripQuotedReply(derived)

      if (!APPLY) {
        // Ids and lengths only. The whole point of this script is that
        // these rows contain a resident's message, and this repo's rule is
        // that an address, subject or body never reaches a log — a dry run
        // is exactly when someone pipes output to a file and forgets it.
        // Length is enough to confirm the conversion produced something.
        console.log(
          `[dry-run] ${row.id} would gain ${derived.length} chars of body` +
            `${stripped ? ` (${stripped.length} after quote-stripping)` : ''}`,
        )
        updated++
        continue
      }

      const { error: writeError } = await db
        .from('inbox_messages')
        .update({ body_text: derived, stripped_text: stripped })
        .eq('id', row.id)

      if (writeError) {
        // One bad row must not abandon the other 72. Report and continue;
        // the run is idempotent, so a re-run retries whatever failed.
        console.error(`[backfill] update failed for ${row.id}:`, writeError.message)
        continue
      }
      updated++
    }
  }

  console.log(
    `[backfill] scanned ${scanned} · ${APPLY ? 'updated' : 'would update'} ${updated} · ` +
      `left NULL (no text in HTML) ${emptyDerivation}`,
  )
  if (!APPLY && updated > 0) {
    console.log('[backfill] re-run with --apply to write these changes')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
