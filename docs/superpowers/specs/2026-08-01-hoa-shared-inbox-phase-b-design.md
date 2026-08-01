# HOA Shared Inbox — Phase B: Grounded Reply Drafting

**Status:** Approved design, not yet planned
**Date:** 2026-08-01
**Predecessor:** [Phase A](./2026-07-31-hoa-shared-inbox-design.md) — built, reviewed, deployed, verified in production (64 commits)

---

## Goal

A board member opens a resident's email, clicks **Draft a reply**, and gets a reply written in their HOA's own voice, grounded in that property's record and the community's governing documents, with every factual claim citable — then edits it, approves it, and sends it from inside HomeownerHub.

## What Phase A already provides

Phase B is not a greenfield build. It stands on:

| Capability | Where it lives |
|---|---|
| Gmail sync, dedupe, threading | `packages/mailbox`, `packages/jobs/src/mailbox-sync.ts` |
| Property matching + resolution | `apps/hoa/src/lib/inbox/match.ts`, `lib/properties/resolve.ts` |
| Property context (dues, violations, ARC, tickets) | `getPropertyContext` in `lib/inbox/queries.ts` |
| Thread triage UI | `app/(dashboard)/inbox/` |
| Attachment storage | `packages/jobs/src/mailbox-attachments.ts` |
| Document retrieval (vector) | `documents` + `document_chunks`, powering `/api/ai/ask-docs` |
| Statute retrieval (vector) | `state_statute_chunks` |
| Embeddings + model routing | `packages/ai` — `embedTexts`, `toPgVector`, `agentFor` |
| `gmail.send` scope | Already granted at Phase A connect time |

The `gmail.send` scope was requested in Phase A specifically so Phase B would not require every HOA to re-consent.

---

## Decisions

**D1 — Sync scope widens to include the HOA's own sent mail.**
`buildScopeQuery` currently emits `(to:X OR cc:X OR deliveredto:X)` and `isInScope` matches only recipient fields. Sent mail is therefore excluded by construction. Verified empirically: a real mailbox synced 153 inbound messages and **zero** outbound.

This is a prerequisite for Phase B, and independently a Phase A defect:

- Without it there is no reply corpus, so drafts cannot learn the HOA's voice.
- Without it a thread shows only the resident's half. A manager who already replied in Gmail cannot see it and may answer twice or contradict themselves — while the UI tells them to go reply in Gmail.

**D2 — Drafts are generated on demand**, when a human clicks. Not on arrival. In production, 142 of 143 synced threads were newsletters and job alerts that matched no property; pre-generating would spend almost all its cost on mail nobody opens, and a draft generated at arrival can go stale before it is read.

**D3 — Four categories are never written into a draft.** The AI leaves an explicit blank instead:
1. **Money commitments** — waiving or reducing a fee, payment plans, refunds, credits
2. **Enforcement outcomes** — dismissing a violation, approving or denying an ARC request, granting an extension
3. **Legal interpretation** — what a statute or the CC&Rs "require", who is liable, consequences of non-compliance. Verbatim quotation with a citation is permitted; characterisation is not.
4. **Other residents' information** — naming or describing another household

Rationale: a human approves every send, but confident-looking drafted text gets approved with less scrutiny than a blank page. These four are the ones that bind the association or breach a resident's privacy.

**D4 — Four grounding sources:** the two-sided thread plus property data; governing documents; past replies from this mailbox; Georgia statutes. Statutes are in scope only as verbatim quotes, per D3.

**D5 — When retrieval finds nothing relevant, draft an acknowledgement only** — a short reply confirming receipt and committing to follow up, with an explicit banner stating that no governing document or property record matched and the draft contains no facts. Not a refusal (most such mail genuinely needs a two-line acknowledgement), and not a weakly-grounded answer (that is the shape that gets rubber-stamped).

**D6 — Approve queues the send with a 30 second undo window.** Exactly 30 seconds, as a single named constant (`UNDO_WINDOW_SECONDS`), not a range. Matches the Gmail behaviour users expect and catches the wrong-thread mistake that surfaces the instant you commit.

---

## Architecture

Three layers over Phase A, plus one Phase A amendment.

### Layer 0 — Phase A amendment (prerequisite)

- `buildScopeQuery`: add `from:<address>` to the address-mode clause.
- `isInScope`: match sender as well as recipients.
- Direction assignment already exists in `parse.ts`; confirm outbound is classified correctly once sent mail arrives.
- One-time re-backfill for existing accounts to pull historical sent mail. Ingest is idempotent, so re-running over already-synced inbound mail is safe.
- Thread view renders outbound messages distinctly (Phase A's `MessageThread` already styles `direction === 'outbound'`).

### Layer 1 — Retrieval (`apps/hoa/src/lib/inbox/draft/retrieve.ts`)

One function, `retrieveForThread(db, orgId, threadId)`, running five queries concurrently:

1. Thread messages, quote-stripped, both directions, chronological
2. `getPropertyContext` for the attached unit — **including its `degraded[]` array**
3. Governing-document chunks — embed the resident's latest message, vector search, org-scoped
4. Statute chunks — same embedding, separate corpus
5. Similar past replies — vector search over `inbox_reply_embeddings`, org-scoped, **excluding the current thread**

Every fragment returned carries a stable identifier. A fragment that cannot be cited cannot be used.

`degraded[]` is load-bearing: if the dues query failed, the draft must not imply a balance. Phase A designed out "a blank rail reads as nothing owed"; the same trap exists in prose.

### Layer 2 — Generation: **W32 Reply Drafter** (`packages/workflows/src/W32-reply-drafter/`)

**Amended during planning.** The original draft of this spec proposed a bespoke `draft/generate.ts`. The codebase already has an AI workflow framework (`defineWorkflow` in `packages/ai/src/workflow.ts`) with eight workflows on it, and rebuilding around it would duplicate solved problems and bypass the audit trail. W32 follows W1/W30/W31's shape: `index.ts` (schemas + `defineWorkflow`), `prompt.ts`, `tools.ts`, `README.md`.

The framework already provides, at no cost:

- `ai_runs` audit row per draft, returning a `runId` to store on `inbox_drafts`
- `humanApprovalRequired: true` as a declared property of the workflow
- `addCitations(chunkIds)`, `setConfidence()`, `setTokens()`, `setModel()`
- `version` + `promptVersion` stamped on every run, so a bad prompt revision is traceable
- zod validation of both input and output

Two grounding sources are existing workflows and are **called, not reimplemented**: `queryGoverningDocs` (W1) for governing documents and `askStateLaw` (W30) for statutes. Both already return citations. Only past-reply retrieval is new.

Structured output, not prose:

```ts
interface GeneratedDraft {
  subject: string
  body: string
  citations: Array<{
    sourceType: 'document' | 'statute' | 'property' | 'past_reply'
    refId: string        // must match something retrieved
    quote: string
    label: string        // human-readable, e.g. "CC&Rs §4.2"
  }>
  blanks: Array<{
    kind: 'money' | 'enforcement' | 'legal' | 'other_resident'
    prompt: string       // what the human must decide
  }>
  grounded: boolean
  groundingNote: string | null   // set when grounded === false (D5)
}
```

Runs through the existing `packages/ai` router rather than a new model client.

### Layer 3 — Send (`packages/jobs/src/mailbox-send.ts`)

Event-driven. Sleeps until `send_after`, claims the row conditionally, sends via the Gmail API with correct `In-Reply-To` and `References` headers so the reply threads in the resident's client.

---

## Data model

Two new tables. Both get `board_access` RLS (`FOR ALL` with a matching `WITH CHECK`) and explicit `organization_id` scoping, because the jobs layer uses the service-role client and bypasses RLS entirely. Migrations begin at **0034**.

### `inbox_reply_embeddings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | FK orgs |
| `message_id` | uuid not null unique | FK `inbox_messages` |
| `embedding` | `vector(768)` | must match `EXPECTED_DIM` in `packages/ai/src/embeddings.ts`. Note the schema contains both `vector(768)` and `vector(1024)` columns from an earlier model swap — 768 is the current one. |
| `text_sha256` | text not null | skip re-embedding unchanged text |
| `created_at` | timestamptz | |

Populated by a backfill job over historical outbound messages, then kept current by the sync. Only outbound messages with a usable body (>40 characters after quote-stripping) are embedded. The hash guard matters: embedding calls cost money and a re-sync must not re-pay for unchanged text.

### `inbox_drafts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | |
| `thread_id` | uuid not null | FK `inbox_threads` |
| `status` | text not null | `draft` / `queued` / `sending` / `sent` / `cancelled` / `failed` |
| `subject`, `body_text` | text | editable by the approver |
| `citations` | jsonb | as generated, validated |
| `blanks` | jsonb | unfilled blanks block approval |
| `grounded` | boolean | |
| `grounding_note` | text | D5 banner text |
| `ai_run_id` | uuid | FK `ai_runs` — the W32 execution that produced this draft |
| `model`, `prompt_version` | text | denormalised from the run for cheap display |
| `created_by`, `approved_by` | uuid | |
| `approved_at`, `send_after`, `sent_at` | timestamptz | |
| `gmail_message_id` | text | returned by the send call |
| `error` | text | |

**The send queue is this table**, via `status` + `send_after`, not a separate queue. One row tells the whole story of a reply — which is what you want when a resident later asks what they were told.

### The cancel race

Undo sets `status='cancelled'`. The send job claims its row with a **conditional update**:

```sql
UPDATE inbox_drafts SET status='sending'
WHERE id = $1 AND status = 'queued'
```

Zero rows affected means it was cancelled; the job stops. Deliberately **not** read-then-decide. That is precisely the race the Phase A final review caught in `applyMatch`, where a manual assignment could be silently overwritten between the check and the write. The equivalent bug here sends an email a human already cancelled — strictly worse, because it cannot be undone.

---

## Guardrail enforcement — what is and is not deterministic

Stated plainly, because overclaiming here would be the most dangerous thing in this document.

**Deterministic and strong:**

- **Citation validity.** Every `refId` must match a fragment actually returned by retrieval. A citation the model invented fails the draft outright. This is the strongest guarantee in the design.
- **Blanks block approval.** The Approve control is disabled until every blank is filled or explicitly removed by a human. The model cannot route around a disabled button.
- **Retrieval scoping.** Past replies, documents, property context, and statutes are all org-scoped and property-scoped at the query level, so D3's "other residents' information" is largely enforced by what is never retrieved in the first place.

**Not fully mechanically enforceable:**

- Detecting that a sentence *interprets* a statute, rather than quoting it, is not something a deterministic check can promise. Enforcement is the structured-output contract, a cheap second-pass classifier that flags suspected violations for the reviewer, and the human approver.

This limit is stated up front rather than discovered later.

---

## Failure modes

| Failure | Behaviour |
|---|---|
| Retrieval finds nothing | Acknowledgement-only draft with explicit banner (D5) |
| `getPropertyContext` reports `degraded` | Affected facts excluded; draft notes what could not be loaded |
| Model returns an invented citation | Draft rejected, error surfaced, no partial draft shown |
| Model call fails / times out | Error surfaced; nothing persisted as an approvable draft |
| Embedding backfill fails | Past-reply retrieval degrades to empty; other sources still ground the draft |
| Gmail send fails | `status='failed'` with the error; visible on the thread; retry is explicit, never automatic |
| Undo pressed | `status='cancelled'`; conditional claim guarantees no send |
| Thread has no attached property | Drafting allowed, but property-derived facts are absent; treated as a `degraded` source |
| Mailbox disconnected | Drafting disabled with the reason shown; existing queued sends fail loudly rather than silently |

---

## Testing

**Unit** — scope query now includes `from:`; `isInScope` accepts sender; citation validation rejects unknown `refId`; blanks block approval; conditional claim returns zero rows when cancelled; embedding skipped when `text_sha256` unchanged.

**Integration (live DB, the Phase A pattern)** — RLS isolation on both new tables including cross-org proof with a real authenticated board member; a queued send cancelled mid-flight never sends; a sent reply appears in the thread exactly once despite both the direct write and the next sync.

**The negative test that matters most:** a draft whose model output cites a document chunk that was never retrieved must fail. If that test passes against a wrong implementation, the citation guarantee is theatre.

---

## Build sequence

1. **Phase A amendment** — scope widening, re-backfill, two-sided thread view. Ships alone and is independently valuable.
2. **Reply corpus** — `inbox_reply_embeddings`, backfill job, sync hook.
3. **Retrieval + generation** — draft produced and displayed, no sending. Reviewable on its own.
4. **Approval + send** — `inbox_drafts` lifecycle, undo window, Gmail send, thread write-back.

Each step leaves the system working.

---

## Out of scope

- Auto-send without human approval — never, per Phase A
- Drafting for unmatched threads in bulk / triage automation
- Multi-language replies
- Learning per-author voice (per board member) rather than per-HOA
- Attachments on outbound replies — deferred to a later phase

---

## Open questions for implementation

- Which model tier from `packages/ai`'s router — `runMain` or `runReason` — and whether the second-pass guardrail classifier can use `runFast`
- How many past replies to retrieve as examples before context cost outweighs voice fidelity
- Whether the sent copy should be written to `inbox_messages` immediately (relying on `gmail_message_id` dedupe) or left entirely to the next sync
- Signature handling: whether outbound replies append the HOA's existing Gmail signature or one stored in HomeownerHub
