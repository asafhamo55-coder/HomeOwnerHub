# W1 — Governing Docs Brain

**Purpose:** Single source of truth for "what do the rules say about X?" Every other workflow that grounds answers in CC&Rs (W2 Concierge, W3 Violation, W4 ARC, W5 Invoice Coding, W13 Work Order Triage) calls into this module.

## Public API

```ts
import { queryGoverningDocs } from '@homeowner-portal/workflows/W1'

const { answer, confidence, citations, runId } = await queryGoverningDocs(
  'Can I paint my front door red?',
  { organizationId: org.id, associationId: association.id },
)
```

`runId` is the `ai_runs` row id — store it on the domain record (e.g. a violation, a chat message) so the customer-facing audit log can link back.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.question | `string` (3–2000 chars) |
| Input.associationId | `uuid \| null` (scopes retrieval to one association) |
| Output.answer | `string` (2–8 sentences with inline citations) |
| Output.confidence | `'HIGH' \| 'MEDIUM' \| 'LOW'` |
| Output.citations | `{ chunkId, documentId, docType, section }[]` |

## Pipeline

1. **Retrieve** — `tools.ts → retrieveChunks()` runs Postgres FTS over `governing_document_chunks.text`, scoped by `organization_id` (RLS) and optionally `association_id`. Returns top 8 by ts_rank.
2. **Ground prompt** — `prompt.ts → userPromptFor()` formats chunks with metadata (doc_type, section, effective_date) for the LLM.
3. **LLM call** — `llama-3.3-70b-versatile` on Groq today (`AI_BASE_URL`); swaps to self-hosted Llama 3.3 70B on RunPod per ADR-002. Temperature 0.1, JSON output mode.
4. **Validate citations** — model-cited chunk ids are intersected with the retrieved set. Hallucinated ids are dropped.
5. **Audit** — `defineWorkflow` writes the run to `ai_runs` with input, output, citations, latency, confidence, prompt version, model.

## Confidence policy

The model rates its own answer HIGH / MEDIUM / LOW per the system prompt. A `LOW` answer with no chunks retrieved returns the placeholder "escalate to the board" message, never invented rules. Apps consuming W1 should suppress autosend at LOW (e.g. W2 Concierge will create a service request instead of auto-replying).

## Open work to hit acceptance

The spec's W1 acceptance is "20 hand-curated Madison Park questions answered with correct CC&R section citations." Ship blockers:

- [ ] Upload Madison Park's Declaration as the first `governing_documents` row (PDF + parsed_text).
- [ ] Chunk the parsed text (~500 tokens with overlap) into `governing_document_chunks`.
- [ ] Backfill embeddings — currently stubbed as `NULL`; flips on when the embedding provider is wired (ADR-002 Phase 2.1).
- [ ] Populate `EVAL_CASES` with the 20 curated questions in `eval.ts` and run the harness against the loaded chunks.
- [ ] Build the upload UI (`apps/hoa/.../documents/upload`) so non-engineers can add documents themselves.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 1.0.0 (prompt 1.0.0) | initial | Postgres FTS retrieval, Llama 3.3 70B (Groq bridge per ADR-002) |
