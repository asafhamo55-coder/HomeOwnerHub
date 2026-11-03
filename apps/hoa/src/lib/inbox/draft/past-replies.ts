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

/** The search function caps its own page at this many rows. */
const SEARCH_PAGE = 20

/**
 * Examples below this cosine similarity are not close enough to teach voice
 * and are more likely to carry unrelated specifics, so they are dropped.
 */
export const MIN_REPLY_SIMILARITY = 0.5

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
  associationId: string | null,
  queryText: string,
  excludeThreadId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ replies: SimilarReply[]; degraded: string[] }> {
  // No association means no safe corpus: never fall back to the whole org.
  if (!associationId) return { replies: [], degraded: ['past_replies'] }

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

  const { data, error } = await db.rpc('search_reply_embeddings', {
    p_org_id: orgId,
    p_query_embedding: toPgVector(embedding),
    p_exclude_thread_id: excludeThreadId,
    // Fetch a full page: rows from other associations are discarded below,
    // so the requested number must survive that filter.
    p_limit: SEARCH_PAGE,
  })

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

  const close = rows.filter(
    (r) => (r.body ?? '').trim().length > 0 && r.similarity >= MIN_REPLY_SIMILARITY,
  )
  if (close.length === 0) return { replies: [], degraded: [] }

  // The search function filters by organization only, so the association
  // boundary is applied here: keep a reply only when its thread belongs to a
  // unit of this association. Threads with no unit are dropped.
  const inAssociation = await threadsInAssociation(
    db,
    orgId,
    associationId,
    close.map((r) => r.thread_id),
  )
  if (!inAssociation) return { replies: [], degraded: ['past_replies'] }

  return {
    replies: close
      .filter((r) => inAssociation.has(r.thread_id))
      .slice(0, Math.max(limit, 1))
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

/** Thread ids (of those given) whose unit belongs to the association; null on a failed read. */
async function threadsInAssociation(
  db: SupabaseClient<Database>,
  orgId: string,
  associationId: string,
  threadIds: string[],
): Promise<Set<string> | null> {
  const ids = [...new Set(threadIds)]
  const threads = await db
    .from('inbox_threads')
    .select('id, unit_id')
    .eq('organization_id', orgId)
    .in('id', ids)
  if (threads.error) {
    console.error(`findSimilarReplies: thread lookup failed: ${threads.error.code}`)
    return null
  }
  const unitIds = [
    ...new Set((threads.data ?? []).map((t) => t.unit_id).filter((u): u is string => !!u)),
  ]
  if (unitIds.length === 0) return new Set()

  const units = await db
    .from('units')
    .select('id')
    .eq('organization_id', orgId)
    .eq('association_id', associationId)
    .in('id', unitIds)
  if (units.error) {
    console.error(`findSimilarReplies: unit lookup failed: ${units.error.code}`)
    return null
  }
  const ok = new Set((units.data ?? []).map((u) => u.id))
  return new Set(
    (threads.data ?? []).filter((t) => t.unit_id && ok.has(t.unit_id)).map((t) => t.id),
  )
}
