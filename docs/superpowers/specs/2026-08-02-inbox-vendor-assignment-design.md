# Inbox → Vendor assignment and fast-create

**Date:** 2026-08-02
**Status:** Approved design, not yet planned
**Scope:** HOA app, inbox module

## Problem

A thread in the shared inbox can be filed under a property, but not under a
vendor. When a landscaper or plumber emails the association, there is no way to
record which company it came from, no way to see that company's other threads,
and no way to create the vendor without leaving the inbox for the full
onboarding form — which demands an EIN the email will never contain.

## What this delivers

1. File a thread under a vendor, independently of its property filing.
2. Create a vendor from the thread when none exists, using the sender's email,
   display name, and whatever the signature block states.
3. Auto-file future threads from a known vendor address.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What "assign" means | Attribution only | No mail is sent, no work item created. Mirrors filing under a property. |
| Link model | `vendor_id` column on `inbox_threads` | See ADR below. |
| Fast-create bar | `prospect` vendor, EIN and trades optional | An email cannot supply an EIN. |
| Review model | Prefilled form, human confirms | Consistent with DraftPanel — nothing AI-derived is written unreviewed. |
| Duplicates | Type-ahead first, exact-email hard block | Cheap, no false positives. |
| Extraction depth | Email body + signature only | Attachments deferred; see Deferred. |
| Auto-match | Yes, exact sender-email match | Assign a vendor once, not once per thread. |

### ADR: `vendor_id` column, not `inbox_thread_links`

`inbox_thread_links` already exists and a `'vendor'` `resource_type` would need
only a CHECK change. It was rejected: that table has **no foreign key** on
`resource_id`. The comment at `apps/hoa/src/lib/inbox/actions.ts:372` states
this outright — any UUID, "extant or fabricated", can be linked, and whoever
builds the first reader "MUST org-scope that join itself". This feature would
be that first reader, inheriting a known dangling-reference hazard to avoid a
migration.

A column instead mirrors `unit_id`/`resident_id`, which is already how "file
this thread under something" works, and gets real referential integrity.

Accepted cost: one vendor per thread. A thread comes from one company.

A thread may be filed under a property **and** a vendor simultaneously — the
fields are independent.

## Data model

Migration `0037_inbox_vendor_assignment.sql` (0036 is current head):

```sql
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inbox_threads_vendor_idx
  ON public.inbox_threads(vendor_id, last_message_at DESC)
  WHERE vendor_id IS NOT NULL;
```

`ON DELETE SET NULL` plus the partial index copy `unit_id`'s existing
treatment: deleting a vendor unfiles its threads rather than cascading them
away.

No RLS change. `inbox_threads` policies are row-scoped by org, not
column-scoped, and vendor insert policies for board/admin already exist.

### Vendor completeness

A fast-created vendor must not silently flow into 1099 reporting, RFP
invitations, or compliance checks. Completeness is **derived**, not stored:

```
incomplete := ein IS NULL
           OR trades IS NULL
           OR array_length(trades, 1) IS NULL
```

A stored `is_quick_created` boolean was rejected — it can drift out of sync
with the fields it describes. The vendor detail page shows a "Finish setting up
this vendor" banner listing what is missing.

### Write path

`createVendor`'s `CreateVendorSchema` is **unchanged**. It guards the full
onboarding form and requires EIN (9 digits) and ≥1 trade; weakening it would
weaken every caller.

Fast-create gets a separate `QuickCreateVendorSchema`:

- `legal_name` — required, trimmed, min 2
- `primary_email` — required, valid email
- everything else optional

Writes `status='prospect'`, `created_by`, and `ai_generated=true` when any
field came from the model.

Two schemas rather than one with a mode flag: the difference is a real
difference in what the record promises.

## Auto-match

In `matchThread` (`apps/hoa/src/lib/inbox/match.ts`): a separate deterministic
lookup, sender email → `vendors.primary_email`, exact and org-scoped. On a hit,
`applyMatch` sets `vendor_id`.

- Deliberately **outside** `decideMatch`. That function is a confidence ladder
  for property/resident matching; vendor identity is exact-match only. Keeping
  it separate means no new confidence tiers and no perturbation of existing
  matching logic or its tests.
- **Never overwrites a non-null `vendor_id`.** A human's manual assignment
  always wins.
- Independent of the property match — a thread can auto-file to a vendor while
  remaining `needs_review` for a property.

## Extraction — W33-vendor-extractor

New workflow under `packages/workflows/src/W33-vendor-extractor/`, following
W32's shape: `defineWorkflow`, Zod-validated output, `ai_runs` logging,
org-scoped.

**Input:** subject, body text with quoted replies stripped via the existing
`stripQuotedReply`, sender email, display name.

**Output** — every field nullable:

```
legalName, dba, phone, trade,
address { line1, city, state, postal_code }
```

`trade` is a **single** string; `vendors.trades` is `text[]`. `quickCreateVendor`
maps it as `trade ? [trade] : null`. A signature states at most one line of
business, and guessing a second would violate the never-invent rule.

No `website` field: `vendors` has no column for it (see `0007_vendors.sql`),
and this design does not add one.

Two rules, both carried over from W32's behavior:

- **Never invent.** A field the signature does not state returns `null`, not a
  plausible guess. A hallucinated phone number on a vendor record is worse than
  a blank one.
- **No EIN extraction, ever.** An EIN inferred from prose would corrupt 1099
  reporting, and it is never present in a signature block. EIN stays
  human-entered.

One model call, fired only when the user clicks "create new vendor".

## UI

### Rail

A `VendorRail` block renders independently of the property block. `PropertyRail`
early-returns on `thread.unitId`, so the vendor block belongs in `page.tsx`
alongside it — nesting it inside those branches would make an unfiled thread
unable to receive a vendor.

**Unassigned:** `AssignVendorForm`, modeled on `AssignPropertyForm` — type-ahead
(250 ms debounce, ≥2 chars) over `searchVendors`, matching `legal_name`, `dba`,
`primary_email`. A **"No match — create new vendor"** affordance appears only
after a search returns nothing.

**Assigned:** vendor name, trades, `status` badge, "Finish setup" warning when
incomplete, `Open vendor →` link, Change/Unfile control.

### Fast-create modal

Opens instantly with sender email and display name from headers (free,
deterministic). Extraction runs in the background with a "Reading the
signature…" spinner on the fields it will fill.

Fields: legal name, DBA, email, phone, trade, address, notes. `notes` is
human-entered only — W33 never fills it.

Every model-filled field carries a `from signature` provenance chip that clears
once edited. This is what makes "you confirm" real rather than decorative — the
reviewer can see what was guessed versus what came from the header.

Extraction failure or timeout leaves the modal fully usable with email and
display name. **Extraction is an enhancement, never a gate.**

### Duplicate handling

On submit, an exact `primary_email` match within the org blocks the create and
offers *"ABC Landscaping already uses this address — file this thread under them
instead?"* with one-click assign. Enforced **server-side in the action**, not
only in the UI.

## Server actions

`apps/hoa/src/lib/inbox/vendor/actions.ts`, mirroring the `inbox/draft/`
layout. All `requireBoardOrAdmin()`, all org-scoped, all conditional updates.

| Action | Notes |
|---|---|
| `searchVendors(term)` | Type-ahead; empty term returns `[]` |
| `assignThreadToVendor(threadId, vendorId)` | Verifies **both** rows belong to the caller's org before writing |
| `unassignThreadVendor(threadId)` | |
| `quickCreateVendor(input)` | Validates, re-checks duplicate email, inserts, assigns, revalidates `/inbox/[id]` and `/vendors` |
| `extractVendorFromThread(threadId)` | Runs W33 |

`assignThreadToVendor` verifying both rows is not incidental: it is the exact
hazard `linkThreadToResource` had to be patched for — a foreign `vendorId`
must not become linked to this org's thread.

## Error handling

- Extraction failure → blank but usable form, never a blocked create.
- Duplicate email → structured `{ duplicateVendorId }` so the UI can offer
  one-click assign instead of a dead-end error string.
- DB errors log `code`/`message` only, never `.details` — the PII rule from
  `inbox/draft/actions.ts`.
- Never log an email address, subject, or body.

## Testing

- `QuickCreateVendorSchema`: missing email, malformed email, whitespace-only
  name.
- Duplicate-block path returns the existing vendor id.
- Org-scoping: a cross-org `vendorId` must refuse to assign.
- Auto-match never overwrites a manually assigned `vendor_id`.
- Auto-match sets `vendor_id` on exact sender-email hit, and leaves it null
  otherwise.
- W33 returns nulls, not inventions, for a signature-free email.
- W33 never returns an EIN field at all.

## Deferred

- **Attachment extraction.** Originally requested, scoped out of v1. There is no
  general PDF-text utility — `pdf-parse` exists only inside the RFP bid submit
  route. This is the obvious v2: a W-9 attachment is the one place an EIN is
  genuinely knowable, which would close the completeness gap automatically.
- **Vision over scanned documents.** ADR-002 already deferred vision for W21's
  COI extraction; this would cut against that decision.
- **Multiple vendors per thread.** Nothing has asked for it.

## Follow-up spec

Resident-detail editing from the inbox rail (name, email, phone) writing to
`property_residents` and recording `property_events`, reflected on the property
page. Separate spec, to be brainstormed after this one.
