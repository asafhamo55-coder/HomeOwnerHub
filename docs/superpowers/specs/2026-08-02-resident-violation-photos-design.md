# Resident Violation Photos — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Surface:** `apps/hoa` — `app/resident/report-violation` (resident facing)
**Scheduled:** before Phase 1 of
[the properties page uplift](./2026-08-02-properties-page-uplift-design.md)

---

## 1. Problem

A resident standing in front of a problem — an overflowing bin, a fence in
disrepair, a car parked where it shouldn't be — cannot photograph it while
reporting it.

`resident/report-violation/ReportViolationForm.tsx` collects category,
description, address, and occurrence date. It has no file field. The resident
submits, lands on the report, and only *then* can attach a photo from
`resident/violations/[id]`, via the `SubmissionAttachments` component already
mounted there.

So the one moment when the photo is actually available — phone in hand, standing
in front of the thing — is the one moment the product doesn't accept it. A photo
attached later is a photo taken later, or more often not taken at all.

## 2. Goal

A resident can attach one or more photos at report time, from a phone, with the
camera opening directly.

## 3. Non-goals

- No changes to how staff view or moderate reports. Photos surface through the
  existing attachment rendering on `(dashboard)/violations/reports/[id]`.
- No image processing — no resizing, compression, EXIF stripping, or thumbnail
  generation. If it turns out phone photos routinely exceed the existing limit,
  that is a follow-up, not this change.
- No new storage bucket, table, or migration.

## 4. What already exists

Verified against the codebase; this is why the change is small.

| Piece | Location | State |
| --- | --- | --- |
| Upload component | `components/attachments/SubmissionAttachments.tsx` | Working, used on three resident detail pages |
| Upload / delete actions | `lib/submission-attachments.ts` | Working |
| Storage bucket | `hoa-documents` | Exists, RLS from `0003_storage_policies.sql` |
| Attachment table | `migrations/0027_submission_attachments.sql` | Exists |
| Thread type | `'concern'` | Already the type violation reports use — `resident/violations/[id]/page.tsx:61,144` |
| Size limit | 10 MB — `MAX_BYTES` | Exists |
| Allowed types | jpeg, png, webp, **heic**, gif — `ALLOWED_TYPES` | HEIC means iPhone photos already pass |
| Create action | `createViolationReport` | Already returns `ActionResult<{ reportId: string }>` |
| Impersonation guard | `IMPERSONATION_READONLY_MSG` in `createViolationReport` | Photos inherit it |

**No migration, no schema change, no new types.**

## 5. Design

`SubmissionAttachments` uploads against an existing `parentId`, but the form
creates the record on submit. The record must therefore exist before its photos
do. Create-then-upload:

1. **Select.** A file input in `ReportViolationForm.tsx` holds chosen files in
   component state — nothing is uploaded yet. `capture="environment"` so a phone
   opens the rear camera directly rather than the file picker, `multiple` so
   several angles can be attached, and `accept` mirroring `ALLOWED_TYPES`.
   Selected files render as removable thumbnails.
2. **Create.** On submit, `createViolationReport(...)` runs first and returns
   `reportId`.
3. **Upload.** Each held file uploads against `('concern', reportId)`,
   sequentially, reusing `uploadSubmissionAttachment`.

### Why create-then-upload rather than a draft record

Creating a draft submission on first file-pick would let uploads happen inline,
but it introduces a draft state into `resident_submissions` that nothing else
has, and leaves orphaned drafts whenever someone picks a photo and abandons the
form. Create-then-upload adds no persistent state and no cleanup obligation.

### Failure handling

**If an upload fails, the report is already saved.** The resident sees a message
saying the report went through, naming which photos didn't attach, and pointing
at the report page where they can add them. The submission is never rolled back
and the resident is never returned to a form they'd have to fill in again.

This is the same principle applied in the properties spec: never lose the write
because the image failed.

**Size is checked client-side** against `MAX_BYTES` at selection time, so an
oversized photo is rejected immediately with a clear message instead of after a
slow upload over mobile data. The server-side check in
`uploadSubmissionAttachment` remains the authority — the client check is a
courtesy, not a control.

**Multiple files.** Today's `onPick` handles `files?.[0]` — one at a time. The
form-time flow holds an array and uploads sequentially, reporting per-file
outcomes so one failure among four doesn't read as total failure.

## 6. Testing

- Report with no photos still submits exactly as it does today — the most
  important regression to hold.
- Report with one photo, and with several.
- Oversized file rejected at selection, with the server-side limit still
  enforced independently.
- Disallowed MIME type rejected.
- **Upload failure after successful create** — the report exists, the resident
  is told which photos failed and where to add them, and nothing is rolled back.
- Impersonated session cannot submit, matching `createViolationReport`'s existing
  guard.
- Playwright: narrow viewport, file input carries `capture` and `multiple`.

## 7. Risks

- **Phone photo size.** HEIC from a modern iPhone is typically 2–4 MB and fits
  inside the 10 MB limit, but a Pro RAW capture will not. The client-side check
  makes this a clear rejection rather than a mystery failure. If it proves common
  in practice, compression is the follow-up.
- **`capture="environment"` is a hint, not a guarantee.** Desktop browsers ignore
  it and some mobile browsers honor it inconsistently. The file picker is always
  the fallback, so the feature degrades rather than breaks.
