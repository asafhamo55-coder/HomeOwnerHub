# 003 — Embedding hosting (Phase 2 bridge)

**Date:** 2026-05-09
**Status:** Accepted (interim)
**Context:** ADR-002 deferred picking an embedding provider until W1 needed
one. W1 is now consuming chunks, and Postgres FTS is OK on exact-keyword
queries but weak on semantic ones (e.g. "guest cars" doesn't match
"non-resident vehicles" without a synonym list). Time to wire embeddings.

## Decision

**Phase 2.0 bridge:** HuggingFace Inference API for `BAAI/bge-m3`.

- Endpoint: `https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3`
- Auth: bearer token (`HUGGINGFACE_API_TOKEN`)
- Free tier limits: ~30k tokens/min, 1000 requests/min
- Output: 1024-dim vectors — matches the `vector(1024)` column we created
  in migration 0004
- Cost during dev: $0 (inside free tier)

**Phase 2.1 cutover:** BGE-M3 self-hosted on the same RunPod box as Llama
3.3 70B. ~2 GB VRAM for BGE-M3 — trivial alongside the LLM. Same env-var
swap pattern as ADR-002: change `EMBEDDING_BASE_URL` and `EMBEDDING_API_KEY`,
no app code changes.

## Why HuggingFace specifically (Phase 2.0)

| Option | Per-call cost | BGE-M3 available | Notes |
|---|---|---|---|
| HuggingFace Inference (free tier) | $0 within quota | Yes | Quota fits Madison Park's CC&R load (~12 k tokens) easily |
| OpenAI text-embedding-3-small | $0.02/M tokens | No (proprietary) | Cheap but contradicts the "open-source models only" requirement |
| Cohere | per-call | No | Same |
| Self-hosted now | $1.40/hr running | Yes | Best long-term, defers spec-aligned launch but costs day-one infra time |
| Local sentence-transformers (Asaf laptop) | $0 | Yes | Workable for dev but not production-reachable |

HuggingFace wins on "open-source model + free during dev + small change to
swap out at cutover."

## Hybrid retrieval shape

The W1 retrieval query supports both modes simultaneously via the
`search_governing_chunks` RPC (migration 0005a):

- If a query embedding is provided AND chunks have embeddings → pgvector
  cosine similarity (`<=>` operator). Results ranked by `1 - distance`.
- Otherwise → Postgres FTS using `to_tsvector('english', text) @@
  plainto_tsquery('english', query)`. Ranked by `ts_rank`.

This means the system degrades gracefully when:
- HuggingFace is rate-limited / down (we skip embedding the query, fall
  back to FTS for that one call)
- A document was uploaded before the embedding pipeline existed (the
  backfill script `scripts/backfill-embeddings.ts` fills these in;
  meanwhile FTS handles them)

## Cost guardrails

- One Madison Park CC&R upload (~50 chunks, ~12k tokens) ≈ 0.04% of free
  tier daily quota. Even with all 17 workflows hitting embeddings on every
  query, free tier covers Madison Park alone.
- If a CAM customer with 30 associations onboards, we'll likely cross
  quota inside a week. Cutover to self-hosted (Phase 2.1) is the answer.
  A paid HuggingFace tier ($9/mo for 1M tokens/day) is a stopgap if the
  CAM lands before the GPU box is up.

## What this commits the project to

- New env var `HUGGINGFACE_API_TOKEN` in all 3 Vercel projects + the
  seed/backfill scripts.
- New env vars `EMBEDDING_BASE_URL` (default to HF) and `EMBEDDING_MODEL`
  (default to `BAAI/bge-m3`) so the Phase 2.1 swap is a config change.
- Migration 0005a adding the `search_governing_chunks` RPC.
- The `governing_document_chunks.embedding` column populated for every
  new chunk going forward; backfill script for any existing.

## Open follow-ups

- Decide on HuggingFace Pro ($9/mo) as a contingency before first CAM
  onboards if Phase 2.1 cutover slips.
- Add embedding cache keyed on text-hash so re-uploading the same
  document doesn't re-embed.
