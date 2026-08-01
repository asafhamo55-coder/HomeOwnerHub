import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'

export interface SimilarReply {
  messageId: string
  threadId: string
  body: string
  subject: string | null
  sentAt: string | null
  similarity: number
}

const DEFAULT_LIMIT = 5

/**
 * Retrieve the HOA's most similar past replies, as voice and precedent
 * examples for W32.
 *
 * Degrades rather than throws. Past replies improve a draft's voice but are
 * not required for correctness — governing documents and property data still
 * ground it. Returning `degraded: ['past_replies']` lets the caller tell the
 * reviewer the draft was written without precedent, which is honest, instead
 * of failing the whole draft over an optional source.
 */
export async function findSimilarReplies(
  db: SupabaseClient<Database>,
  orgId: string,
  queryText: string,
  excludeThreadId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ replies: SimilarReply[]; degraded: string[] }> {
  let embedding: number[] | undefined
  try {
    const [vector] = await embedTexts([queryText])
    embedding = vector
  } catch (error) {
    console.error(
      `findSimilarReplies: embedding failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { replies: [], degraded: ['past_replies'] }
  }

  if (!embedding) return { replies: [], degraded: ['past_replies'] }

  // Cast to `never`: 0034b (this function) is written but not yet applied —
  // see the migration file — so it is absent from the generated Database
  // types. Same pattern as other not-yet-regenerated RPCs in this codebase
  // (see platform-admin.ts). Remove the cast once types are regenerated
  // after the migration is applied.
  const { data, error } = await db.rpc('search_reply_embeddings' as never, {
    p_org_id: orgId,
    p_query_embedding: toPgVector(embedding),
    p_exclude_thread_id: excludeThreadId,
    p_limit: limit,
  } as never)

  if (error) {
    // Never log .details — it can echo row contents, i.e. resident PII.
    console.error(
      `findSimilarReplies: search_reply_embeddings failed: ${error.code} ${error.message}`,
    )
    return { replies: [], degraded: ['past_replies'] }
  }

  const rows = (data ?? []) as Array<{
    message_id: string
    thread_id: string
    body: string | null
    subject: string | null
    sent_at: string | null
    similarity: number
  }>

  return {
    replies: rows
      .filter((r) => (r.body ?? '').trim().length > 0)
      .map((r) => ({
        messageId: r.message_id,
        threadId: r.thread_id,
        body: r.body!,
        subject: r.subject,
        sentAt: r.sent_at,
        similarity: r.similarity,
      })),
    degraded: [],
  }
}
