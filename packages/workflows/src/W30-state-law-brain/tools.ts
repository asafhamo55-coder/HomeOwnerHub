// W30 — State Law Brain retrieval helpers.
//
// Mirror of W1's retrieveChunks (packages/workflows/src/W1-governing-docs-brain/tools.ts),
// pointing at search_state_statute_chunks (migration 0010) instead of
// search_governing_chunks. Hybrid behavior: pgvector cosine when an
// embedding is available, FTS over content otherwise.

import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import type { PromptChunk } from './prompt'

export interface RetrieveStatuteOptions {
  state: string
  limit?: number
}

export interface RetrievedStatuteChunk extends PromptChunk {
  score: number
  statuteId: string
}

export async function retrieveStatuteChunks(
  question: string,
  opts: RetrieveStatuteOptions,
): Promise<RetrievedStatuteChunk[]> {
  const limit = opts.limit ?? 8
  const db = createAdminClient()

  let queryEmbedding: string | null = null
  try {
    if (process.env.HUGGINGFACE_API_TOKEN || process.env.EMBEDDING_BASE_URL) {
      const [vector] = await embedTexts([question])
      if (vector) queryEmbedding = toPgVector(vector)
    }
  } catch (err) {
    console.warn(
      '[W30] embedding failed, falling back to FTS:',
      err instanceof Error ? err.message : err,
    )
  }

  const { data, error } = await db.rpc('search_state_statute_chunks' as never, {
    p_state: opts.state,
    p_query: question,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
  } as never)

  if (error) {
    throw new Error(`statute_chunks_retrieval_failed: ${error.message}`)
  }

  const rows = (data ?? []) as RawStatuteChunkRow[]
  return rows.map(rowToChunk)
}

interface RawStatuteChunkRow {
  id: string
  statute_id: string
  code_citation: string
  title: string
  category: string | null
  effective_date: string | null
  content: string
  metadata: Record<string, unknown> | null
  rank: number
}

function rowToChunk(row: RawStatuteChunkRow): RetrievedStatuteChunk {
  return {
    id: row.id,
    statuteId: row.statute_id,
    codeCitation: row.code_citation,
    title: row.title,
    category: row.category,
    effectiveDate: row.effective_date,
    content: row.content,
    score: row.rank,
  }
}
