// W1 — Governing Docs Brain
// Retrieval helpers. v1 uses Postgres full-text search over
// `governing_document_chunks.text`. The pgvector cosine-similarity path
// lights up when an embedding provider is configured (see ADR-002).

import { createAdminClient } from '@homeowner-portal/db'
import type { PromptChunk } from './prompt'

export interface RetrieveOptions {
  organizationId: string
  associationId?: string | null
  /** Max chunks to return. Default tuned for Llama 3.3 70B context budget. */
  limit?: number
}

export interface RetrievedChunk extends PromptChunk {
  score: number
  documentId: string
}

/**
 * Postgres full-text retrieval over governing_document_chunks.
 *
 * v1 (today): tsvector search with `plainto_tsquery` so the question text
 * doesn't need cleaning. Uses RLS-bypassing admin client because workflow
 * runs are server-side and the caller has already authorized the query.
 *
 * v1.1 (when embedding provider lands per ADR-002): pgvector cosine
 * similarity; this function will route to whichever index has rows.
 */
export async function retrieveChunks(
  question: string,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? 8
  const db = createAdminClient()

  // ts_rank scoring; we don't expose the raw score to the LLM (the prompt
  // is grounded enough), but we use it for ordering + an internal
  // confidence floor.
  const { data, error } = await db.rpc('search_governing_chunks' as never, {
    p_organization_id: opts.organizationId,
    p_association_id: opts.associationId ?? null,
    p_query: question,
    p_limit: limit,
  } as never)

  if (error) {
    // The RPC may not exist yet pre-migration. Fall back to a direct
    // tsquery so dev / test still works; real production uses the RPC
    // because it lets us tune the ranking without redeploying app code.
    return retrieveChunksDirect(question, opts, limit)
  }

  return (data as RawChunkRow[]).map(rowToChunk)
}

async function retrieveChunksDirect(
  question: string,
  opts: RetrieveOptions,
  limit: number,
): Promise<RetrievedChunk[]> {
  const db = createAdminClient()
  let query = db
    .from('governing_document_chunks' as never)
    .select(
      'id, document_id, section, page_number, text, metadata, governing_documents!inner(type, effective_date)' as never,
    )
    .eq('organization_id' as never, opts.organizationId)
    .textSearch('text' as never, question, {
      type: 'plain',
      config: 'english',
    })
    .limit(limit)

  if (opts.associationId) {
    query = query.eq('association_id' as never, opts.associationId)
  }

  const { data, error } = (await query) as unknown as {
    data: RawChunkRow[] | null
    error: { message: string } | null
  }

  if (error || !data) {
    throw new Error(
      `governing_chunks_retrieval_failed: ${error?.message ?? 'no rows'}`,
    )
  }
  return data.map(rowToChunk)
}

interface RawChunkRow {
  id: string
  document_id: string
  section: string | null
  page_number: number | null
  text: string
  metadata: Record<string, unknown> | null
  governing_documents?: {
    type: string
    effective_date: string | null
  } | null
  rank?: number
}

function rowToChunk(row: RawChunkRow): RetrievedChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    docType: row.governing_documents?.type ?? 'document',
    section: row.section ?? (row.page_number ? `p.${row.page_number}` : null),
    effectiveDate: row.governing_documents?.effective_date ?? null,
    text: row.text,
    score: row.rank ?? 0,
  }
}
