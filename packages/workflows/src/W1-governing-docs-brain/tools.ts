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
}

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
    p_limit: limit,
  } as never)

  if (error) {
    throw new Error(`governing_chunks_retrieval_failed: ${error.message}`)
  }

  const rows = (data ?? []) as RawChunkRow[]
  return rows.map(rowToChunk)
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
