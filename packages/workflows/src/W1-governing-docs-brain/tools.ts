// W1 — Governing Docs Brain
// Retrieval helpers.
//
// Calls the `search_governing_chunks` RPC (migration 0005a) which routes
// to either pgvector cosine similarity (when an embedding is given AND
// the chunk has one) or Postgres FTS over `chunks.text` (otherwise).
//
// Hybrid behavior is by design: chunks uploaded before the embedding
// pipeline existed still get found via FTS, and a single failure of the
// embedding endpoint just downgrades quality for that one query — never
// returns nothing.

import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import type { PromptChunk } from './prompt'

export interface RetrieveOptions {
  organizationId: string
  associationId?: string | null
  limit?: number
  /**
   * Restrict retrieval to documents a resident may see (F-04). When set,
   * only chunks of a governing_documents row whose `type` is in this list,
   * that is current (superseded_at IS NULL) and not ai_generated, are
   * returned. Default-deny: a row we cannot look up is dropped. Omit for
   * board/admin and server-side callers, which see every document.
   *
   * The service role bypasses the 0063 RLS that enforces the same rule for
   * a resident's own session, so this filter is what keeps minutes and
   * unreviewed AI drafts out of a resident's answer.
   */
  allowedDocTypes?: readonly string[]
}

/** A retrieval DB read failed (as opposed to the model/provider failing). */
export class GoverningDocsRetrievalError extends Error {
  constructor(readonly stage: 'chunks' | 'visibility', readonly code: string | null) {
    super(`governing_docs_retrieval_failed:${stage}`)
    this.name = 'GoverningDocsRetrievalError'
  }
}

export interface DocVisibilityRow {
  id: string
  type: string
  ai_generated: boolean | null
  superseded_at: string | null
}

/** Pure: keep only chunks whose document passes the resident allowlist. */
export function filterVisibleChunks<T extends { documentId: string }>(
  chunks: T[],
  docs: DocVisibilityRow[],
  allowedDocTypes: readonly string[],
): T[] {
  const visible = new Set(
    docs
      .filter(
        (d) =>
          allowedDocTypes.includes(d.type) &&
          d.ai_generated !== true &&
          d.superseded_at === null,
      )
      .map((d) => d.id),
  )
  return chunks.filter((c) => visible.has(c.documentId))
}

/** Over-fetch factor when filtering, so dropped chunks don't starve the answer. */
const FILTERED_FETCH_LIMIT = 50

export interface RetrievedChunk extends PromptChunk {
  score: number
  documentId: string
}

export async function retrieveChunks(
  question: string,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? 8
  const db = createAdminClient()

  // Embed the question. If embedding fails or no API token is configured,
  // we still pass the raw query and the RPC's FTS branch handles it.
  let queryEmbedding: string | null = null
  try {
    if (process.env.HUGGINGFACE_API_TOKEN || process.env.EMBEDDING_BASE_URL) {
      const [vector] = await embedTexts([question])
      if (vector) queryEmbedding = toPgVector(vector)
    }
  } catch (err) {
    // Log; we still attempt FTS retrieval below. Don't let an embedding
    // outage break Q&A entirely.
    console.warn(
      '[W1] embedding failed, falling back to FTS:',
      err instanceof Error ? err.message : err,
    )
  }

  const { data, error } = await db.rpc('search_governing_chunks' as never, {
    p_organization_id: opts.organizationId,
    p_association_id: opts.associationId ?? null,
    p_query: question,
    p_query_embedding: queryEmbedding,
    p_limit: opts.allowedDocTypes ? Math.max(limit, FILTERED_FETCH_LIMIT) : limit,
  } as never)

  if (error) {
    throw new GoverningDocsRetrievalError('chunks', (error as { code?: string }).code ?? null)
  }

  const chunks = ((data ?? []) as RawChunkRow[]).map(rowToChunk)
  if (!opts.allowedDocTypes) return chunks
  if (chunks.length === 0) return []

  const docIds = [...new Set(chunks.map((c) => c.documentId))]
  const { data: docs, error: docsError } = await db
    .from('governing_documents')
    .select('id, type, ai_generated, superseded_at')
    .eq('organization_id', opts.organizationId)
    .in('id', docIds)
  if (docsError) {
    // Fail closed: never fall back to the unfiltered set.
    throw new GoverningDocsRetrievalError('visibility', docsError.code ?? null)
  }
  return filterVisibleChunks(chunks, (docs ?? []) as DocVisibilityRow[], opts.allowedDocTypes).slice(
    0,
    limit,
  )
}

interface RawChunkRow {
  id: string
  document_id: string
  section: string | null
  page_number: number | null
  text: string
  metadata: Record<string, unknown> | null
  doc_type: string | null
  effective_date: string | null
  rank: number
}

function rowToChunk(row: RawChunkRow): RetrievedChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    docType: row.doc_type ?? 'document',
    section: row.section ?? (row.page_number ? `p.${row.page_number}` : null),
    effectiveDate: row.effective_date,
    text: row.text,
    score: row.rank,
  }
}
