-- 0005b_embedding_dim_swap.sql
-- Swap governing_document_chunks.embedding from vector(1024) to vector(768).
--
-- Why: BAAI/bge-m3 (1024-dim) is not on HuggingFace's free Inference
-- Provider tier (as of 2026-05). The closest model that IS deployed
-- there is BAAI/bge-base-en-v1.5, which produces 768-dim vectors.
-- Per ADR-003 the swap to self-hosted in Phase 2.1 brings BGE-M3 back,
-- at which point this column can grow back to vector(1024).
--
-- Destructive: drops any embeddings already in the column. Since all
-- current rows have NULL embedding (HF endpoint never returned data),
-- this is a no-op for data. Idempotent guards still in place in case
-- it runs twice.
--
-- Index is dimension-tied so it also has to be rebuilt.

DROP INDEX IF EXISTS public.governing_document_chunks_embedding_idx;
ALTER TABLE public.governing_document_chunks
  DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.governing_document_chunks
  ADD COLUMN embedding vector(768);

CREATE INDEX governing_document_chunks_embedding_idx
  ON public.governing_document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- search_governing_chunks signature uses unsized `vector`, so it
-- doesn't need to be redefined.
