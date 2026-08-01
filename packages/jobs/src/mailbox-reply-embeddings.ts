import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import { inngest } from './client'
import { logDbError } from './db-error'

/**
 * Embed the HOA's own past replies so W32 can ground a draft in how this
 * association actually writes.
 *
 * Only outbound messages with a usable body are embedded. `MIN_BODY_CHARS`
 * exists because a two-word reply ("Thanks!") teaches nothing about voice
 * and would crowd out substantive examples in a top-k retrieval.
 *
 * Batched, because embedding calls are paid per token and the first run
 * after a 12-month backfill could face thousands of messages.
 */
const BATCH_SIZE = 40
const MIN_BODY_CHARS = 40

function bodyFor(message: { stripped_text: string | null; body_text: string | null }): string {
  return (message.stripped_text ?? message.body_text ?? '').trim()
}

export const mailboxReplyEmbeddingsJob = inngest.createFunction(
  { id: 'mailbox-reply-embeddings', name: 'Mailbox Reply Embeddings' },
  { cron: '*/10 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    // Outbound messages that have no embedding row yet. The NOT EXISTS is
    // expressed as a left-join filter because PostgREST has no NOT EXISTS.
    const { data: candidates, error: candidatesError } = await db
      .from('inbox_messages')
      .select('id, organization_id, stripped_text, body_text, inbox_reply_embeddings(message_id)')
      .eq('direction', 'outbound')
      .is('inbox_reply_embeddings', null)
      .limit(BATCH_SIZE)

    if (candidatesError) {
      // A soft failure here is indistinguishable from "nothing to embed".
      // Throw so the run fails visibly rather than reporting { embedded: 0 }
      // forever while the corpus silently stays empty.
      logDbError('mailboxReplyEmbeddingsJob', 'inbox_messages', {}, candidatesError)
      throw new Error(
        `mailboxReplyEmbeddingsJob: failed to load candidates: ${candidatesError.message}`,
      )
    }

    const usable = (candidates ?? []).filter((m) => bodyFor(m).length >= MIN_BODY_CHARS)
    if (usable.length === 0) return { embedded: 0, skipped: (candidates ?? []).length }

    const texts = usable.map(bodyFor)

    let vectors: number[][]
    try {
      vectors = await embedTexts(texts)
    } catch (error) {
      // Embedding is an external paid API. Let the error fail the run so
      // Inngest retries — silently returning 0 would leave the corpus empty
      // and every draft generically voiced, with nothing to explain why.
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[mailbox-reply-embeddings] embedding call failed: ${message}`)
      throw error
    }

    let embedded = 0
    for (const [i, message] of usable.entries()) {
      const vector = vectors[i]
      if (!vector) continue

      const { error: upsertError } = await db.from('inbox_reply_embeddings').upsert(
        {
          organization_id: message.organization_id,
          message_id: message.id,
          embedding: toPgVector(vector),
          text_sha256: createHash('sha256').update(texts[i]!).digest('hex'),
        },
        { onConflict: 'message_id' },
      )

      if (upsertError) {
        // Record and continue: one bad row must not cost the whole batch its
        // (already paid for) embeddings. The next run retries this message.
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

    logger.info(`[mailbox-reply-embeddings] embedded ${embedded}/${usable.length}`)
    return { embedded, skipped: (candidates ?? []).length - usable.length }
  },
)
