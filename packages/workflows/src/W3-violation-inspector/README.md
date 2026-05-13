# W3 — Violation Inspector

**Purpose:** Drafts a covenant-violation notice for board approval, grounded in the association's actual CC&Rs via W1.

## Public API

```ts
import { violationInspector } from '@homeowner-portal/workflows/W3'

const result = await violationInspector.execute(
  {
    unitId: 'uuid',
    violationType: 'unauthorized exterior paint',
    description: 'Front door painted red; no ARC approval on file.',
    reporterNotes: 'Drive-by inspection 2026-05-13',
    associationId: null,
  },
  { organizationId: org.id },
)
// result.output.notice          → full draft text, ready for board review
// result.output.citations       → which CC&R chunks were used
// result.output.recommendedSeverity / FineAmountCents / CurePeriodDays
// result.runId                  → ai_runs row id, persists in pending_human_approval
```

## How it grounds the citation

1. Build a short RAG query from `violationType + description.slice(0, 240)`.
2. Call `retrieveChunks()` from W1 — returns top 6 by pgvector (when embeddings exist) or FTS (today).
3. Pass those chunks to the LLM via the system prompt's rules.
4. The model returns:
   - `notice` — the draft text quoting the cited clause verbatim
   - `cited_section` — e.g. `"Article IV, Section 4.1"` (or null if no chunk supported)
   - `cited_chunk_ids` — UUIDs the model claims it used; we intersect with what we actually retrieved (hallucinated ids dropped)
   - `recommended_severity` / `recommended_fine_amount_cents` / `recommended_cure_period_days`
   - `confidence` — HIGH / MEDIUM / LOW

## Human-in-loop

`humanApprovalRequired: true` in the workflow definition. Every run lands in `ai_runs` with `status='pending_human_approval'`. A board approval queue UI consumes that and lets the board:

- Approve as-is (`human_approved=true`, send notice, schedule re-inspection)
- Edit text + approve (saves `human_edited_output`, then send)
- Reject (mark not actionable)

Per spec §5 W3: **no auto-send.** The draft is always staged.

## Confidence policy

- **HIGH** — direct CC&R match. Board likely approves without edits.
- **MEDIUM** — relevant rule found but interpretation needed. UI flags as "review section reference."
- **LOW** — chunks tangentially address the topic. UI surfaces a warning banner: "draft, requires board review of clause."

## Phase 2 plan (deferred to 2.1)

Spec calls for a vision step: photo in → AI classifies violation type → workflow proceeds. ADR-002 defers vision to Phase 2.1 alongside self-hosted Qwen2-VL. Today the wizard captures photos (they land on the `hoa_violations` row) but the photo isn't fed to the workflow input — the reporter types `violationType` manually.

## Acceptance criteria

Per spec §5:
- 60% of drafts approved without edits
- 95%+ cite the correct CC&R section

Both measurable via `ai_runs` × `ai_feedback`: count completed runs vs runs with `human_edited_output != null`, and the per-run citation accuracy. The customer audit log UI (planned per spec §6) surfaces these aggregates.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 1.0.0 (prompt 1.0.0) | initial | Text-only, RAG via W1, Groq Llama 3.3 70B for drafting |
