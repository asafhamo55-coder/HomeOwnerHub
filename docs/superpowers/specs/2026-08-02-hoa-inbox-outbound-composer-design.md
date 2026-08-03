# HOA Shared Inbox — Phase C: Outbound Composer

**Status:** Approved design, not yet planned
**Date:** 2026-08-02
**Predecessor:** [Phase B](./2026-08-01-hoa-shared-inbox-phase-b-design.md) — grounded reply drafting, built and deployed

---

## Goal

A board member working a thread in HomeownerHub can do the three things the
inbox cannot do today: **forward** a resident's email onward to a vendor or
attorney, **add more recipients** to any outgoing message, and **attach
documents** — uploaded from their computer, taken from the thread itself, or
pulled from the HOA's own document library. They can also **start a new
conversation** from the inbox rather than only ever answering one.

Everything still goes through the same approve → 30-second undo → audited send
that Phase B established. Nothing leaves the building without a named approver
on the row.

## What exists today

| Capability | Where it lives |
|---|---|
| AI reply drafting, citations, blanks, grounding | `lib/inbox/draft/`, W32 reply drafter |
| Approve / undo / cancel lifecycle | `lib/inbox/draft/actions.ts`, `inbox_drafts` |
| Send to Gmail | `packages/jobs/src/mailbox-send.ts`, `packages/mailbox/src/send.ts` |
| Inbound attachment fetch + storage | `packages/jobs/src/mailbox-attachments.ts`, `inbox_attachments` |
| Signed-URL attachment download | `app/(dashboard)/inbox/attachment/[id]/route.ts` |
| Document library | `hoa_documents`, `hoa_document_versions`, `governing_documents` |

The three gaps this phase closes:

- `mailbox-send.ts:147` derives the single recipient from the last inbound
  message's `from_email`. There is no way to send anywhere else.
- `buildRawMessage` (`packages/mailbox/src/send.ts:39`) emits a single-part
  `text/plain` message. No `Cc`, no MIME multipart, therefore no attachments.
- `inbox_drafts` stores `subject` and `body_text` only. No recipients, no
  attachment references, and `thread_id` is `NOT NULL`, so a draft cannot
  exist outside an already-ingested conversation.

---

## Decisions

**D1 — One row type, not two.** `inbox_drafts` generalizes into an outbound
message row (`kind` ∈ `reply` | `forward` | `new`) rather than growing a
sibling table for human-written mail. A second table would mean two send jobs,
two status machines, two undo windows, and a thread page merging two draft
sources. The state machine in `mailbox-send.ts` is unusually carefully
reasoned — its comments at lines 73–94 document a real production bug that a
naive status guard caused — and it is worth extending exactly once rather than
duplicating.

**D2 — Forwards and new messages are written by a human, not the AI.** The W32
reply drafter retrieves governing-document and property context to ground a
reply to a resident. "FYI, see below — can you quote this?" to a landscaper has
nothing to ground and no citations to validate. Forward pre-fills the quoted
original; compose starts empty. Both keep the approve/undo/audit lifecycle;
neither runs an AI call, so `citations` and `blanks` stay empty and `grounded`
is not meaningful for them.

A later phase may add an "AI draft this" button to forward and compose. The
schema does not preclude it — `ai_run_id`, `model`, and `prompt_version` are
already nullable.

**D3 — Cc, but no Bcc.** Bcc is invisible in the delivered message and is the
precise header `assertNoHeaderInjection` was written to defend against being
injected (see its docstring at `send.ts:23-32`). An HOA's outbound mail carries
balances, violation history, and ARC decisions; every recipient of that should
be on the record the resident can see. There is no Bcc field in the composer
and no Bcc column on the row.

**D4 — Recipients are resolved at draft time, not send time.** Today the
recipient is looked up when the job runs, which means a new inbound message
arriving during the undo window can silently redirect the reply to a different
address than the approver saw. After this phase, `createDraft` pre-fills
`to_emails` from that same last-inbound lookup and the send job reads the row.
Same default behavior, but what was approved is what ships.

**D5 — Attachments reference storage; they are never copied.** All three
sources end as objects in the private `hoa-documents` bucket, so
`inbox_draft_attachments` stores a `storage_path`. No duplicated bytes and no
cleanup job for abandoned drafts. The cost is that a source object deleted
between attach and send makes the send fail — loudly, before anything is
transmitted, which is the correct failure for "the file you meant to send is
gone."

**D6 — A new message does not pre-create a thread.**
`inbox_threads.gmail_thread_id` is `NOT NULL` under a unique index on
`(mailbox_account_id, gmail_thread_id)`, so a placeholder row would need a
fake id plus a merge-on-conflict path when Gmail returns a real thread id that
already exists. Instead `kind='new'` sends with no `threadId` and the ordinary
2-minute sync ingests the sent message into a real thread — which is exactly
the reasoning already recorded at `mailbox-send.ts:263-272` for sent replies.
The trade-off is that a brand-new conversation takes up to two minutes to
appear in the inbox list; the compose screen says so explicitly.

**D7 — Uploaded bytes never pass through a server action.** Next.js server
actions default to a 1MB request body. A 15MB attachment goes browser → Supabase
storage directly via a short-lived signed upload URL minted by a server action.

**D8 — Total attachment size is capped at 15MB of raw file bytes.** Base64
inflates roughly 33%, so 15MB of files becomes ~20MB on the wire — under
Gmail's 25MB send ceiling with headroom for headers and the body, and under
what most receiving servers accept. Enforced in the composer before upload and
again server-side at approve.

**D9 — No virus scanning.** Nothing in the app scans uploads today, inbound
attachments in `mailbox-attachments.ts` included. Adding it is a separate
project with its own infrastructure. Recorded here as a known gap, not as
something this phase covers.

---

## Data model

Migration `0036_inbox_outbound.sql`:

```sql
ALTER TABLE public.inbox_drafts
  ADD COLUMN kind text NOT NULL DEFAULT 'reply'
    CHECK (kind IN ('reply', 'forward', 'new')),
  ADD COLUMN to_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN mailbox_account_id uuid
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  ALTER COLUMN thread_id DROP NOT NULL,
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind =  'new' AND thread_id IS     NULL AND mailbox_account_id IS NOT NULL) OR
    (kind <> 'new' AND thread_id IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.inbox_draft_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  draft_id        uuid NOT NULL
    REFERENCES public.inbox_drafts(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('upload', 'inbox', 'document')),
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  size_bytes      bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_draft_attachments_draft_idx
  ON public.inbox_draft_attachments(draft_id);

ALTER TABLE public.inbox_draft_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_draft_attachments;
CREATE POLICY board_access ON public.inbox_draft_attachments
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
```

Existing rows all become `kind='reply'` with empty recipient arrays. The send
job treats an empty `to_emails` on a `reply` as "fall back to the last inbound
message", so drafts queued across the deploy boundary still send correctly.
That fallback is the only backward-compatibility affordance and can be removed
once no pre-migration draft remains queued.

`inbox_drafts` gains no `bcc_emails` column, per D3.

---

## Transport — `packages/mailbox`

This package has zero dependencies and hand-rolls MIME deliberately. That does
not change.

### `buildRawMessage`

New optional parameters: `cc: string[]` and
`attachments: Array<{ fileName: string; contentType: string | null; bytes: Buffer }>`.

When `attachments` is empty the function emits the byte-identical single-part
`text/plain` message it emits today. Existing tests pass unchanged and the
common case does not shift. A golden test pins this.

When attachments are present:

```
Content-Type: multipart/mixed; boundary="<boundary>"

--<boundary>
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: 8bit

<body>
--<boundary>
Content-Type: <contentType or application/octet-stream>; name="<fileName>"
Content-Disposition: attachment; filename="<fileName>"
Content-Transfer-Encoding: base64

<base64, wrapped at 76 columns>
--<boundary>--
```

Two safety requirements:

1. The boundary is generated from `crypto.randomBytes` and the function asserts
   it does not occur in the body or in any attachment's base64. A body
   containing the boundary string would let a crafted message forge MIME
   structure.
2. `assertNoHeaderInjection` extends to every `cc` address and every
   `fileName`. A filename is interpolated into a header parameter, so CR/LF in
   one is the same injection hole the existing docstring describes. Non-ASCII
   filenames go through the existing RFC 2047 encoder; a `"` in a filename is
   rejected rather than escaped.

### `sendReply`

Moves from `POST /gmail/v1/users/me/messages/send` with a JSON `{raw, threadId}`
body — which caps the whole request near 5MB, less than a single phone photo —
to `POST /upload/gmail/v1/users/me/messages/send?uploadType=multipart`, which
takes a JSON metadata part (carrying `threadId`, so threading survives) plus a
`message/rfc822` part, and allows 35MB.

`threadId` becomes nullable in the signature; `null` omits it from the metadata
part, which is what `kind='new'` needs.

Everything else about this function is unchanged and deliberately so: it stays
non-idempotent, it stays un-retried, and `MailboxAuthError` still surfaces
distinctly on 401/403. The reasoning in its docstring — that an ambiguous
failure must be a human's decision rather than an automatic resend — applies
identically with attachments.

---

## Server actions — `lib/inbox/draft/actions.ts`

Existing: `createDraft`, `approveDraft`, `cancelDraft`. Added:

| Action | Behavior |
|---|---|
| `createForwardDraft(threadId)` | Inserts `kind='forward'`, `subject = "Fwd: " + thread subject`, body pre-filled with the quoted original, and the thread's `stored` inbound attachments auto-attached as `source='inbox'` rows. No AI call. |
| `createComposeDraft(mailboxAccountId)` | Inserts `kind='new'` with everything empty. |
| `addDraftAttachment(draftId, source, ref)` | `ref` is an `inbox_attachments.id`, an `hoa_documents.id`, or a completed upload path. Resolves it to a `storage_path` under the caller's org, then inserts. |
| `removeDraftAttachment(attachmentId)` | Deletes the row. For `source='upload'` also deletes the storage object, since nothing else references it. |
| `createAttachmentUploadUrl(draftId, fileName, contentType, sizeBytes)` | Validates size against the remaining budget, then returns a signed Supabase upload URL scoped to `inbox-drafts/<orgId>/<draftId>/<uuid>`. |

Two notes on resolving a document-library `ref`. The current file lives on
`hoa_documents.storage_path`; `hoa_document_versions` holds **superseded**
files, so the picker reads `hoa_documents` and never the versions table. And
`hoa_documents` has no content-type column, so `content_type` is inferred from
the filename extension and falls back to `application/octet-stream`. Both
`hoa_documents` and `hoa_document_versions` use `org_id`, not
`organization_id` — the org scoping predicate differs from the inbox tables'.

Every action keeps the file's existing discipline: `requireBoardOrAdmin()`,
`.eq('organization_id', org.id)` on every query, conditional updates rather
than read-then-decide, and no email address, subject, body, or filename in any
log line.

Attachments may only be added to a draft in `status='draft'`. The insert is
conditional on that, so a file cannot be attached to a reply already inside its
undo window.

### `approveDraft` validation

Signature becomes `approveDraft(draftId, { subject, body, to, cc })`. Added
checks, all before the status transition:

- At least one `To` recipient.
- Every address is syntactically valid and contains no CR or LF.
- Addresses are deduplicated case-insensitively across `To` and `Cc`.
- At most 25 recipients total.
- Total attachment `size_bytes` ≤ 15MB.

`hasUnfilledBlanks` continues to run on subject and body for **all** kinds. A
human who types `[[BLANK: money]]` should hit the same gate the model does.

The single UPDATE that stamps `status='queued'`, `approved_by`, and
`approved_at` together is unchanged — it now also writes `to_emails` and
`cc_emails`, still in that one statement, per the invariant in the file's
docstring.

---

## Send job — `packages/jobs/src/mailbox-send.ts`

Changes to `runMailboxSend`, each preserving an existing invariant:

1. The draft select adds `kind`, `to_emails`, `cc_emails`, and
   `mailbox_account_id`, plus a second select of `inbox_draft_attachments` for
   the draft.
2. **Recipients come from the row.** The last-inbound lookup survives but is
   demoted to supplying only `In-Reply-To` and `References`. For `kind='new'`
   it is skipped entirely, and the mailbox account is read from
   `draft.mailbox_account_id` rather than through a thread.
3. The `no_recipient` guard becomes "the draft has no `To` recipients" rather
   than "there is no inbound message to reply to."
4. **Attachment bytes are downloaded before `sendToGmail` is entered.** This
   placement is load-bearing: a storage failure can then call `fail()` safely,
   because nothing has been transmitted. It does not widen the rule that no
   code reached after `sendReply` returns may ever mark a draft `failed` — that
   rule, and the reason for it, are unchanged.
5. `kind='new'` calls `sendReply` with `threadId: null`.

`recordSent` is untouched.

### Marking a forward in the thread view

No new column on `inbox_messages`. `inbox_drafts.gmail_message_id` is stamped
on send, and the sync ingests that same message under the same
`gmail_message_id`, so `getThreadDetail` left-joins `inbox_drafts` on that key
to label a synced outbound message. `MessageThread` renders "Forwarded to
vendor@…" beside the existing "Sent by HOA" badge.

---

## UI — `app/(dashboard)/inbox/`

`DraftPanel.tsx` is 288 lines carrying six states. Adding recipients, an
attachment picker, and two new entry points to it would make it the largest
file in the module and the hardest to reason about. Splitting it is part of
this work:

| Component | Responsibility |
|---|---|
| `Composer.tsx` | The shared editable form: recipients, subject, body, attachment list. One component, used identically by reply, forward, and compose. |
| `RecipientFields.tsx` | Chip-style `To` editor with per-address validation. `Cc` collapsed behind a toggle until used. No `Bcc`. |
| `AttachmentPicker.tsx` | Three sources in one control: upload from computer, this thread's files, the document library. Shows running total against the 15MB budget. |
| `DraftPanel.tsx` | Keeps **only** the state machine (no draft / draft / queued / sending / sent / cancelled / failed) and delegates the editable state to `Composer`. |

Entry points:

- **Forward** button in the thread header (`inbox/[id]/page.tsx`).
- **New email** on the inbox list page, routing to `/inbox/compose`.

The `queued` state gains a recipient list and attachment filenames. During a
30-second undo window, "who is this going to, and with what" is the thing worth
showing.

Existing UI behavior that must not regress: the amber ungrounded banner, the
blanks callouts, the citation list, the `failed`-state warning about possible
double delivery, and the countdown clamp.

---

## Error handling

| Failure | Behavior |
|---|---|
| Upload exceeds remaining budget | Composer refuses before upload, naming the limit and the current total. |
| Upload fails mid-transfer | No `inbox_draft_attachments` row is written. The partial object is orphaned under the draft's storage prefix; deleting a draft's prefix on cancel/send cleans it up, since nothing outside that prefix is ever an upload. |
| Source object deleted between attach and send | Send job calls `fail()` before transmitting; the draft shows "A file attached to this reply is no longer available." |
| Invalid recipient at approve | Inline error on the offending chip; nothing is queued. |
| Gmail rejects the send (413, quota) | Existing path — `fail()` inside `sendToGmail`, with the `failed`-state warning about possible double delivery. |
| `MailboxAuthError` | Unchanged: `fail()` plus `markAuthFailed`. |

---

## Testing

**`packages/mailbox` (unit):**
- Golden test: no attachments produces byte-identical output to the current
  implementation.
- Multipart output parses; the boundary appears in no part's content.
- CR/LF in a `cc` address is rejected.
- CR/LF or `"` in a filename is rejected.
- Non-ASCII filename is RFC 2047 encoded.
- `threadId: null` omits the field from the metadata part.

**`lib/inbox/draft/actions` (unit):**
- Recipient validation: empty `To`, malformed address, duplicate across
  `To`/`Cc`, over 25 recipients.
- Size cap enforced server-side even when the client did not.
- Blanks still block approve on every `kind`.
- `createForwardDraft` quotes the original and attaches only `stored` inbound
  files.
- Attaching to a non-`draft` status matches zero rows.
- Cross-org `ref` in `addDraftAttachment` resolves to nothing.

**`packages/jobs/mailbox-send` (unit):**
- Recipients are read from the draft row, not the last inbound message.
- Pre-migration draft with empty `to_emails` falls back to last inbound.
- `kind='new'` sends with no `threadId` and reads the account off the draft.
- A storage download failure marks `failed` and sends nothing.
- Existing cancel-race and status-guard tests pass unchanged.

**End to end (Playwright):** attach a file, add a Cc, approve, undo within the
window; and forward a thread with its inbound attachment.

---

## Build order

Each step is independently shippable.

1. **Transport.** `buildRawMessage` cc + multipart, `sendReply` upload
   endpoint. Pure, fully unit-testable, no schema change.
2. **Schema + recipients on reply.** Migration 0036, editable `To`/`Cc`, send
   job reads from the row, `Composer`/`RecipientFields` split out of
   `DraftPanel`.
3. **Attachments.** `inbox_draft_attachments`, upload URL, `AttachmentPicker`
   with all three sources, send job download-and-encode.
4. **Forward.** `createForwardDraft`, quoting, auto-attach, thread-view badge.
5. **Compose-new.** `/inbox/compose`, `createComposeDraft`, null-thread send
   path.

## Out of scope

- Virus scanning of uploaded attachments (D9).
- Bcc (D3).
- AI-drafted forwards and new messages (D2).
- Inline images in the composer; attachments are `Content-Disposition:
  attachment` only.
- Rich text. The body stays plain text, as it is today.
- Scheduled send, templates, and canned responses.
