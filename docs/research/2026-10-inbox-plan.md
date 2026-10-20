# Inbox revisit: the plan (BL-101, 2026-10-19)

**Owner's request:** "Revisit the inbox module and ensure it serves the board well and connects well to all documents. Currently it requires a lot of effort from the board — replying to residents' emails and requests."

**Goal:** the least board effort per reply. The target is two clicks for a routine question and three for a request that has to become a record.

**How this was researched:** I read the code only. There was no DB access, no local DB, and no tests were run. Every example below is synthetic.

---

## 1. What exists today

### 1.1 How a resident email reaches the board

1. **Arrival, polling only.** `mailboxSyncJob` (`packages/jobs/src/mailbox-sync.ts`) runs every 2 minutes and walks Gmail history from `mailbox_accounts.sync_cursor` (`packages/mailbox/src/sync.ts`). There is no Gmail push/watch, so mail can take up to 2 minutes to appear.
2. **Ingest.** `ingestMessages` (`apps/hoa/src/lib/inbox/ingest.ts`):
   - upserts `inbox_threads`, with new rows set to `status='needs_review'`;
   - inserts `inbox_messages`;
   - queues `inbox_attachments`, which `mailboxAttachmentsJob` stores in `hoa-documents/{org}/inbox/{thread}/…` with retries (BL-017).
3. **Matching.** `matchThread`, `applyMatch` and `applyVendorMatch` (`lib/inbox/match.ts`) apply these rules in order: `thread_continuity`, `sender_alias`, `resident_email`, `address_in_body`, `sender_name`. Only a high-confidence match sets `unit_id` and `resident_id`.
4. **Classification: none.** Nothing records intent, category, urgency or spam. Raw `gmail_labels` exist on messages only.
5. **List** (`/inbox`, `page.tsx`, `ThreadList.tsx`):
   - Filter chips: Needs review / Awaiting resident / Open / Waiting / Closed / All.
   - "Awaiting resident" is derived from `last_direction='outbound'`.
   - Each row shows the sender, subject, and a property badge (matched, confirm, or not filed).
6. **Thread** (`/inbox/[id]`):
   - **List pane:** shown only at `lg` and wider.
   - **Messages:** in the centre.
   - **`DraftPanel`:** below the messages.
   - **Property and vendor rail:** a third pane at `xl` and wider. Below `xl` it moves under the draft, so on a phone it sits beneath the composer.
   - **`PropertyRail`** shows:
     - the address, linked to `/properties/[id]`;
     - residents, inline-editable through `updateResidentFromInbox`;
     - the dues balance and overdue count;
     - the open-violation **count**;
     - up to 5 open ARC and 5 open tickets, as **plain text** with no links;
     - the last communication sent.
   - **Unmatched threads** get `AssignPropertyForm` (search, select, optionally "remember sender").
7. **Draft.** The board clicks **Draft a reply**, which runs `createDraft` (`lib/inbox/draft/actions.ts`). Drafts are created **only on demand**; nothing drafts on arrival. The call is synchronous.
   - **Retrieval** (`retrieveForThread`, `lib/inbox/draft/retrieve.ts`) runs these in parallel:
     - W1 governing documents (`queryGoverningDocs`);
     - W30 state law;
     - `getPropertyContext`, summarised to a few lines (address, residents, balance, and counts of violations, ARC and tickets);
     - the top 5 past replies, used as uncitable voice samples.
   - **Drafting** is done by W32 (`packages/workflows/src/W32-reply-drafter/`).
     - Citations are hard-validated: `validateCitations` allows one retry, then the draft is discarded.
     - `[[BLANK: …]]` markers cover money, enforcement, legal and other-resident facts.
     - Inbound text and names pass through `redactContactPII` (`packages/ai/src/pii.ts`; this was BL-062).
8. **Approve.** In `Composer`, the board edits the To, Subject and Body fields and fills every blank. **Approve and send** calls `approveDraft`, which queues the email with a 30-second undo window.
9. **Send.** `mailboxSendJob` (`packages/jobs/src/mailbox-send.ts`) claims the draft and runs `guardRecipients` from `packages/observability/src/outbound-guard.ts`. The guard fails closed: outside production, or when the org is in sandbox mode, only allowlisted recipients get through. The job then sends through Gmail.
10. **After sending.** The thread stays `needs_review` and moves to "Awaiting resident" because `last_direction` changes. **No UI can close, snooze or assign a thread**: `setThreadStatus` exists in `lib/inbox/actions.ts` but nothing calls it.

### 1.2 What is already built but unused

| Asset | State | Why it matters |
|---|---|---|
| `inbox_threads.assigned_to` (FK profiles) | column exists; nothing reads or writes it | assignment needs **no migration** |
| `inbox_threads.resident_id` | set by the matcher | we know *which* resident wrote, not only which house |
| `inbox_thread_links` (`ticket`, `arc_request`, `violation`, `communication_thread`) | writer `linkThreadToResource` exists, no UI, **no reader**, `resource_id` has no FK | email→record linking needs no migration for these 4 types; a reader must org-scope and validate per type |
| `setThreadStatus` | server action, no caller | close / waiting buttons are pure UI work |
| `listThreadsForUnit` | used by Property 360 only | "past threads from this home" is one call away |
| `readPdfTexts` / `vendor/attachment-text.ts` | used by W33/W34 only | W32 drafts ignore attached PDFs today |
| `listAttachableDocuments` + `AttachmentPicker` | outbound only | library→email works; email→library does not |
| `lib/resident-assistant/reads.ts` | resident-scoped (RLS client, `ResidentScope`) | money and violation reads key on `scope.units`, so they can be reused board-side with a one-unit scope; tickets and ARC filter on `submitted_by` and need a unit filter |
| Handoff links (`lib/resident-assistant/handoff.ts`) | `/resident/arc/new?summary=&scope=`, `/resident/tickets/new?subject=&description=` | a reply can hand the resident a prefilled portal form today |
| `communication_templates` | broadcast templates only | category CHECK has no inbox category, so it can't hold saved replies without SQL |
| `dailyDigestJob` (BL-003) | board digest exists | a natural home for "N residents waiting more than 48h" |

### 1.3 Gaps that cost the board effort

1. **The draft starts empty.** The board has to click, then wait 10–20 seconds, on every thread.
2. **The context is shallow and has no links.**
   - Violations are a count only.
   - ARC and tickets are plain text.
   - There is no ledger detail (next due date, last payment, payment plan).
   - The rail doesn't say which resident wrote.
   - There are no past threads and no relevant governing-document sections.
3. **The draft knows counts, not facts.** It can't say "your Q4 assessment of $X posted on 10/01 and is unpaid", so it inserts a `[[BLANK: money]]` that the board has to look up on another screen.
4. **No convert actions.**
   - The board has no create-ticket or create-ARC action. `createTicket` and `createArcRequest` are resident-only.
   - The violation wizard takes `?property=` but not the email text.
   - Even after a record is created by hand, nothing links it back to the thread.
5. **No way to finish a thread.** There's no close, snooze, assignment or "next thread" button, so the Needs-review queue never empties by design.
6. **No templates or saved replies, and no batching.** Thirty "when does the pool open?" emails mean 30 separate drafts.
7. **No SLA.** Nobody sees how long a resident has been waiting, and no reminders go out.
8. **Attachments are a dead end.** An emailed insurance certificate or ARC plan can't be filed to the documents library, and drafts ignore attachments.
9. **Mobile.** The context sits below the composer, and the action buttons scroll away.

### 1.4 Current click counts

Measured from the dashboard home, for a board member at desktop width. A click is a click or keypress-submit; typing is noted separately.

| Task | Today |
|---|---|
| **T1. Answer a routine policy or account question from a matched resident**<br>Synthetic example: "Can I install a 6-ft fence?" or "What do I owe?" | Inbox (1), open thread (2), Draft a reply (3), wait about 15s, read and resolve 1–2 blanks. A money blank means opening the property in another tab (4–6) and copying the figure. Approve and send (7). The thread stays in the queue. **About 7 clicks across 3 screens, plus a lookup.** |
| **T2. Turn an emailed maintenance or violation report into a record and acknowledge it**<br>Synthetic example: "Streetlight out by lot 12" or "Neighbour's trailer on the street" | Open the thread (2). Navigate to /violations/new or ask the resident to use the portal (3). Wizard: pick property and type, retype or paste the description, add photos by downloading and re-uploading them (about 6–8). Back to the inbox (9). Draft (10), edit to mention the record (typing), approve (11). No link back. **About 11–13 clicks across 4 screens, 2 re-typings.** Tickets: the board cannot create one at all. |
| **T3. File an unmatched sender, then reply**<br>Synthetic example: a new owner writing from a new address | Open the thread (2). Search the property (typing), select (3), tick "remember sender" (4), File (5). Edit the resident's email inline if it is new (6–8). Draft (9), approve (10). **About 10 clicks across 2 screens.** |

---

## 2. Benchmark (summary)

Full source list: the benchmark subagent's notes, and `2026-10-competitors.md`. All claims below are vendor-published.

| Product | Context panel | AI draft | Citations | Convert to record | Batching | Saved replies | SLA / assign | Mobile triage |
|---|---|---|---|---|---|---|---|---|
| **Vantaca HOAi** | yes | yes, a 9-step loop including research in governing docs, review by threshold | not advertised | creates "General Inquiry" action items | — | — | routed by workflow | — |
| **AppFolio Realm-X Messages** | yes | yes, "with personalized details" | not advertised | work orders, including from photos | — | — | flags what needs a human | app |
| **Buildium (Lumina)** | partial | "Write with Lumina" | no | tasks by request type | — | — | — | weak (reviews) |
| **PayHOA** | communication history | no admin AI shipped | — | — | broadcasts | broadcast templates | — | — |
| **TownSq** | dashboard | Suggested Reply from docs, announcements and account | not advertised | requests | — | — | assignments | app |
| **Front** | rules on contact/account data | Copilot | **sources shown** | — | — | templates with `{{vars}}` | time-goal rules; breach tags auto-clear on reply; round-robin | assign, snooze, merge |
| **Help Scout** | customer properties sidebar | AI Drafts | — | — | — | Saved Replies | snooze | app |
| **Zendesk** | intelligence panel | suggested first reply | macros | is the ticket | **merge suggestions**, per requester only | macro suggestions | intelligent triage, SLAs | app |

**Takeaways for us:**

1. **Cited drafts are a real differentiator.** Only Front shows the sources behind a draft, and no HOA vendor does. We already hard-validate quotes, so we should keep that and make citations clickable into the governing-document viewer.
2. **The HOA leaders win on context plus action.** Vantaca and AppFolio pair the reply with account facts and a created record, and that is the bar.
3. **Grouping across residents is open ground.** Zendesk groups only by requester, and no HOA vendor advertises it.
4. **SLA and assignment are standard in help desks but missing from HOA tools.** Front's "breach tag clears on reply, restarts on next inbound" is the model to copy.
5. **Published metrics:**
   - AppFolio: 26 seconds saved per message.
   - Vantaca: 20% of email triaged at one client.
   - Zendesk: 30–60 seconds per request from triage.

   No vendor publishes a "% of drafts sent unedited" figure. We should measure it (Phase A item A10).

---

## 3. The plan

Effort is in agent-days. The "Migration" column is either "no" or names the exact SQL needed (in Phase B). Every item keeps the existing invariants:
- citations are validated;
- blanks block Approve;
- the outbound guard runs on every send;
- a single resident's data never reaches another resident;
- no PII appears in logs.

### Phase A: no migration (ship this week)

Listed in recommended build order.

#### A1. Context panel v2 ("Who, what they owe, what's open")
- **User value:** the board answers without leaving the thread. This removes the 3-click lookup in T1.
- **What it adds:**
  - **Sender line:** "From: resident (owner) at 12 Example Ct", using `thread.resident_id`. If the sender isn't the matched resident, a warning: "Sender is not a resident of this home."
  - **Money card:**
    - balance, oldest open charge and its due date, last payment, payment-plan status;
    - links to the property ledger;
    - built from `loadLedgerRows` + `summarizeResidentDues` (`lib/resident-ledger.ts`, `lib/resident-dues.ts`).
  - **Violations:** a list with status and cure date, each linked, replacing the bare count.
  - **ARC and tickets:** each row linked to `/arc-review/[id]` and `/tickets/[id]`.
  - **Linked records:** read from `inbox_thread_links`, org-scoped and validated per type.
  - **Past threads:**
    - from this home, through `listThreadsForUnit`, already built for Property 360;
    - plus earlier threads from the same sender address.
  - **Relevant documents:** the W1 hits from the last draft retrieval (doc type and section), each linked to the governing-docs viewer.
- **Effort:** 1.5 · **Migration:** no
- **Risk:**
  - Low. Every read is board RLS.
  - Each section keeps its own `degraded` state, so one failure doesn't blank the whole rail.
  - The `inbox_thread_links` reader must re-check that every `resource_id` belongs to this org; the comment at `actions.ts` around line 373 says the same.
- **Files:**
  - `lib/inbox/queries.ts` (extend `PropertyContext` and `getPropertyContext`)
  - `inbox/[id]/PropertyRail.tsx`
  - new `inbox/[id]/ContextSections.tsx`
  - `lib/resident-ledger.ts`, `lib/resident-dues.ts`, `lib/properties/property-360.ts` (reuse only)

#### A2. Account-grounded, cited draft (resident-assistant reads on the board side)
- **User value:** "What do I owe?" or "Is my ARC approved?" comes back as a cited draft with the real figure. This removes most money and status blanks.
- **What it does:**
  1. Refactor `lib/resident-assistant/reads.ts` so `readMyAccount`, `readMyPaymentPlan` and `readMyRequests` take an explicit `{ db, orgId, unitIds }` scope, and stop requiring `submitted_by = userId`. Tickets and ARC filter on `unit_id` when called board-side.
  2. Call them from `retrieveForThread` with the **board's RLS client** (never the service role).
  3. Emit each fact as a `sourceType: 'property'` fragment with its own `refId` (for example "Ledger: Q4 assessment, $X, due 10/01, unpaid"). That way `validateCitations` can verify a quoted figure exactly as it verifies a CC&R quote.
- **Disclosure gate:**
  - Account fragments are included **only** when the sender's address matches a resident on that unit: rules `resident_email` or `sender_alias`, confidence high.
  - Otherwise W32 gets counts only, and money stays a `[[BLANK: money]]`.
  - A unit test pins this. It stops a neighbour who writes "what does 12 Example Ct owe?" from getting a figure.
- **Effort:** 2 · **Migration:** no
- **Risk:**
  - Medium: this is the disclosure gate.
  - The prompt rules still require a blank for enforcement and legal statements.
  - The refactor must keep the resident-side behaviour and tests byte-identical (`resident-assistant/*.test.ts`).
- **Files:**
  - `lib/resident-assistant/reads.ts`
  - `lib/inbox/draft/retrieve.ts` (`collectFragments`, a new `fetchAccountFragments`)
  - `packages/workflows/src/W32-reply-drafter/prompt.ts` (fragment labels only)
  - `lib/inbox/draft/retrieve.test.ts`

#### A3. Draft ready on open, then Approve, Close and Next
- **User value:** this removes the "Draft a reply" click and the wait, and gives the queue an end. The goal is that T1 ends at about 2 clicks.
- **What it does:**
  1. **Draft on open:** on opening a thread with no live draft whose latest message is inbound, the client calls `createDraft` automatically, with a "Drafting…" skeleton.
     - It is skipped for vendor-filed threads and for threads with `gmail_state` archived or trashed.
     - It is skipped if the org turns it off with `associations.compliance_settings.inbox_autodraft = false`. That field is jsonb, so no migration is needed.
  2. **Approve and close:**
     - A split button: **Approve and send** (default: close the thread when sent) or **Approve, keep open**.
     - It calls the existing `setThreadStatus`, and that call runs inside `approveDraft` after queueing.
     - If the resident writes back, the thread reopens. This needs one change: ingest must set `status='needs_review'` on a *closed* thread when an inbound message arrives. Today it deliberately never touches `status`, so this is a deliberate behaviour change and needs its own tests.
  3. **Next:** after approve, go to the next Needs-review thread.
  4. **Status buttons** in the header: Close / Waiting / Reopen.
  5. **Keyboard:**
     - `j` / `k` to move between threads;
     - `a` to approve once there are no blanks;
     - `e` to close;
     - `#` to assign (see A6).
- **Effort:** 1.5 · **Migration:** no
- **Risk:**
  - Medium: AI cost and drafts on spam. Keep drafting on demand-at-open rather than at ingest. Per-org rate limiting already sits in the AI wrapper; it needs checking.
  - Reopen-on-inbound must not reopen threads that were filed or trashed in Gmail.
- **Files:**
  - `inbox/[id]/DraftPanel.tsx`, `Composer.tsx`, `page.tsx`
  - `lib/inbox/draft/actions.ts` (`approveDraft` options)
  - `lib/inbox/actions.ts`
  - `lib/inbox/ingest.ts` (reopen rule)
  - new `inbox/useInboxKeys.ts`

#### A4. One-click convert: email to ticket, violation, ARC link or contact update
- **User value:** T2 drops from about 12 clicks to 3. The record links back to the thread and shows in the rail (A1).
- **Actions**, all in a "Create from this email" menu in the thread header:
  - **Ticket:**
    - New board action `createTicketFromThread(threadId, {category, subject, description})`.
    - It inserts into `tickets` with `unit_id` = the thread's unit and `submitted_by` = the board member. Board RLS allows the insert (`board_or_admin_ticket`).
    - It then writes `inbox_thread_links` (`resource_type='ticket'`).
    - The category, subject and description are prefilled from the latest inbound message: the subject line and the stripped text, capped. The board confirms them in a small modal.
    - **Category guess:** a keyword map, no AI, so it carries no injection risk.
  - **Violation report:**
    - Open `/violations/new?property=<hoa_properties id>&draft=<id>`.
    - The id comes from a `saveDraft` call (`lib/drafts.ts`, kind violation) seeded with the email text and the thread's stored image attachments, copied by storage path.
    - On completion the wizard writes `inbox_thread_links` (`violation`).
  - **ARC:**
    - The board can't file ARC on a resident's behalf without the resident losing sight of it: `arc_requests_select` shows residents only rows where `submitted_by = auth.uid()`.
    - So Phase A inserts a **prefilled portal link** into the draft (`/resident/arc/new?summary=&scope=&from=board`), using the handoff builder (`lib/resident-assistant/handoff.ts`). The resident submits it themselves. This follows the SEC-004 rule: text is built from fixed templates, never written by the model.
    - True on-behalf filing is item B4.
  - **Contact update:**
    - When the sender is unmatched or uses a new address, offer **Add as resident** or **Add this email to the resident**.
    - This runs through the existing `updateResidentFromInbox` and `addResident`, plus "remember sender" (`inbox_sender_aliases`).
  - **Acknowledgement:** after each convert the draft picks up a line such as "We've logged this as request #123", using a fixed template, not AI.
- **Effort:** 2.5 · **Migration:** no (existing `inbox_thread_links` types: `ticket`, `violation`)
- **Risk:**
  - Medium. `linkThreadToResource` currently accepts any UUID. Add per-type, org-scoped existence checks before writing, and make A1's reader re-check them.
  - A ticket's `submitted_by` is the board member, so the resident will not see it in `/resident/tickets` until B4. The acknowledgement copy must not promise that they will.
- **Files:**
  - new `lib/inbox/convert/actions.ts` + tests
  - `lib/inbox/actions.ts` (`linkThreadToResource` validation)
  - `lib/drafts.ts`
  - `app/(dashboard)/violations/new/page.tsx` (link on completion)
  - `lib/resident-assistant/handoff.ts`
  - new `inbox/[id]/ConvertMenu.tsx`

#### A5. Saved replies (code-defined starter library) and "insert snippet"
- **User value:** about 10 answers cover most HOA email: how to pay, gate or fob, pool hours, ARC how-to, estoppel request, trash day, parking, portal sign-in, records request, noise.
- **What it does:**
  - Ship them as a typed constant, like the global community templates.
  - Merge fields:
    - `{{first_name}}`, `{{balance}}`, `{{portal_link}}` and `{{arc_link}}`, resolved server-side from A1/A2 data;
    - `{{doc:<section>}}`, which pulls a cited W1 quote and keeps the citation chip.
  - An unresolved field becomes a `[[BLANK]]`, so Approve stays blocked.
  - The composer gets a `/` command and a picker.
- **Effort:** 1.5 · **Migration:** no. Org-editable saved replies are item B2.
- **Risk:**
  - Low. A merge field must never resolve another unit's data: it uses the same disclosure gate as A2.
  - Starter text must be state-neutral, or come in FL and CA variants keyed on `associations.state`.
- **Files:**
  - new `lib/inbox/saved-replies.ts` (+ test)
  - `inbox/[id]/Composer.tsx`
  - new `inbox/[id]/SnippetPicker.tsx`

#### A6. Needs-reply queue: waiting time, assignment, "Mine", digest reminders
- **User value:** nothing falls through, and a five-person volunteer board can split the queue.
- **What it does:**
  - **Waiting time:**
    - Each row shows "Waiting 2d", computed from `last_message_at` with `last_direction='inbound'`.
    - It turns amber after 48h and red after 5 days.
    - The thresholds live in `compliance_settings.inbox_sla_hours` (jsonb).
  - **Assign:**
    - An assign control in the header writes the existing `inbox_threads.assigned_to`.
    - A **Mine** chip and an **Unassigned** chip join the filters.
    - Replying to an unassigned thread assigns it to the replier, the Front pattern.
  - **Reminders:**
    - `dailyDigestJob` adds "N residents waiting more than 48h (M assigned to you)", with a link.
    - Recipients are board members only, and the send goes through the outbound guard (as in BL-003).
- **Effort:** 1.5 · **Migration:** no
- **Risk:**
  - Low. The age is derived, so it is approximate: it resets on any inbound message, which matches Front's "restart on next inbound".
  - True `first_response_at` reporting is item B1.
- **Files:**
  - `lib/inbox/queries.ts` (`applyInboxFilter`, `ThreadListItem`, counts)
  - `inbox/InboxChrome.tsx`, `ThreadList.tsx`
  - new `lib/inbox/assign.ts`
  - `packages/jobs/src/daily-digest*.ts`

#### A7. Mobile triage
- **User value:** a board member can clear routine mail from a phone between other things. Our users are volunteers, so this matters more for them than for a paid manager.
- **What it does:**
  - Below `lg`, a **context strip** above the messages: house, balance pill, and open-item counts. Tapping it opens the A1 panel as a sheet.
  - A **sticky bottom action bar**: Approve / Edit / Close / More (convert, assign). It respects `env(safe-area-inset-bottom)`.
  - **Swipe** on list rows: close, or assign to me.
  - The draft body collapses to its first 6 lines, with the citations listed under it.
  - The ui-shots overflow check runs at 390px.
- **Effort:** 1.5 · **Migration:** no
- **Risk:**
  - Low. Asaf uses Safari only, so the actual phone check is his manual step.
- **Files:**
  - `inbox/[id]/page.tsx`
  - new `inbox/[id]/MobileActionBar.tsx`, `ContextStrip.tsx`
  - `ThreadList.tsx`
  - `components/split-pane/SplitPane.tsx`

#### A8. Attachments: file to the documents library, and read them in drafts
- **User value:** an emailed insurance certificate, plan or invoice is filed in one click, and the draft "sees" an attached PDF.
- **What it does:**
  - **Save to documents:** on a stored attachment, this copies the object within the same `hoa-documents` bucket and inserts `hoa_documents` (name, type, `storage_path`, `file_size`).
    - `parsed_text` comes from `readPdfTexts` when the file is a PDF.
    - Provenance ("from email, date") goes in the name or description. A real FK is item B5.
  - **Attachment text in drafts:** W32 retrieval adds the attachment text through `selectAttachmentText` (`lib/inbox/vendor/attachment-text.ts`; 5 MB per file, 5 files, 20k characters).
    - The text is **uncitable context only**, like `aiContext`, after `redactContactPII`.
    - Resident uploads are untrusted input and must never become citations.
- **Effort:** 1 · **Migration:** no
- **Risk:**
  - Low to medium. Prompt injection through PDFs is held off because the text can't be cited and the board approves every send.
  - The copy must respect `storagePathBelongsToOrg`.
- **Files:**
  - new `lib/inbox/attachment-file.ts`
  - `inbox/[id]/MessageThread.tsx`
  - `lib/inbox/draft/retrieve.ts`
  - `lib/documents.ts` (reuse its insert)

#### A9. Batching, lite: "similar open questions" and reply-to-many
- **User value:** a burst of emails about one topic (synthetic: 18 emails about "pool resurfacing dates") is answered once.
- **What it does:**
  1. **On-the-fly grouping:** at most 50 Needs-review threads are embedded with `embedTexts`, using the latest inbound message after redaction, and grouped by cosine similarity of 0.85 or more. Nothing is persisted.
  2. **"Answer all":** a group banner offers "Answer all N".
     - It drafts **one policy-only answer**: W1 and W30 fragments, no account fragments, enforced in code.
     - It then creates **one `inbox_drafts` row per thread**, each addressed only to that thread's sender.
  3. **Review and send:** the board reviews one body and the recipient list, then approves the batch.
     - Each draft goes through `approveDraft` and the outbound guard individually.
     - There is **never** a shared To, Cc or Bcc across residents.
- **Effort:** 3 · **Migration:** no
- **Risk:**
  - Medium to high. A wrong grouping sends a wrong answer to many people.
  - Mitigations:
    - the group is visible and each thread can be unchecked;
    - batches are capped at 25;
    - personal-data blanks are forbidden in a batch body;
    - the per-thread undo still works.
  - Ship it after A1–A6.
- **Files:**
  - new `lib/inbox/batch/{group,actions}.ts`
  - `packages/ai` (`embedTexts`)
  - new `inbox/BatchBanner.tsx`
  - `lib/inbox/draft/actions.ts`

#### A10. Measurement (do this first, it's small)
- **User value:** proves whether the board's effort actually went down.
- **What it records**, per draft, as ids and numbers only in `ai_runs` metadata or logs:
  - edit distance between the generated and the approved body;
  - number of blanks;
  - time from open to approve.
- **Weekly figures:**
  - % of drafts sent unedited;
  - median time to approve;
  - median resident wait.
- **Effort:** 0.5 · **Migration:** no (jsonb metadata or logs)
- **Risk:** none. No bodies are logged.
- **Files:** `lib/inbox/draft/actions.ts`

**Phase A total: about 16.5 agent-days.**
- A10, A1, A3 and A6 (5 days) are the "this week" core.
- A2, A4 and A5 come next.
- A7, A8 and A9 follow.

### Phase B: needs SQL (Asaf applies it; the code ships behind a flag until he confirms)

The next free migration number is **0065**, after `0064_m1_batch.sql`. All of these are additive and nullable, and none rewrites a table.

#### B1. Real SLA and classification on threads
- **User value:**
  - true first-response reporting;
  - snooze ("remind me Friday");
  - an auto-category so billing goes to the treasurer and ARC to the ARC chair.
- **SQL:**
  ```sql
  ALTER TABLE public.inbox_threads
    ADD COLUMN IF NOT EXISTS first_inbound_at   timestamptz,
    ADD COLUMN IF NOT EXISTS first_response_at  timestamptz,
    ADD COLUMN IF NOT EXISTS sla_due_at         timestamptz,
    ADD COLUMN IF NOT EXISTS snoozed_until      timestamptz,
    ADD COLUMN IF NOT EXISTS category           text
      CHECK (category IN ('billing','arc','maintenance','violation_report','amenity',
                          'records_request','estoppel','general','vendor','spam')),
    ADD COLUMN IF NOT EXISTS priority           text NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low','normal','high','urgent')),
    ADD COLUMN IF NOT EXISTS classified_run_id  uuid REFERENCES public.ai_runs(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS inbox_threads_sla_idx
    ON public.inbox_threads(organization_id, status, sla_due_at);
  ```
- **App side:**
  - a cheap classifier on ingest, run on redacted text in a background job;
  - routing rules (category to board role);
  - snooze in the jobs' watchdog cron.
- **Effort:** 3 · **Risk:** medium. A misclassification only changes queue order; it never sends anything.

#### B2. Org-editable saved replies
- **SQL:**
  ```sql
  CREATE TABLE IF NOT EXISTS public.inbox_saved_replies (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,  -- NULL = global starter
    title           text NOT NULL,
    body_text       text NOT NULL,
    category        text,
    merge_fields    text[] NOT NULL DEFAULT '{}',
    use_count       integer NOT NULL DEFAULT 0,
    created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
  );
  ```
- **RLS:** board/admin can select their org's rows plus global rows, and can write their org's rows only. This mirrors the 0044 pattern.
- **App side:** "Save this reply as a template" from a sent draft. The A5 constants become seed rows.
- **Effort:** 1.5 · **Risk:** low

#### B3. Harden and extend `inbox_thread_links`
- **SQL:**
  ```sql
  ALTER TABLE public.inbox_thread_links
    DROP CONSTRAINT IF EXISTS inbox_thread_links_resource_type_check,
    ADD CONSTRAINT inbox_thread_links_resource_type_check
      CHECK (resource_type IN ('ticket','arc_request','violation','communication_thread',
                               'document','payment','resident_violation_report')),
    ADD COLUMN IF NOT EXISTS source_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL;
  ```
- **Also:** a `BEFORE INSERT` trigger that checks that `resource_id` exists in the table for its `resource_type`, with the same `organization_id`. This closes the "any UUID" hole at the database level.
- **Effort:** 1 · **Risk:** low to medium. The trigger must use the right org column per table: `hoa_violations` uses `org_id`.

#### B4. File ARC applications and tickets on a resident's behalf (visible to the resident)
- **SQL:**
  ```sql
  ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS on_behalf_of     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL;
  ALTER TABLE public.arc_requests
    ADD COLUMN IF NOT EXISTS on_behalf_of     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL;
  ```
- **RLS:** amend `tickets_select` / `resident_own_ticket` and `arc_requests_select` to also allow `on_behalf_of = auth.uid()`. This changes the 0063 sweep policies, so it needs an integration test in CI.
- **App side:** the A4 ARC convert becomes a real one-click "Create ARC application" with the email's attachments.
- **Effort:** 2 · **Risk:** medium (an RLS change)

#### B5. Attachment provenance in the library
- **SQL:**
  ```sql
  ALTER TABLE public.hoa_documents
    ADD COLUMN IF NOT EXISTS source_inbox_attachment_id uuid
      REFERENCES public.inbox_attachments(id) ON DELETE SET NULL;
  ```
- **App side:** the rail shows "Filed to library" and the document links back to the email.
- **Effort:** 0.5 · **Risk:** low

#### B6. Persistent topic groups (optional; only if A9's on-the-fly grouping proves too slow)
- **SQL:**
  ```sql
  ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS topic_embedding vector(768);
  CREATE INDEX IF NOT EXISTS inbox_threads_topic_idx
    ON public.inbox_threads USING ivfflat (topic_embedding vector_cosine_ops);
  ```
- **App side:** a job embeds the redacted latest inbound message for each thread.
- **Effort:** 1 · **Risk:** low

#### B7. Per-member unread (optional)
- **SQL:**
  ```sql
  CREATE TABLE IF NOT EXISTS public.inbox_thread_reads (
    thread_id       uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    read_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, user_id)
  );
  ```
- **RLS:** a member reads and writes only their own rows.
- **Effort:** 1 · **Risk:** low

**Phase B total: about 10.5 agent-days, plus Asaf applying 0065.**

### Out of scope (and why)

- **Background auto-send, or any send without approval.** It contradicts the product rule "intelligence recommends; people decide", W32's `humanApprovalRequired`, and the owner's no-surprise-sends rule.
- **Gmail push/watch.** A 2-minute poll is fine for board-paced work. Push needs Pub/Sub setup by the owner.
- **SMS replies.** SMS is parked; see BL-102 for the communications side.

---

## 4. Click counts: current → target (top 3 tasks)

| Task | Today | After Phase A | After Phase B | What removes the clicks |
|---|---|---|---|---|
| **T1.** Answer a routine policy or account question from a matched resident | about 7 clicks, 3 screens, 1 lookup, about 15s wait | **2** (open thread → Approve and send; the draft is ready, the figure is cited, the thread closes, the next one opens) | 2 | A1, A2, A3, A5 |
| **T2.** Turn an emailed report into a ticket or violation and acknowledge it | about 12 clicks, 4 screens, 2 re-typings; tickets impossible | **4** (open → Create ticket → confirm → Approve; the acknowledgement is pre-written and the link is recorded) | **4**, and ARC becomes a real convert (B4) | A4, A1, A3 |
| **T3.** File an unmatched sender, then reply | about 10 clicks, typing | **4** (open → Add as resident / confirm suggested home → Approve and send) | 4, plus auto-routing by category (B1) | A4 (contact convert), A3 |

A batch of N similar questions goes from about 7×N clicks to about **3 + N unchecks** (A9).

---

## 5. Recommendation and sequencing

1. **This week (Phase A core, about 5 days):**
   - A10 measurement;
   - A1 context panel v2;
   - A3 draft-on-open, approve-and-close, next;
   - A6 waiting time, assignment, digest.
2. **Next (about 6 days):**
   - A2 account-grounded drafts, which carries the highest value and the highest care: the disclosure gate;
   - A4 convert;
   - A5 saved replies.
3. **Then (about 5.5 days):**
   - A7 mobile;
   - A8 attachments;
   - A9 batching.
4. **Phase B:** hand Asaf migration 0065 containing B1, B2, B3, B4 and B5 as one apply file, with B6 and B7 deferred. Ship the dependent code behind `INBOX_0065_APPLIED = false` until he confirms.

**Success metric:** once A10 lands, measure against its first week of data:
- median board time from open to approve below 60 seconds;
- 40% or more of drafts sent unedited;
- no thread waiting more than 5 days.
