# W32 — Reply Drafter

**Purpose:** Turns a resident thread's retrieved context (Task 7's `retrieveForThread`) into a suggested reply, written in the association's own voice, with every factual claim citable back to a fragment. This is the centre of Phase B — a board member edits and approves the draft before anything sends.

## Public API

```ts
import { draftReply } from '@homeowner-portal/workflows'

const { subject, body, citations, blanks, grounded, groundingNote, runId } = await draftReply(
  {
    threadSubject: thread.subject,
    messages: thread.messages,      // { direction, from, text }[]
    fragments: retrieval.fragments, // { refId, sourceType, label, text }[]
    degraded: retrieval.degraded,
    aiContext: retrieval.aiContext, // W1/W30 synthesized answers — background only
  },
  { organizationId: org.id },
)
```

`runId` is the `ai_runs` row id. Every run lands as `pending_human_approval` — see "Human-in-loop" below.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.threadSubject | `string \| null` |
| Input.messages | `{ direction: 'inbound' \| 'outbound', from: string, text: string }[]` |
| Input.fragments | `{ refId, sourceType: 'document'\|'statute'\|'property'\|'past_reply', label, text }[]` — the ONLY citable material |
| Input.degraded | `string[]` — names of sources that failed to load; the model is told not to assume a value for them |
| Input.aiContext | `{ governingDocs: string \| null, stateLaw: string \| null }` — W1's/W30's own synthesized answers, background orientation only |
| Output.subject / body | `string` — `body` contains `[[BLANK: <kind>]]` markers where the model withheld content |
| Output.citations | `{ refId, quote, label }[]` |
| Output.blanks | `{ kind: 'money'\|'enforcement'\|'legal'\|'other_resident', prompt: string }[]` |
| Output.grounded | `boolean` — false for an acknowledgement-only draft |
| Output.groundingNote | `string \| null` — required explanation when `grounded=false` |

## `aiContext` is never a citation

`ThreadRetrieval.aiContext` (Task 7) carries W1's and W30's own synthesized *answers* — unattributed AI paraphrase, not the documents themselves. `fragments` carries the actual chunk text with a `refId`; `aiContext` deliberately has none. The prompt (`prompt.ts → buildReplyDrafterUserPrompt`) renders it in its own `BACKGROUND` section, physically separated from `SOURCES`, labelled "NOT a source — do not quote, do not cite, no refId exists for this section." The system prompt (rule 3) repeats the same constraint. Passing `aiContext` to the model without this separation would reintroduce the defect Task 7's fix wave removed: the AI's paraphrase displayed as though it were the association's governing document.

## The four prohibitions (spec D3)

The system prompt forbids drafting, and instead requires a `[[BLANK: <kind>]]` marker plus a `blanks[]` entry, for:

- **money** — waiving/reducing a fee, payment plans, refunds, credits
- **enforcement** — dismissing a violation, approving/denying an ARC request, granting an extension
- **legal** — what a statute or the CC&Rs "require", who is liable, what happens on non-compliance (verbatim quotation with a citation is fine; characterizing what it *means* is not)
- **other_resident** — naming or describing any other household

These exist because a human approves every send, but confident drafted text gets approved with less scrutiny than a blank page — so the dangerous content must never be drafted at all, not merely flagged after the fact.

## Citation validation is a hard failure

`validateCitations` (`tools.ts`, Task 8) is called in `run()` against the refIds actually present in `input.fragments` — never against the model's own claimed list. If the model cites a refId that was never retrieved, `validateCitations` throws `InvalidCitationError`. That error is **not caught** in `index.ts`: it propagates out of `run()`, `defineWorkflow`'s wrapper records the run as `status='failed'` in `ai_runs`, and the whole draft is discarded — never partially returned with the bad citation dropped. A fabricated citation is worse than no citation, because it is specifically designed to survive review.

## Human-in-loop

`humanApprovalRequired: true` is declared directly on the workflow definition (matching W3/W21/W22/W23), not merely enforced in the UI. Every successful run lands in `ai_runs` with `status='pending_human_approval'`. A board member must edit and approve — or reject — before a draft sends.

## Logging

Thread content (subject, body, resident email addresses) flows through this module. Errors are logged without the raw model response or thread text — see `parseModelJson` in `index.ts`.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 1.0.0 (prompt 1.0.0) | initial | Text-only, grounded via Task 7's `retrieveForThread`, JSON output mode |
