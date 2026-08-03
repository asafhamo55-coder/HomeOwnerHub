import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { EmbeddingError, embedTexts, toPgVector } from '@homeowner-portal/ai'
import { inngest } from './client'
import { logDbError } from './db-error'

type Db = ReturnType<typeof createAdminClient>

/**
 * Structural subset of Inngest's logger. Factored out (same pattern as
 * `MailboxSendLogger` in mailbox-send.ts) so the core logic below can be
 * driven from a test without a real Inngest execution context.
 */
export interface MailboxReplyEmbeddingsLogger {
  info(message: string): void
  error(message: string): void
}

export type MailboxReplyEmbeddingsResult = { embedded: number; skipped: number }

/**
 * Embed the HOA's own past replies so W32 can ground a draft in how this
 * association actually writes.
 *
 * Only outbound messages with a usable body are embedded. `MIN_BODY_CHARS`
 * exists because a two-word reply ("Thanks!") teaches nothing about voice
 * and would crowd out substantive examples in a top-k retrieval. A message
 * below that threshold still gets a marker row written (embedding NULL,
 * `skip_reason` set — see migration 0034c) so it stops being reselected as
 * a candidate. Without that marker, short replies would starve the batch
 * forever: the candidate query has no ordering/cursor, so enough short
 * outbound messages fill every run's LIMIT and the substantive replies
 * behind them never get embedded — the corpus staying silently empty.
 *
 * Batched, because embedding calls are paid per token and the first run
 * after a 12-month backfill could face thousands of messages. Payment
 * (embedTexts) and persistence (the upsert) happen per job-controlled
 * chunk, immediately adjacent to each other — see EMBED_CHUNK_SIZE — so a
 * failure partway through a run costs at most the chunk in flight, and
 * every already-persisted chunk stays durable across an Inngest retry of
 * the whole function.
 */
const CANDIDATE_LIMIT = 40
const MIN_BODY_CHARS = 40

// Chunk size for BOTH the embedTexts() call and the upsert that follows
// it. Deliberately equal to DEFAULT_BATCH_SIZE in
// packages/ai/src/embeddings.ts (32), and passed through explicitly as
// `batchSize` below — never left implicit. That makes a chunk here map
// to exactly one HTTP call to the provider, one-to-one, which is what
// makes the atomicity fix exact: one paid call, one persisted upsert
// batch, always in that order, never split. This is also the bug this
// job originally had: BATCH_SIZE (40, how many candidates to fetch) was
// used as if it were also the embedding-call chunk size, but embedTexts
// silently re-chunks internally at 32 — so a 40-row batch always became
// 2 HTTP calls with only the 2nd call's failure visible to this job,
// and the 1st call's already-billed vectors were discarded on retry.
// Passing batchSize explicitly here means a future change to
// DEFAULT_BATCH_SIZE can't reintroduce that silently: embedTexts will
// still do exactly what THIS constant asks for, one call per chunk.
const EMBED_CHUNK_SIZE = 32

function bodyFor(message: { stripped_text: string | null; body_text: string | null }): string {
  return (message.stripped_text ?? message.body_text ?? '').trim()
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Core logic, factored out from the Inngest handler (same reasoning as
 * `runMailboxSend` in mailbox-send.ts) so it can be exercised in tests with
 * a fake `db`/`logger` instead of a real Inngest execution context.
 */
export async function runMailboxReplyEmbeddings(
  db: Db,
  logger: MailboxReplyEmbeddingsLogger,
): Promise<MailboxReplyEmbeddingsResult> {
  // Outbound messages that have no row in inbox_reply_embeddings yet
  // (embedded OR skip marker — either stops it being a candidate). The
  // NOT EXISTS is expressed as a left-join filter because PostgREST has
  // no NOT EXISTS.
  const { data: candidates, error: candidatesError } = await db
    .from('inbox_messages')
    .select('id, organization_id, stripped_text, body_text, inbox_reply_embeddings(message_id)')
    .eq('direction', 'outbound')
    .is('inbox_reply_embeddings', null)
    .limit(CANDIDATE_LIMIT)

  if (candidatesError) {
    // A soft failure here is indistinguishable from "nothing to embed".
    // Throw so the run fails visibly rather than reporting { embedded: 0 }
    // forever while the corpus silently stays empty.
    logDbError('mailboxReplyEmbeddingsJob', 'inbox_messages', {}, candidatesError)
    throw new Error(
      `mailboxReplyEmbeddingsJob: failed to load candidates: ${candidatesError.message}`,
    )
  }

  if (!candidates || candidates.length === 0) return { embedded: 0, skipped: 0 }

  const usable = candidates.filter((m) => bodyFor(m).length >= MIN_BODY_CHARS)
  const tooShort = candidates.filter((m) => bodyFor(m).length < MIN_BODY_CHARS)

  // Skip markers cost nothing to write (no embedding call involved), so
  // this doesn't need to sit next to a paid call the way Fix 1's chunk
  // loop does. Writing them before the paid work below means a short
  // batch that's *all* short messages still makes progress (stops
  // reselecting them) even if the run then has nothing left to embed.
  let skipped = 0
  for (const message of tooShort) {
    const text = bodyFor(message)
    const { error: markerError } = await db.from('inbox_reply_embeddings').upsert(
      {
        organization_id: message.organization_id,
        message_id: message.id,
        embedding: null,
        text_sha256: createHash('sha256').update(text).digest('hex'),
        skip_reason: 'body_too_short',
      },
      { onConflict: 'message_id' },
    )

    if (markerError) {
      // Record and continue: one bad marker write must not stop the
      // rest of this run. A message whose marker failed to write
      // simply stays a candidate and is retried next run.
      logDbError(
        'mailboxReplyEmbeddingsJob',
        'inbox_reply_embeddings',
        { messageId: message.id, kind: 'skip_marker' },
        markerError,
      )
      continue
    }
    skipped++
  }

  if (usable.length === 0) return { embedded: 0, skipped }

  let embedded = 0
  for (const batch of chunk(usable, EMBED_CHUNK_SIZE)) {
    const texts = batch.map(bodyFor)

    let vectors: number[][]
    try {
      // batchSize is passed explicitly and equals this chunk's size
      // (<= EMBED_CHUNK_SIZE), so embedTexts makes exactly one HTTP
      // call for this chunk. See the EMBED_CHUNK_SIZE comment above.
      vectors = await embedTexts(texts, { batchSize: EMBED_CHUNK_SIZE })
    } catch (error) {
      // Embedding is an external paid API. Let the error fail the run
      // so Inngest retries — silently returning 0 would leave the
      // corpus empty and every draft generically voiced, with nothing
      // to explain why.
      //
      // Do NOT log or rethrow `error.message` verbatim. embedBatch (in
      // packages/ai/src/embeddings.ts) builds its thrown message from
      // up to 200 chars of the raw HTTP response body, and inference
      // APIs commonly echo a fragment of the offending input back in
      // validation errors — here, that input is a resident's reply
      // text. That message would land in this job's logs AND in
      // Inngest's dashboard (which captures whatever this function
      // throws), leaking PII through both. This is the highest-PII-risk
      // file in Phase B, so log only the error's class/name and
      // shape-safe counts, and throw a fresh error whose own message is
      // already known to be safe to display. This still fails the run
      // and Inngest still retries — the failure is not swallowed, only
      // its message is sanitized.
      //
      // The HTTP status IS included below, deliberately — it is a small
      // integer from a fixed, well-known set (401/403/404/429/503/...)
      // and cannot carry resident correspondence the way the message
      // string can. Do not strip it thinking it's part of the leak risk:
      // it's what makes this failure diagnosable at all (auth vs. a
      // retired model vs. rate limiting vs. transport failure) without
      // ever touching `error.message` or the provider's response body.
      const name = error instanceof Error ? error.name : typeof error
      const status = error instanceof EmbeddingError ? error.status : undefined
      const statusLabel = status !== undefined ? `status=${status}` : 'status=none(network?)'
      logger.error(
        `[mailbox-reply-embeddings] embedding call failed: ${name} ${statusLabel} (chunk of ${batch.length})`,
      )
      throw new Error(
        `mailboxReplyEmbeddingsJob: embedding call failed (${name} ${statusLabel}) for a chunk of ${batch.length} messages`,
      )
    }

    // Persist this chunk immediately, before the next chunk's paid
    // embedTexts call runs (Fix 1). If a later chunk throws, this
    // chunk's vectors are already durable — retry only re-pays for
    // chunks that never made it this far.
    //
    // embedTexts guarantees one vector per input, in the same order,
    // or throws — vectors[i] is never undefined here.
    for (const [i, message] of batch.entries()) {
      const { error: upsertError } = await db.from('inbox_reply_embeddings').upsert(
        {
          organization_id: message.organization_id,
          message_id: message.id,
          embedding: toPgVector(vectors[i]!),
          // Written, never read: candidate selection is NOT EXISTS
          // against this table, so once this row exists the message
          // is never reselected regardless of whether the hash
          // matches anything, and outbound email bodies are immutable
          // once sent — there is no re-sync path that would produce
          // different text for the same message_id to diff against.
          // Kept as a content fingerprint for manual debugging only;
          // not an active guard against re-paying, and no refresh
          // path is built on it because nothing consumes it.
          text_sha256: createHash('sha256').update(texts[i]!).digest('hex'),
        },
        { onConflict: 'message_id' },
      )

      if (upsertError) {
        // Record and continue: one bad row must not cost the whole
        // chunk its (already paid for) embeddings. The next run
        // retries this message.
        logDbError(
          'mailboxReplyEmbeddingsJob',
          'inbox_reply_embeddings',
          { messageId: message.id },
          upsertError,
        )
        continue
      }
      embedded++
    }
  }

  logger.info(`[mailbox-reply-embeddings] embedded ${embedded}/${usable.length}`)
  return { embedded, skipped }
}

export const mailboxReplyEmbeddingsJob = inngest.createFunction(
  { id: 'mailbox-reply-embeddings', name: 'Mailbox Reply Embeddings' },
  { cron: '*/10 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    return runMailboxReplyEmbeddings(db, logger)
  },
)
