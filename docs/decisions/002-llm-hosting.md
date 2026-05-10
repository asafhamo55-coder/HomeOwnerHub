# 002 — LLM hosting strategy

**Date:** 2026-05-09
**Status:** Accepted (interim)
**Context:** Spec §2 requires "100% self-hosted open-source LLM" as
non-negotiable. We need a path that lets v1 workflow development start
immediately without standing up GPU infrastructure on day one.

## Decision

**Two phases:**

### Phase 2.0 — Bridge (months 1–2 of v1 build)

- **Inference provider:** Groq Cloud free tier
- **Models:**
  - Reasoning / drafting: `llama-3.3-70b-versatile`
  - Fast / classification: `llama-3.1-8b-instant`
  - Embeddings: **TBD** — Groq does not host BGE-M3. Options:
    1. HuggingFace Inference API for BGE-M3 (free tier ~30k tokens/mo)
    2. OpenAI-compatible embedding alternative on Groq if/when added
    3. Bridge with `text-embedding-3-small` on a paid OpenAI side-channel ONLY for embeddings during dev (not for inference) — flagged as a temporary deviation, removed at cutover
- **Vision:** Deferred. W3 (Violation Inspector) and W4 (ARC Reviewer)
  built without vision in their first iteration; Madison Park residents
  describe the violation in text, AI drafts the notice from text + W1
  RAG. Vision adds in 2.1.
- **Voice (Whisper, Piper):** Deferred entirely to 2.1.

### Phase 2.1 — Self-hosted cutover (before Madison Park goes live, month 3)

- **GPU host:** Single RunPod A100 80GB — projected $1.40/hr running, $0
  paused. Pause between active sessions during dev; keep on for the
  Madison Park demo and post-launch.
- **Stack:** vLLM serving Llama 3.3 70B Q4 (~40 GB VRAM) + Qwen2-VL 7B
  (~14 GB VRAM) + Whisper large-v3 (~6 GB VRAM) on the same box. Total
  ~60 GB on an 80 GB card.
- **Embeddings:** BGE-M3 self-hosted on the same box (~2 GB VRAM).
- **Cutover plan:**
  1. Stand up the box, point AI_BASE_URL env var at it
  2. Re-run W1 eval suite (must pass at the same threshold)
  3. Re-run W2/W3/W4/W5/W6 eval suites
  4. If parity holds, flip env vars in Vercel; tear down Groq dependency
- **Rollback:** Keep the Groq env vars commented out in `.env.example`
  for one month post-cutover so we can flip back fast if the GPU box
  fails.

### Phase 2.2 — Optional dual-host (post-launch, deferred)

If GPU contention becomes a bottleneck (latency on inference > 3s p95),
split: one box for Llama 70B, one box for Vision + Whisper. Re-evaluate
when traffic justifies it.

## Why this deviates from spec §2

The spec calls self-hosted non-negotiable. Bridging on Groq for the
build phase is a pragmatic stopgap, not a strategy:

- Groq's free tier (14,400 req/day) is enough for solo development and
  the Madison Park beta-test traffic (single HOA, ~50 units, < 100
  AI calls/day projected).
- Self-hosting before W1 even works adds 1–2 weeks of infra work that
  doesn't move workflow development forward.
- The cutover to self-hosted is a single env-var swap once the eval
  suite is in place — it's the eval suite, not the box, that gates
  parity.

The non-negotiable is held: **no v1 launch without self-hosted.** Just
not on day one of the build.

## Cost guardrails during bridge phase

- Groq free tier resets daily; no per-call billing kicks in unless we
  exceed it (we won't during dev).
- HuggingFace embeddings free tier: ~30k tokens/mo. Madison Park's full
  CC&Rs (~80 pages) is roughly one month of free quota. We chunk and
  embed once at upload time, cached forever.
- If HuggingFace caps us, fall back to local sentence-transformers
  running on Asaf's laptop during dev; production-grade embedding still
  comes from BGE-M3 self-hosted at cutover.

## Open follow-ups

- Pick HuggingFace vs OpenAI embedding bridge — defer until W1 starts
  consuming embeddings.
- Decide whether to colocate or use RunPod for Phase 2.1 — wait until we
  see latency numbers from the Groq bridge.
