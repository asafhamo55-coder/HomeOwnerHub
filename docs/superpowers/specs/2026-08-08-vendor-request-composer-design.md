# Inbox — Vendor Request Composer (W34)

**Status:** Built and deployed — all five slices, vision included.
**Date:** 2026-08-08
**Shipped:** slices 1–4 in `da1d02d`; slice 5 (vision) 2026-08-09
**Predecessor:** [Phase C — Outbound Composer](./2026-08-02-hoa-inbox-outbound-composer-design.md)

---

## Goal

A board member reading a resident's email — a roof leak, a broken gate, a
dead tree — needs to get a vendor working on it. Today that means reading the
thread, opening every attachment, then hand-writing a new email that restates
the problem, names the address, says what is needed and by when, and
re-attaches the relevant files. It is the single most repeated piece of manual
work in the inbox.

After this phase: pick what you need from the vendor, click Draft, review, and
approve. The email is written for you, with the resident's documents already
read and attached.

This is the item Phase C parked. Its D2 reads: *"A later phase may add an 'AI
draft this' button to forward and compose. The schema does not preclude it —
`ai_run_id`, `model`, and `prompt_version` are already nullable."*

## What exists today and is reused unchanged

| Capability | Where |
|---|---|
| Draft lifecycle: approve → 30s undo → audited send | `lib/inbox/draft/actions.ts`, `inbox_drafts` |
| Blanks gate on approve | `lib/inbox/draft/blanks.ts` |
| Recipients on the row, Cc, 25-recipient cap | migration 0038, `approveDraft` |
| Attachments from upload / thread / doc library, 15MB budget | migration 0039/0040, `inbox_draft_attachments` |
| MIME multipart, header-injection guard, Gmail upload endpoint | `packages/mailbox/src/send.ts` |
| `kind='new'` send path (no `threadId`, account off the row) | `packages/jobs/src/mailbox-send.ts` |
| PDF text extraction with size/count/char caps | `lib/inbox/vendor/attachment-text.ts` |
| Thread → unit and thread → vendor | migration 0037, `inbox_threads.unit_id` / `.vendor_id` |
| Composer UI, recipient chips, attachment picker | `app/(dashboard)/inbox/` |

Nothing in the list above changes. This phase adds a retrieval step, a
workflow, one server action, one UI control, and a migration.

---

## Decisions

**D1 — The vendor gets a clean work order, never the resident's raw email.**
The existing Forward pastes the original under a `---------- Forwarded
message ----------` marker, carrying the resident's phone number, their
frustration, and whatever else they wrote. A vendor needs the facts of the
job: what, where, what we need back, by when. The AI writes that fresh. The
resident's original is not quoted, and `buildForwardBody` is not called on
this path.

This is a privacy decision as much as a quality one. `forward.ts`'s existing
behavior remains available for the cases where sending the raw original is
genuinely what you want — attorney referrals, for instance.

**D2 — The board picks the intent; the AI fills in everything else.** Six
intents: `inspect_quote`, `emergency`, `schedule`, `warranty`, `bid`,
`other`. Only `other` opens a free-text box. Letting the model infer the ask
from an ambiguous thread is where a vendor email goes wrong most expensively —
"come look at it" and "fix it, we're covering it" are one word apart in a
resident's telling and worlds apart in a vendor's invoice.

The intent is stored on the draft row, not merely passed through the prompt.
"How many emergency call-outs did we send this vendor last quarter" is a
question the board will ask, and body text cannot answer it.

**D3 — A vendor request starts its own Gmail thread.** Structurally it is
`kind='vendor_request'` with `thread_id IS NULL` and `mailbox_account_id NOT
NULL` — the shape migration 0038's CHECK already permits for `kind='new'`.

The alternative — threading onto the resident's conversation — puts the
resident and the vendor on the same thread, where one reply-all sends the
vendor's pricing to the owner. Phase C's D3 already refused Bcc on the
grounds that every recipient of HOA mail should be on the record the resident
can see; the mirror of that principle is that vendor pricing should not be on
a thread the resident is a party to.

**D4 — A fourth `kind`, not a reuse of `'new'`.** `kind='vendor_request'`
rather than `kind='new'` with a nullable intent column standing in for it.
The send job, the thread badge, and the audit trail each need to distinguish
"the AI drafted a work order to a vendor" from "a human clicked New email."
Collapsing them would make every one of those call sites read
`kind === 'new' && request_intent !== null`, which is a `kind` column with
extra steps.

**D5 — `source_thread_id` on the draft, not `inbox_thread_links`.** One
nullable column resolves both link directions:

- resident thread → vendor thread: drafts where `source_thread_id = me`, then
  `gmail_message_id` into `inbox_messages` to find the thread the sent
  message synced into.
- vendor thread → resident thread: the reverse join.

That `gmail_message_id` join is the same mechanism Phase C already specified
for labelling a synced outbound message. `inbox_thread_links` is deliberately
not used: its `resource_id` has no foreign key to any of the tables it can
point at, and the code comment at `lib/inbox/actions.ts:379` records that any
fabricated UUID can be written there. A typed, FK-backed column on a row we
already own is strictly better.

`ON DELETE SET NULL`, not `CASCADE`: deleting a resident thread must never
silently delete the record of what was sent to a vendor about it. The draft
survives with a broken link, which is the honest outcome.

**D6 — The body is assembled in TypeScript from structured fields.** W34
returns `situation`, `asks[]`, `accessNotes`, `attachmentDigest[]` — not one
body blob. `buildVendorRequestBody` renders them.

The "What we need" block is the entire point of this feature, and making it a
structural guarantee rather than a formatting instruction is what keeps it
from degrading into a paragraph on the drafts where it matters most. It also
makes the renderer unit-testable without a model.

**D7 — No citations.** Phase C's D2 is correct that a vendor email has
nothing to ground and no citations to validate. W34 does not import
`validateCitations`, and `inbox_drafts.citations` stays empty on these rows.

`attachmentDigest` is the honest substitute: every finding the model drew
from a document is listed beside the filename it came from, so a reviewer can
check any claim against its source in one click. It is a review aid, not a
validated gate, and the spec does not pretend otherwise.

**D8 — Money and authority are always blanks, never values.** Five blank
kinds: `money`, `authority`, `access`, `date`, `scope`. The model has no way
to know this association's spending limit, and a vendor who reads "approved
up to $5,000" will bill $5,000. Any dollar figure and any "you are approved
to proceed" must be emitted as `[[BLANK: money]]` / `[[BLANK: authority]]`.

`hasUnfilledBlanks` already matches `[[BLANK: <any_snake_label>]]`, so the
approve gate needs no change at all — only the W34 output enum and the UI
callout labels learn the new kinds.

**D9 — Photo reading (vision). Deferred at design time; SHIPPED 2026-08-09.**

Originally out of scope: `AI_MODEL` is `llama-3.3-70b-versatile`, text-only,
and no *workflow* had a vision path. That reasoning was half wrong —
`packages/ai/src/agents/vision.ts` already had a working `analyzeImage`, with
`tasks/photo-analysis.ts` on top of it. What was broken was configuration,
not code:

- `AI_BASE_URL_VISION` was never set, because ADR-002 planned a **separate
  self-hosted vision box** (vLLM serving Qwen2-VL) that was never built. An
  unset base URL sends every image to `api.openai.com` authenticated with a
  Groq key — a guaranteed 401.
- `AI_MODEL_VISION` held `Qwen/Qwen2-VL-7B-Instruct`, a HuggingFace repo id
  for that same unbuilt box. No hosted provider here serves it.

Fixed by falling back `AI_BASE_URL_VISION → AI_BASE_URL`, treating blank and
whitespace-only values as absent (the `82e1a20` trap, which the live health
probe still reports for `EMBEDDING_BASE_URL` today), and by pointing
`AI_MODEL_VISION` at `qwen/qwen3.6-27b` — the model Groq actually serves for
vision as of August 2026.

The `photoFindings` field carried in the schema from day one meant this was a
new producer feeding an existing field, exactly as intended. W34's prompt,
output schema, and body renderer are unchanged.

**Cost:** ~⅓ of a cent per request with photos. The model bills output at 5×
input ($0.60/$3.00 per 1M), so `max_tokens` is scaled tightly to the batch and
the prompt asks for one or two sentences per image.

**Privacy:** images are sent as base64 data URLs, never as signed storage
URLs. A signed URL is publicly fetchable by anyone holding it for its whole
lifetime, and these are photos of the inside of somebody's home.

**D10 — No new virus scanning, no rich text, no Bcc.** Unchanged from Phase
C's D3 and D9 and its out-of-scope list. This phase attaches files that are
already in the bucket by paths that already exist.

---

## Data model

Migration `0042_inbox_vendor_request.sql`:

```sql
ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_kind_check;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_kind_check
    CHECK (kind IN ('reply', 'forward', 'new', 'vendor_request'));

ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_thread_or_account;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind IN ('new','vendor_request')
       AND thread_id IS NULL AND mailbox_account_id IS NOT NULL) OR
    (kind NOT IN ('new','vendor_request') AND thread_id IS NOT NULL)
  );

ALTER TABLE public.inbox_drafts
  ADD COLUMN IF NOT EXISTS source_thread_id uuid
    REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_intent text
    CHECK (request_intent IS NULL OR request_intent IN
      ('inspect_quote','emergency','schedule','warranty','bid','other')),
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inbox_drafts_source_thread_idx
  ON public.inbox_drafts(source_thread_id)
  WHERE source_thread_id IS NOT NULL;
```

No RLS change: `inbox_drafts` already carries a board-or-admin policy, and
these are columns on that same table.

Existing rows are untouched — all three added columns are nullable and every
current row has a `kind` that both CHECK constraints still admit.

---

## Two modules this work extracted

Neither was in the original design; both came out of building it.

**`lib/inbox/attachment-pdf.ts`** — the download-and-parse loop. W33 already
had it message-scoped and private inside `vendor/actions.ts`; W34 needs the
same loop thread-scoped. Two copies would have been two places for "a corrupt
PDF must not fail the whole extraction" to stop being true. `readPdfTexts` now
serves both. `selectParsableAttachments` and `joinAttachmentText` stay pure in
`vendor/attachment-text.ts`, as that file's docstring intends.

**`lib/inbox/vendor-request-links.ts`** — `getOutgoingVendorRequests` and
`getIncomingVendorRequest`, the two directions of D5's join. Kept out of
`queries.ts`, which is already 42KB. Both return empty/null on a failed read
rather than throwing: a missing cross-reference in a header is cosmetic where
an unrenderable thread is not — the same stakes split `getThreadDetail`
applies to its own enrichment reads.

## Retrieval — `lib/inbox/draft/vendor-request-retrieve.ts`

New module, deliberately not folded into `retrieve.ts`. That file is 20KB and
builds W32's grounding: document fragments, statute chunks, voice examples,
embeddings. A vendor request needs none of it and would be
retrieving-by-not-retrieving through the same code path.

```ts
export interface VendorRequestRetrieval {
  threadSubject: string | null
  messages: Array<{ direction: 'inbound' | 'outbound'; from: string; text: string }>
  property: { addressLine1: string; unitNumber: string | null } | null
  vendor: { legalName: string; dba: string | null; trades: string[] } | null
  attachmentText: string | null
  photoFindings: PhotoFinding[]   // always [] this phase — see D9
  degraded: VendorRequestDegradedSource[]
  vendorId: string | null
  mailboxAccountId: string | null
  attachments: Array<{ id: string; fileName: string; sizeBytes: number }>
}

export async function retrieveForVendorRequest(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<VendorRequestRetrieval | null>   // null = thread not in this org
```

The vendor shape carries `dba`, not the `contactName` an earlier draft of
this spec assumed: `vendors` has no contact-name column (`legal_name`, `dba`,
`trades`, `primary_email`, `primary_phone`, `ein`, `status`, `address`).

Sources, each independently degradable:

| Source | Read from | On failure |
|---|---|---|
| Messages | `getThreadDetail`, `strippedText` | throws — without the thread there is nothing to draft |
| Property | `thread.unit_id` → `units` | `null`, push `'property'` to `degraded` |
| Vendor | `thread.vendor_id` → `vendors` | `null`, push `'vendor'` to `degraded` |
| Attachment text | `selectParsableAttachments` + `joinAttachmentText` | `null`, push `'attachments'` to `degraded` |

`degraded` is rendered into the prompt under an `UNAVAILABLE` heading, the
same mechanism and for the same reason as W32: an unnamed missing source gets
silently treated as an empty one, and a vendor email that omits the address
because the unit lookup failed is worse than one that says the address is
unconfirmed.

`strippedText`, not `bodyText` — quoted history is already cut, and W34 is
summarizing rather than forwarding, so the history adds tokens and confusion
without adding facts.

---

## Workflow — `packages/workflows/src/W34-vendor-request-composer/`

Structure mirrors W32 and W30: own OpenAI-compatible client,
`response_format: json_object`, Zod-validated output, `defineWorkflow` with
`humanApprovalRequired: true`.

**Input:**

```ts
{
  intent: 'inspect_quote' | 'emergency' | 'schedule' | 'warranty' | 'bid' | 'other',
  freeTextInstruction: string | null,   // only meaningful when intent='other'
  neededBy: string | null,              // ISO date the board picked
  threadSubject: string | null,
  messages: Array<{ direction: 'inbound' | 'outbound'; from: string; text: string }>,
  property: { addressLine1: string; unitNumber: string | null } | null,
  vendor: { legalName: string; dba: string | null; trades: string[] } | null,
  attachmentText: string | null,
  photoFindings: Array<{ fileName: string; finding: string }>,
  degraded: string[],
}
```

**Output:**

```ts
{
  subject: string,
  greeting: string,
  situation: string,                                    // 2–4 sentences, facts only
  asks: Array<{ text: string }>,                        // 1–6, the numbered block
  accessNotes: string | null,
  attachmentDigest: Array<{ fileName: string; finding: string }>,
  blanks: Array<{
    kind: 'money' | 'authority' | 'access' | 'date' | 'scope',
    prompt: string,
  }>,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
}
```

**Prompt rules** (`prompt.ts`, `PROMPT_VERSION = '1.0.0'`):

1. Write only facts stated in the conversation, the documents, or the
   property/vendor records. If it was not stated, do not write it.
2. Never write a dollar amount. Emit `[[BLANK: money]]`.
3. Never authorize work to proceed. Emit `[[BLANK: authority]]`.
4. Never assert how the vendor gets access — you do not know. Emit
   `[[BLANK: access]]` unless access is explicitly stated in the thread.
5. Never state a deadline the board did not give. When `neededBy` is null and
   the intent implies urgency, emit `[[BLANK: date]]`.
6. Never name the resident, quote them, or include their phone number or
   email. Refer to "the owner" or "the resident." The address and unit are
   the job site and ARE included.
7. `attachmentDigest` may only contain findings drawn from `DOCUMENTS` or
   `PHOTO FINDINGS`, each labelled with the filename it came from.
8. The `UNAVAILABLE` list names sources that failed to load. Do not assume a
   value for them and do not mention them.

Rule 6 is the one that distinguishes this from a forward. A vendor needs to
find the building; they do not need the owner's name or mobile number, and
Phase C's whole recipient discipline is undermined if the AI pastes it back
in.

**No corrective retry.** W32 retries once because its citation gate rejects
real drafts over a re-typed quote — a fixable formatting slip. W34 has no
such gate; a Zod parse failure is a malformed response, and retrying it is a
second bill for the same likely outcome. One call.

**`blanks[]` is not reconciled against the markers in the text.** The two can
disagree in both directions, and each disagreement is absorbed where it does
least damage rather than by discarding the draft. A marker with no `blanks`
entry still blocks approve, because `hasUnfilledBlanks` reads the body text,
not this array — the board member sees a blank to resolve, just without an
explanatory prompt beside it. A `blanks` entry with no marker renders one
stray callout. A strict check would fail closed on the model's most common
formatting slip and throw away a usable work order.

---

## Body assembly — `lib/inbox/draft/vendor-request-body.ts`

Pure module, no `'use server'`, in the manner of `forward.ts` and `blanks.ts`.

```ts
export function buildVendorRequestBody(
  output: VendorRequestComposerOutput,
  signature: string,
): string
```

Renders:

```
<greeting>

<situation>

What we need:
  1. <ask>
  2. <ask>

Access: <accessNotes>            ← omitted entirely when null

Attached:
  - <fileName> — <finding>

<signature>
```

Sections with no content are omitted rather than rendered empty — an
"Access:" heading followed by nothing reads as a drafting bug to the vendor
receiving it.

Blanks arrive already inline in the model's field text as
`[[BLANK: <kind>]]`; the renderer does not inject them and does not need to
know about them. `blanks[]` on the output drives the UI callouts only.

---

## Server action — `draftVendorRequest`

Added to `lib/inbox/draft/actions.ts`, following that file's existing
discipline exactly: `requireBoardOrAdmin()`, `.eq('organization_id', org.id)`
on every query, conditional updates, and no email address, subject, body, or
filename in any log line.

```ts
export async function draftVendorRequest(input: {
  threadId: string
  intent: VendorRequestIntent
  freeTextInstruction: string | null
  neededBy: string | null
  toEmails: string[]
}): Promise<
  { ok: true; draftId: string; skippedAttachments: string[] } | { error: string }
>
```

No `vendorId` parameter: it comes off the source thread's own `vendor_id`
during retrieval. Taking it from the caller would mean validating that a
form-supplied vendor id belongs to this org — a hazard the thread lookup
already closes.

`skippedAttachments` is returned rather than logged so the dialog can name
the files that did not fit. A board member who is not told is a board member
who thinks the vendor has the photo.

Sequence:

1. `requireBoardOrAdmin()`, then confirm the thread is in this org.
2. `retrieveForVendorRequest(threadId)`.
3. `draftVendorRequest` workflow call → W34 output + `runId`.
4. `buildVendorRequestBody(output, signature)`.
5. Insert `inbox_drafts`: `kind='vendor_request'`, `thread_id=NULL`,
   `source_thread_id=threadId`, `mailbox_account_id` from the source thread's
   account, `request_intent`, `vendor_id`, `to_emails`, subject, body,
   `ai_run_id`, `model`, `prompt_version`, `citations='[]'`.
6. Copy the source thread's `stored` inbound attachments into
   `inbox_draft_attachments` with `source='inbox'`, honoring the existing
   15MB budget — over budget, attach what fits in ascending size order and
   report which were skipped. Never silently drop.

The mailbox account is read from the **source thread**, so a vendor request
sends from the same mailbox the resident wrote to. Deriving it any other way
would let a two-mailbox org send a work order from the wrong address.

---

## Send job

`packages/jobs/src/mailbox-send.ts` treats `kind='vendor_request'` exactly as
`kind='new'`: no `threadId`, mailbox account read off the draft row. The
`kind === 'new'` test becomes `isThreadless(kind)`, a single exported helper.

An earlier draft of this spec said there were three such predicates. There is
one — the other two `'new'` mentions in that file are comments, and the
remaining branches key off the `threadId` local it sets. The helper is still
worth having for the reason the comment on it gives: the branches downstream
consume that one decision, and the symptom of getting it wrong is a vendor
request silently threading onto the resident's conversation.

No other change. `recordSent` is untouched. The rule that no code after
`sendReply` returns may mark a draft `failed` is untouched.

---

## UI

**Entry point** — `inbox/[id]/page.tsx` gains a **Request from vendor**
button beside the existing Forward. It opens `VendorRequestDialog`.

**`VendorRequestDialog.tsx`** — the six intent buttons, a "needed by" date
picker, a vendor selector prefilled from `thread.vendor_id` and backed by the
existing `searchVendors`, and a free-text box that appears only for
`other`. One primary action: **Draft the email**.

**Result** — routes to the created draft in the existing `Composer`. No new
editing surface: recipients, subject, body, and attachments are the Phase C
components, unchanged. The blanks callouts render the five new kinds.

**`attachmentDigest`** renders above the attachment list as "AI read these:",
each line naming its file. This is what makes the digest checkable rather
than decorative.

**Cross-links** — the resident thread shows "Vendor request sent to
&lt;vendor&gt; →" once the sent message has synced; before that, "Sending…".
The vendor thread shows "From resident thread: &lt;subject&gt; →". Both
resolve through `source_thread_id` + `gmail_message_id` as in D5.

---

## Error handling

| Failure | Behavior |
|---|---|
| Thread not in caller's org | `{ error: 'Thread not found.' }`, nothing written |
| Property or vendor lookup fails | Draft proceeds; source named in `degraded`; prompt told not to assume |
| No parsable attachments | `attachmentText = null`; `attachmentDigest` empty; no error |
| Attachment text extraction throws | Draft proceeds, `'attachments'` in `degraded` |
| W34 call fails or returns unparsable JSON | `{ error: 'Could not draft this request. Try again.' }`; no draft row |
| Attachments exceed the 15MB budget | Attach ascending by size until full; UI names the skipped files |
| Model emits a dollar figure despite rule 2 | Not caught by code. Human review is the gate, as it is for every draft |
| Vendor thread not yet synced | Cross-link shows "Sending…" rather than a dead link |

The money row is stated plainly rather than papered over. A regex that
stripped dollar figures would also strip a legitimately quoted prior estimate
out of `attachmentDigest`, and a draft silently altered after generation is
harder to review than one that shows what the model actually wrote.

---

## Testing

**What actually shipped in `da1d02d`:** the first three suites below, 40 new
tests (W34 20, body 8, retrieval 12). The whole repo suite is 789 green.

**Not written, and a real gap:** the `actions` and `mailbox-send` suites
listed below, and the Playwright end-to-end. `draft/actions.ts` already has an
`actions.test.ts`, so `draftVendorRequest` is testable by the same means and
simply was not covered — the cross-org refusal and the attachment-budget
skip path are the two worth adding first, since both are security- or
correctness-relevant and neither is exercised today.


**`W34` (unit, no live model — the root vitest harness is pure-modules-only):**
- `buildVendorRequestUserPrompt` renders each intent, and `UNAVAILABLE` when
  `degraded` is non-empty.
- Output parsing: valid JSON parses; malformed JSON throws; missing required
  field throws.
- `photoFindings: []` renders no `PHOTO FINDINGS` section.
- Every blank kind survives the Zod enum.

**`vendor-request-body` (unit, pure):**
- Numbered asks render 1..n.
- Null `accessNotes` omits the heading entirely.
- Empty `attachmentDigest` omits the "Attached:" block.
- `[[BLANK: money]]` in `situation` survives verbatim into the body, and
  `hasUnfilledBlanks` returns true for that body.

**`vendor-request-retrieve` (unit, mocked Supabase):**
- Missing `unit_id` yields `property: null` and `'property'` in `degraded`.
- Missing `vendor_id` yields `vendor: null` and `'vendor'` in `degraded`.
- Non-PDF attachments are excluded via `selectParsableAttachments`.
- Messages use `strippedText`.

**`actions` (unit):**
- Cross-org `threadId` writes nothing.
- Insert sets `kind='vendor_request'`, `thread_id=NULL`,
  `source_thread_id=<thread>`, and a non-null `mailbox_account_id`.
- Attachments over budget are skipped in ascending size order and reported.
- W34 failure creates no draft row.

**`mailbox-send` (unit):**
- `kind='vendor_request'` sends with `threadId: null`.
- Account is read off the draft, not through a thread.
- Existing cancel-race and status-guard tests pass unchanged.

---

## Build order

Each step is independently shippable. Slices 1–4 shipped in `da1d02d`.

1. **Migration + `isThreadless`.** 0042, and the send job's `kind === 'new'`
   test collapsed into one helper. No behavior change.
2. **W34 + body assembly.** Pure, fully unit-testable, no database.
3. **Retrieval + server action.** `retrieveForVendorRequest`,
   `draftVendorRequest`, attachment copying.
4. **UI.** `VendorRequestDialog`, the thread-header entry point, blank
   callouts for the new kinds, `attachmentDigest` display, cross-links.
5. **Vision (D9).** `lib/inbox/draft/photo-findings.ts` — a pure
   `selectPhotoAttachments` (5-image / 3MB-per-file / 12MB-batch caps, HEIC
   excluded because nothing here decodes it) plus `readPhotoFindings`, which
   base64s the images, asks one batched question, and maps indexed answers
   back onto file names. An out-of-range or duplicate index is dropped rather
   than mapped to a neighbouring file: attributing a finding to the wrong
   photo is the one error a reviewer cannot catch by opening the file.

## Out of scope
- Work orders as a first-class tracked object with quotes and status. This
  design leaves it open: a `work_orders` row can later hang off the draft.
- Automatically telling the resident that a vendor was engaged.
- Vendor selection by trade matching. The vendor is prefilled from
  `thread.vendor_id` and otherwise chosen by hand.
- Scheduled send, templates, canned vendor requests.
- Rich text, inline images, Bcc, virus scanning — all unchanged from Phase C.
