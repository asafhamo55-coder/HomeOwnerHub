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

## The gate workflow (spec §21)

W1 is the v1 gate: **≥ 90% pass rate on ≥ 20 hand-curated questions** before
any downstream workflow (W2/W3/W4/W11/W12/W13) ships against real customers.
The runner is `scripts/eval-w1.ts` (pnpm script `pnpm eval:w1`).

### One-time setup per Supabase project

```bash
# 1. Apply migrations (see docs/APPLY_v1.1_MIGRATIONS.md if 0006/0007 are pending).

# 2. Upload Madison Park's Declaration via the HOA app's upload UI:
#    apps/hoa /documents/governing → upload PDF.
#    The upload route parses the PDF, splits via packages/workflows/src/.../chunker.ts,
#    and writes governing_documents + governing_document_chunks (NULL embeddings).
#
#    For local iteration without the UI you can use the seed script:
#      pnpm exec tsx scripts/seed-sample-ccr.ts

# 3. Backfill embeddings (HuggingFace BGE per ADR-003):
HUGGINGFACE_API_TOKEN=hf_... \
NEXT_PUBLIC_SUPABASE_URL=https://... \
SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm backfill:embeddings
```

### Running the gate

```bash
AI_BASE_URL=https://api.groq.com/openai/v1 \
AI_API_KEY=gsk_... \
AI_MODEL=llama-3.3-70b-versatile \
NEXT_PUBLIC_SUPABASE_URL=https://... \
SUPABASE_SERVICE_ROLE_KEY=... \
HUGGINGFACE_API_TOKEN=hf_... \
EVAL_REQUIRE_GATE=1 \
  pnpm eval:w1
```

`EVAL_REQUIRE_GATE=1` makes the runner exit 1 unless ≥ 20 cases ran AND pass
rate ≥ 90%. Drop the flag for a smoke run that always exits 0 (useful while
iterating on prompt versions).

Other env knobs:

- `EVAL_ORG_NAME` — pick a specific HOA org (defaults to first HOA org)
- `EVAL_VERBOSE=1` — print full answer + citations for every case (default: only failures)

### Adding a case

Edit `eval.ts` and append to `EVAL_CASES`:

```ts
{
  id: 'paint-color-front-door',                  // stable id; never reuse
  question: 'Can I paint my front door red without ARC approval?',
  expectedAnswerContains: ['approved', 'palette'], // case-insensitive
  expectedAnswerExcludes: ['yes, any color'],     // catch over-permissive answers
  expectedCitationDocTypes: ['declaration'],      // OR-match
  expectedCitationSections: ['4.2', 'Section 4.2'],// OR-match (substring); optional
  expectedMinConfidence: 'MEDIUM',
}
```

Use `expectsEscalation: true` for out-of-document questions where W1 should
return LOW confidence with no citations — proves the model doesn't hallucinate.

### What the runner reports

- **Pass rate** — fraction of cases where every assertion held
- **Citation accuracy** — fraction of cases where at least one returned citation matched the expected doc_type
- **Confidence accuracy** — fraction of cases where W1's confidence ≥ the case's floor
- Per-failure detail: question, what W1 answered, the citations it returned, every assertion that failed

### Open work to hit the gate

- [ ] Upload Madison Park's Declaration via the HOA app upload UI.
- [ ] Confirm chunking looks reasonable (run `pnpm seed:sample-ccr` against
      a non-prod org first, eyeball the resulting chunks in the database).
- [ ] Run `pnpm backfill:embeddings` to populate the pgvector column.
- [ ] Replace the 3 placeholder cases in `eval.ts` with 20 real questions
      written from a manual read-through of the Declaration.
- [ ] `pnpm eval:w1` (smoke run) — fix prompt / chunking / retrieval until
      pass rate clears 90%.
- [ ] `EVAL_REQUIRE_GATE=1 pnpm eval:w1` — confirm the gate exits 0.
- [ ] Wire the runner into CI on changes to W1 / chunker / prompt.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 1.0.0 (prompt 1.0.0) | initial | Postgres FTS retrieval, Llama 3.3 70B (Groq bridge per ADR-002) |
