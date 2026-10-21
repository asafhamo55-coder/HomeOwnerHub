# SQL runbook: every pending database step, in order

**For:** Asaf (owner). **Written:** 2026-10-20. **Covers:** OA-1, OA-2, OA-21,
OA-17, OA-4 and OA-3 in `docs/owner-actions.md`, plus the BL-108 AI-spend
index.

Follow this page from top to bottom. Each step says which file to open, which
part to paste, what it does, whether it changes anything, how long it takes,
what you should see, what to send Claude, and what to do if it errors.

Nothing here has been run by Claude. Claude cannot reach the production
database.

---

## Before you start

**How to run one step.**

1. Open the Supabase dashboard for the **production** project.
2. Go to **SQL Editor** and click **New query**. Use a fresh, empty query tab for every step.
3. Paste **only** the part the step names. Claude can copy any step to your clipboard: say "copy step B4".
4. Click **Run**.
5. If Supabase asks "This query contains destructive operations, run anyway?", click to run it. Several steps replace security rules (`DROP POLICY`); that is expected.

**Rules that apply to every step.**

- **Do the steps in order.** A step marked *needs* depends on an earlier one.
- **Never paste a whole file unless the step says "whole file".** Some files have read-only checks, an apply part and rollback notes that must not run together.
- **One query at a time.** The SQL editor shows only the result of the *last* statement in a paste. That is why some checks are split into separate steps.
- **Read-only** steps only look. You can run them as often as you like.
- **If a step errors:** stop, copy the red error text (or screenshot it), and send it to Claude with the step number. Do not continue to a step that *needs* it. Every apply step below is safe to re-run once fixed.
- **If you see `current transaction is aborted`:** run `ROLLBACK;` on its own in a new query tab, then retry the step.
- **What to send back:** where a step says *Send*, copy the result (the **Copy** / **Export CSV** button above the results, or a screenshot) into your message to Claude. No step outputs names, emails, addresses or money tied to a person; you only see ids, counts and true/false.

**Time.** Your database is small. Every step should finish in under 30 seconds; most in 1 to 2. If any step runs for more than 2 minutes, wait for it to finish, then send Claude the result or the error. Do not close the tab mid-run.

**Already done (no action).** Migrations 0060, 0061 and 0062 (the `2026-10-15-*-apply.sql` files) were applied and verified on 2026-10-15. Step A2 double-checks 0061.

---

## Summary

| Section | What | Owner item | Steps | Changes data? | Needs |
|---|---|---|---|---|---|
| A | Security rules sweep (migration 0063) | OA-1 | A1–A4 | Yes (A3) | 0061 (done) |
| B | M1 batch (migration 0064): Stripe fix, document visibility, consent | OA-1 | B1–B5 | Yes (B4) | A |
| C | Resident "Meetings and notices" page | OA-2 | C1 | Yes (adds a function) | A, B |
| D | Text-message consent guard | OA-21 | D1–D3 | Yes (D2, adds a guard) | A |
| E | Inbox "Unverified sender" column | OA-17 | E1–E5 | Yes (E2, adds a column) | A, B |
| F | Speed-up indexes (also covers the BL-108 AI-spend index) | OA-4 | F1–F14 | Yes (adds indexes) | none |
| G | Payment-plan double count correction | OA-3 | G1–G5 | Yes (G4, money records) | none; do last |
| H | Migration 0065: new plan names, plus anything from C, D, E not yet done | BL-123 | H1–H3 | Yes (H2) | A, B; ideally C, D, E |
| I | Migration 0066: owner records requests, the billing-columns guard on orgs, and the Fined / Dismissed violation statuses | BL-123 (3), security finding (orgs_update), live bug (violation status check) | I1–I3 | Yes (I2, widens two checks, adds a column and two guards) | none |
| J | Migration 0067 (batch M3): no late fees on opening balances, inbox snooze and reply clock, link and filing checks, compliance "done" table | BL-136, BL-134, BL-131 | J1–J4 | Yes (J3, adds columns, a table and three automatic rules) | none |
| L | Migration 0069 (batch M5): dues rate schedule (BL-137; more M5 parts may join) | BL-137 | L1–L4 | Yes (L3, adds a table, its rules and two automatic checks) | none |

47 steps in total. Sections A and B are **Urgent**. If you only have ten
minutes today, do A and B.

---

## Section A · Migration 0063, the security rules sweep (OA-1)

File: `docs/specs/2026-10-16-rls-sweep-apply.sql`.

### A1 · Save the current rules (read-only)

- **Paste:** PART 1a (the `SELECT ... FROM pg_policies` query under "PART 1a").
- **Does:** lists the current security rules on 33 tables so they can be restored if ever needed.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** a table of about 46 rows (a different count is fine, Claude reviews it).
- **Send:** the full result as CSV. **Keep a copy yourself.** This is the undo reference.
- **If it errors:** send the error; stop.

### A2 · Check the prerequisites (read-only)

- **Paste:** PART 1b (the single `SELECT` with `swept_tables_present`).
- **Does:** confirms the tables, columns and helper functions 0063 relies on exist.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row. `swept_tables_present` = 33. Every `has_*` and `*_exists` column = `true`, **except** `has_auth_resident_property_ids` (`false` before A3 is normal). `current_policy_count` and `bridge_gaps_open_to_anon` are just information.
- **Send:** the row.
- **If any required column is `false`:** stop and send it. Do not run A3.

### A3 · Apply 0063 (changes the database)

- **Paste:** the **whole file** `migrations/0063_rls_sweep.sql` (one block that starts `DO $mig$` and ends with `END` then `$mig$;`). Ask Claude to copy it for you; it is long.
- **Does:** replaces the "any member of the HOA can see everything" rules with role- and owner-based ones, so residents only see their own records and board-only data stays board-only.
- **Read-only:** no. It is all-or-nothing: if anything inside fails, nothing changes. Safe to re-run.
- **Time:** ~2–5 s.
- **Expect:** "Success. No rows returned". (The notice `0063 ok: 33 tables swept, 127 policies ...` may not be shown by the editor; that is fine, A4 checks it.)
- **Send:** "A3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### A4 · Verify 0063 (read-only)

- **Paste:** PART 3 (the query starting `WITH swept(t) AS`).
- **Does:** checks that every new rule is in place.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row. Every column `true`, plus `policy_count` = 127 and `member_wide_select_tables` = `{associations,communication_templates,hoa_document_versions,hoa_recurring_events,orgs}`.
- **Send:** the row.
- **Flags to flip:** none. 0063 has no app switch; the code already works with it.

---

## Section B · Migration batch M1 (migration 0064) (OA-1)

File: `docs/specs/2026-10-18-m1-apply.sql`. *Needs:* A3 done (B4 refuses to run without it).

### B1 · Prerequisites and counts (read-only)

- **Paste:** PART 1a (the `SELECT` with `has_0063`).
- **Does:** confirms 0063 and 0061 are in, and counts documents, meetings and paying HOAs.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row. `has_0063` = true, `has_0061` = true, `m1_already_applied` = false. Counts are information.
- **Send:** the row.
- **If `has_0063` is false:** go back to Section A.

### B2 · Stored files by kind (read-only)

- **Paste:** the **first** query under PART 1b only (`SELECT bucket_id, ... GROUP BY 1, 2`).
- **Does:** counts stored files by kind (bills, vendor files, submissions, other). Counts only.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** a few rows of counts.
- **Send:** the result.

### B3 · Save the current file-access rules (read-only)

- **Paste:** the **second** query under PART 1b only (`SELECT policyname, cmd, ...`).
- **Does:** lists the current file-storage access rules. This is B's undo reference.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** a list including `org_can_read_hoa_documents`, `org_can_insert_hoa_documents`, `org_can_read_governing_docs`, `org_can_insert_governing_docs`, `org_can_delete_objects`, `org_can_update_objects`.
- **Send:** the result as CSV. **Keep a copy.**

### B4 · Apply M1 (changes the database)

- **Paste:** PART 2, the whole block from `DO $mig$` to the closing `$mig$;`. It is identical to `migrations/0064_m1_batch.sql`; ask Claude to copy it.
- **Does:** fixes Stripe so a paying HOA's plan is saved (today it silently stays Free), adds email-consent records, a "notice posted" date on meetings, a "visible to owners" switch on documents, board-only access to bills and vendor files, reminder-retry counters, and stops a home buyer seeing the previous owner's charges.
- **Read-only:** no. All-or-nothing; safe to re-run.
- **Time:** ~2–5 s.
- **Expect:** "Success. No rows returned".
- **Send:** "B4 done", or the error.
- **If it errors:** nothing was changed. Send the error. A message starting `0064: apply 0061 and 0063 first` means Section A is missing.

### B5 · Verify M1 (read-only)

- **Paste:** PART 3 (the query starting `WITH sp AS`).
- **Does:** checks every M1 change.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row, every column `true`. Run this **before** telling Claude M1 is applied: `stripe_state_empty` is only true until the app starts using the new Stripe tables.
- **Send:** the row, and the words **"M1 is applied"**.
- **Flags Claude flips after B5:** `M1_APPLIED` → `true` in `packages/db/src/m1.ts`, then deploys (hoa, jobs). This switches on the Stripe ordering fix, email consent, notice dates, document visibility and reminder retries.

---

## Section C · Resident "Meetings and notices" page (OA-2)

File: `docs/specs/2026-10-19-resident-meeting-notices.sql`. *Needs:* A and B
(the page is designed around 0063's board-only meeting records).

### C1 · Add the resident meetings function (changes the database)

- **Paste:** the **whole file**.
- **Does:** adds a small read function that gives residents meeting dates and approved summaries only (never transcripts, attendees or motions).
- **Read-only:** no (adds one function). Safe to re-run.
- **Time:** ~1 s.
- **Expect:** one row from the check at the end of the file: `installed` = true, `anon_blocked` = true, `residents_can_call` = true.
- **Send:** the row.
- **If it errors:** send the error. Nothing on the site breaks; the page keeps saying "not available yet".
- **Flags to flip:** none. The page switches itself on, no deploy. (Claude later moves this function into a numbered migration so the test database matches.)

---

## Section D · Text-message consent guard (OA-21)

File: `docs/specs/2026-10-20-sms-consent.sql`. *Needs:* A (the guard closes a
gap in 0063's rules).

### D1 · Pre-check (read-only)

- **Paste:** part 1 (the `select count(*) as sms_on_rows ...` query).
- **Does:** counts residents who already have texts switched on.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row, probably `0 | 0`. Any number is fine; send it.
- **Send:** the row.

### D2 · Add the guard (changes the database)

- **Paste:** part 2 only: from `create or replace function public.resident_sms_opt_in_self_only()` down to and including the `create trigger ... ;` line. **Do not** paste the commented rollback lines.
- **Does:** makes the database refuse any attempt by someone other than the resident to switch that resident's texts on, including by moving a row that already has texts on to a different person. Switching texts off stays open.
- **Already ran an earlier D2?** Run this one again. It replaces the old guard with the current one (the old one did not cover moving a row to someone else).
- **Read-only:** no (adds a function and a trigger). Safe to re-run.
- **Time:** ~1 s.
- **Expect:** "Success. No rows returned".
- **Send:** "D2 done", or the error.

### D3 · Verify (read-only)

- **Paste:** part 3 (`select tgname, tgenabled, ...`).
- **Expect:** one row: `resident_sms_opt_in_self_only | O | true` (O means enabled; `true` means it is the current version). `false` in the last column means an earlier D2 is in place: run D2 again.
- **Send:** the row.
- **Flags to flip:** none.

---

## Section E · Inbox "Unverified sender" column (OA-17)

File: `docs/specs/2026-10-20-inbound-auth.sql`. *Needs:* A and B (so the
next migration number, 0065, stays in order; there is no table conflict).

### E1 · Pre-check (read-only)

- **Paste:** part 1 (the first `select column_name ...` query only).
- **Expect:** no rows (0 rows). One row means it is already applied; skip to E3.
- **Send:** the row count.

### E2 · Add the column (changes the database)

- **Paste:** part 2, from `begin;` down to and including `commit;`.
- **Does:** adds one empty column to stored inbox emails for the sender check result (pass / fail / none).
- **Read-only:** no. No existing data changes. Safe to re-run.
- **Time:** ~1 s.
- **Expect:** "Success. No rows returned".
- **Send:** "E2 done", or the error.

### E3, E4, E5 · Verify (read-only, three separate queries)

Run each of the three queries under part 3 **in its own query tab**:

- **E3** `select column_name, data_type, is_nullable ...` → expect `sender_auth | text | YES`.
- **E4** `select conname ...` → expect one row, `inbox_messages_sender_auth_check`.
- **E5** `select sender_auth, count(*) ...` → expect a single row with an empty `sender_auth` and a count.

- **Send:** all three results, and the words "inbound auth is applied".
- **Flags Claude flips after E5:** `SENDER_AUTH_COLUMN_LIVE` → `true` in `packages/mailbox/src/auth-results.ts`, in the same change as a numbered migration (`migrations/0065_*.sql`) containing this column, so the test database matches production. Deploys hoa and jobs.

---

## Section F · Speed-up indexes (OA-4, and the BL-108 AI-spend index)

File: `docs/specs/2026-10-19-perf-indexes.sql`. *Needs:* nothing; it can run
any time. Order among F1–F12 does not matter.

### F1 to F12 · Create each index (changes the database, one at a time)

- **Paste:** **one** `CREATE INDEX CONCURRENTLY ...` statement per query tab, numbered 1 to 12 in the file (the comment lines above each one may come along; that is fine). **Never two in one paste**: these statements refuse to run inside the editor's multi-statement transaction.
- **Does:** adds a lookup shortcut so busy board and resident pages load faster. The site keeps working while each one builds.
- **Read-only:** no (adds an index). Safe to re-run (`IF NOT EXISTS`).
- **Time:** ~1–10 s each.
- **Expect:** "Success. No rows returned" for each.
- **If one errors with `cannot run inside a transaction block`:** you pasted more than one statement; paste just the one.
- **If one fails or times out:** carry on with the others; F14 shows which to redo.
- **Send:** nothing yet.

The BL-108 file `docs/specs/2026-10-20-audit-log-ai-index.sql` creates the
**same index as F9** (`idx_audit_log_org_action_created`, same name and
columns). Once F9 is done, **skip that file**; running it would do nothing.

### F13 · Refresh statistics

- **Paste:** item 13 at the end of the file (the eleven `ANALYZE` lines, together in one paste).
- **Does:** tells the database about the new indexes so it uses them.
- **Read-only:** effectively (it changes no records). **Time:** ~1–5 s.
- **Expect:** "Success. No rows returned".

### F14 · Verify (read-only)

- **Paste:** item 14 at the end of the file (`SELECT c.relname AS index_name, i.indisvalid ...`).
- **Expect:** 12 rows, every `valid` = true.
- **If a name is missing:** run its F-step again. **If one shows `valid = false`:** run `DROP INDEX CONCURRENTLY public.<that name>;` on its own, then its F-step again, then F14.
- **Send:** the 12 rows.
- **Flags to flip:** none.

---

## Section G · Payment plans that count the balance twice (OA-3)

File: `docs/specs/2026-10-19-payment-plan-double-count.sql`. *Needs:* nothing
technical, but do it last: it is the only step that changes money records,
and it needs a back-and-forth with Claude.

### G1 · Affected plans (read-only)

- **Paste:** PART 1 (the first `WITH linked AS ... ORDER BY u.association_id, p.created_at;`).
- **Does:** lists payment plans made before 2026-10-19 that still double-count.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** ids, dates and cent amounts. Zero rows means nothing to fix: stop Section G here and tell Claude.
- **Send:** the result as CSV.

### G2 · Candidate original charges (read-only)

- **Paste:** PART 2 (the second `WITH linked AS ... ORDER BY plan_id, due_date, assessment_id;`).
- **Does:** for each affected plan, lists the older open charges it probably replaced. `matches_plan_total = true` marks where they add up exactly to the plan.
- **Read-only:** yes. **Time:** ~1 s.
- **Send:** the result as CSV. **Then pause.** Claude proposes which charges each plan replaced; you confirm. Claude then gives you PART 3 with the `INSERT INTO pp_fix` lines filled in.

### G3 · Rehearsal (changes nothing)

- **Paste:** the PART 3 Claude sent you (from `BEGIN;` to the final `ROLLBACK;`), as is.
- **Does:** posts the correcting entries and then throws them away (`ROLLBACK`). A dry run of G4.
- **Read-only:** in effect yes: it ends in `ROLLBACK`, so nothing is saved.
- **Time:** ~1–2 s.
- **Expect:** either "Success. No rows returned" (the editor shows only the last statement, `ROLLBACK`) or the per-association preview. Either means every safety check passed. An error starting `pp_fix ...`, `a listed charge ...` or `an association has no open fiscal period ...` means a check refused; nothing was saved.
- **Send:** what you see.
- **If it errors:** send the error, then run `ROLLBACK;` on its own before anything else.

### G4 · Apply the correction (changes money records)

- **Only after Claude confirms G3.**
- **Paste:** the same PART 3, with the very last line changed from `ROLLBACK;` to `COMMIT;`. Run it **once**.
- **Does:** closes each replaced charge (marked waived) with a balancing journal entry, so the owner's balance counts the money once.
- **Read-only:** no. Running it twice is refused by its own check ("already closed for a plan"), so a double click cannot double-correct.
- **Time:** ~1–2 s.
- **Expect:** same as G3.
- **Send:** what you see.

### G5 · Confirm (read-only)

- **Paste:** PART 1 again (same as G1).
- **Expect:** the plans you corrected no longer appear.
- **Send:** the result.
- **Flags to flip:** none. The board's Payment plans page warning clears by itself.

---

## Section H · Migration 0065 (only the parts not already applied in C/D/E)

File: `migrations/0065_m2_prep.sql`. *Needs:* A and B. Best done after C, D
and E, but it does not matter if some of those were skipped: this file
contains the same SQL as C1, D2 and E2, so it fills in whatever is missing.

What it does, in four parts:

1. **New plan names.** Lets the database store the new pricing plans
   (`essentials`, `complete`, `pilot`, `legacy_per_door`). Without this, the
   new pricing cannot be switched on: a paying HOA's plan would fail to
   save, silently. All existing plan names stay allowed.
2. The resident meetings function (same as **C1**).
3. The text-message consent guard (same as **D2**, current version: it also
   refuses moving a row that has texts on to a different person).
4. The inbox sender-check column (same as **E2**).

Parts 2 to 4 do nothing if C, D and E were already done (part 3 upgrades an
earlier D2 to the current version in place). Running the whole
file is always safe, and running it twice changes nothing.

### H1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regprocedure('public.resident_meeting_notices()') IS NOT NULL AS c_done,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.resident_communication_preferences'::regclass
                    AND tgname = 'resident_sms_opt_in_self_only'
                    AND pg_get_triggerdef(oid) LIKE '%user_id%')         AS d_done,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inbox_messages'
                    AND column_name = 'sender_auth')                     AS e_done,
         pg_get_constraintdef(oid) LIKE '%essentials%'                   AS h_done
    FROM pg_constraint
   WHERE conname = 'orgs_plan_check' AND conrelid = 'public.orgs'::regclass;
  ```

- **Does:** shows which of the four parts the database already has.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row. `h_done` = false. The other three are true for each of C, D, E you completed (`d_done` is false if an earlier D2 is in place; H2 upgrades it).
- **Send:** the row.
- **If every column is already true:** stop, H is done; tell Claude.

### H2 · Apply 0065 (changes the database)

- **Paste:** the **whole file** `migrations/0065_m2_prep.sql`. Ask Claude to copy it ("copy step H2").
- **Does:** adds the new plan names, and any of C, D, E that H1 showed as false.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** ~1–2 s.
- **Expect:** "Success. No rows returned".
- **Send:** "H2 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### H3 · Verify (read-only)

- **Paste:** the H1 query again.
- **Expect:** one row, all four columns `true`.
- **Send:** the row, and the words **"0065 is applied"**.
- **Flags Claude flips after H3:** `SENDER_AUTH_COLUMN_LIVE` → `true` (same as after E5, if not already done). The pricing switch `PRICING_V2` is **not** flipped by this step; it has its own owner item (OA-16), and H3 only removes the database blocker for it.

---

## Section I · Migration 0066, owner records requests

File: `migrations/0066_records_requests.sql`. *Needs:* nothing else in this
runbook. It touches the `tickets` table, which has existed since 0024,
adds a guard to the `orgs` table, and widens one check on `hoa_violations`
(there since 0000). Order against A to H does not matter.

What it does, in five parts:

1. **New ticket category.** Lets a ticket be saved with the category
   `records_request`. An owner's "Request association records" form files
   one. All nine existing categories stay allowed.
2. **New column `tickets.records_due_at`.** This is the deadline set by state
   law for answering that request. It is empty for every other ticket.
3. **Deadline guard.** Only the board, or the app's server, can set or
   change that deadline. An owner filing a request cannot choose their own
   (the app files the request, then sets the deadline itself).
4. **Billing guard on the HOA's account row (security fix).** Today an HOA
   admin could, by calling the database directly instead of using the app,
   change their own plan, billing ids, number of homes billed, or lift a
   suspension. After this, only the app's server (Stripe updates, platform
   admin) can change those. The admin can still rename the HOA. Nothing in
   the app changes, because the app never let admins edit those anyway.
5. **Violation statuses Fined and Dismissed (bug fix).** Today, choosing
   Fined or Dismissed on a violation fails when the board saves it,
   because the database only allows Open, Notice drafted, Notice sent,
   Resolved and Waived. After this it also allows Fined and Dismissed.
   Every existing status stays allowed. No column is added: the fine date
   and resolution note the app writes already exist.

Nothing in the app uses parts 1 to 3 until Claude turns on
`RECORDS_REQUESTS_LIVE` after I3, and the status editor does not offer
Fined or Dismissed until Claude turns on `VIOLATION_FINED_STATUS_LIVE`
after I3. Until then owners and the board see no change (except that
Fined and Dismissed are hidden instead of failing on save).

### I1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.tickets'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) LIKE '%records_request%') AS category_done,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'tickets'
                    AND column_name = 'records_due_at')                     AS column_done,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.tickets'::regclass
                    AND tgname = 'tickets_records_due_at_guard')            AS guard_done,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.orgs'::regclass
                    AND tgname = 'orgs_billing_columns_guard'
                    AND tgenabled = 'O')                                    AS orgs_guard_done,
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.hoa_violations'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) LIKE '%fined%'
                    AND pg_get_constraintdef(oid) LIKE '%dismissed%')      AS violation_status_done,
         (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.tickets'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%category%')              AS category_checks,
         (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.hoa_violations'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%status%')                AS violation_status_checks;
  ```

- **Does:** shows whether the five parts are already there, and how many ticket category checks and violation status checks exist.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `category_done` = false, `column_done` = false, `guard_done` = false, `orgs_guard_done` = false, `violation_status_done` = false, `category_checks` = 1, `violation_status_checks` = 1.
- **Send:** the row.
- **If all five `_done` columns are already true:** stop, I is done; tell Claude. If only some are, run I2 anyway: every part is safe to re-run.

### I2 · Apply 0066 (changes the database)

- **Paste:** the **whole file** `migrations/0066_records_requests.sql`. Ask Claude to copy it ("copy step I2").
- **Does:** replaces the category check with one that also allows `records_request`. It also adds the empty `records_due_at` column, a small index, the deadline guard, and the billing guard on `orgs`, and replaces the violation status check with one that also allows `fined` and `dismissed`.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** ~1 s. No existing row is rewritten.
- **Expect:** "Success. No rows returned".
- **Send:** "I2 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### I3 · Verify (read-only)

- **Paste:** the I1 query again.
- **Expect:** one row: `category_done` = true, `column_done` = true, `guard_done` = true, `orgs_guard_done` = true, `violation_status_done` = true, `category_checks` = 1, `violation_status_checks` = 1.
- **Send:** the row, and the words **"0066 is applied"**.
- **Nothing to flip for part 4:** the billing guard works as soon as it exists. `tests/integration/security/orgs-billing-guard.test.ts` covers it in CI.
- **Flags Claude flips after I3:** both `RECORDS_REQUESTS_LIVE` → `true` (`packages/db/src/records-requests.ts`) and `VIOLATION_FINED_STATUS_LIVE` → `true` (`packages/db/src/violation-statuses.ts`; the status editor then offers Fined and Dismissed, and the BL-130 state law check runs on the move to Fined), then deploys hoa + jobs. `tests/integration/security/violation-statuses.test.ts` covers part 5 in CI. Claude also removes `draft: true` from the two records-request guide articles and runs `pnpm guide:build`.

---

## Section J · Migration 0067, batch M3 (round 3)

File: `migrations/0067_m3_batch.sql`. *Needs:* nothing else in this runbook
(it uses the board/admin check from migration 0012 and the inbox
tables from 0029, both live). Order against A to I does not matter.

What it does, in five parts:

1. **No late fee on opening balances (BL-136).** Adds an empty column
   `assessments.source`. When the board approves opening balances, each
   carried-over charge is marked `opening_balance`, and the nightly 5% late
   fee skips those charges. Every existing charge stays as it is (empty).
2. **Inbox snooze and reply clock (BL-134).** Adds three empty columns to
   inbox conversations: when the first resident email arrived, when the
   board first replied, and "snoozed until". A small automatic rule keeps
   the first two up to date as mail arrives, and a new email from the
   resident un-snoozes the conversation. It fills the first two in once
   for existing conversations.
3. **Link check (BL-134, security).** Today a conversation can be linked to
   any made-up id. After this, a link must point at a real ticket,
   architectural request, violation or message thread **of the same HOA**,
   or the database refuses it.
4. **Filed-from-email link (BL-134).** Adds an empty column on documents
   recording which email attachment a document was filed from, and refuses
   an attachment from another HOA.
5. **Compliance "done" table (BL-131).** A new table holding which state-law
   deadlines the board marked done. Only the board and admins of that HOA
   can see or change it; owners cannot. "Done by" is always the person who
   saved it (a board member cannot put someone else's name on it). The
   "done" marks saved so far stay
   where they are and the app copies them into the table the first time a
   board member opens the dashboard after the switch below.

Nothing in the app reads or writes parts 1, 2, 4 or 5 until Claude turns on
`M3_APPLIED` after J4. Part 3 works as soon as it exists: the app already
checks links the same way, so nobody sees a change.

### J1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'assessments'
                    AND column_name = 'source')                              AS source_done,
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'inbox_threads'
             AND column_name IN ('first_inbound_at', 'first_response_at', 'snoozed_until')) AS thread_columns,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.inbox_messages'::regclass
                    AND tgname = 'inbox_messages_reply_clock')               AS clock_done,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.inbox_thread_links'::regclass
                    AND tgname = 'inbox_thread_links_validate')              AS link_check_done,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'hoa_documents'
                    AND column_name = 'source_inbox_attachment_id')          AS provenance_done,
         to_regclass('public.compliance_deadlines_done') IS NOT NULL          AS done_table_done,
         (SELECT count(*) FROM public.inbox_threads)                          AS threads,
         (SELECT count(*) FROM public.inbox_thread_links l
           WHERE NOT EXISTS (SELECT 1 FROM public.inbox_threads t
                              WHERE t.id = l.thread_id AND t.organization_id = l.organization_id)
              OR (l.resource_type = 'ticket' AND NOT EXISTS (SELECT 1 FROM public.tickets x
                    WHERE x.id = l.resource_id AND x.organization_id = l.organization_id))
              OR (l.resource_type = 'arc_request' AND NOT EXISTS (SELECT 1 FROM public.arc_requests x
                    WHERE x.id = l.resource_id AND x.organization_id = l.organization_id))
              OR (l.resource_type = 'violation' AND NOT EXISTS (SELECT 1 FROM public.hoa_violations x
                    WHERE x.id = l.resource_id AND x.org_id = l.organization_id))
              OR (l.resource_type = 'communication_thread' AND NOT EXISTS (SELECT 1 FROM public.communication_threads x
                    WHERE x.id = l.resource_id AND x.organization_id = l.organization_id))
         )                                                                    AS bad_links;
  ```

- **Does:** shows whether each part is already there, how many inbox conversations exist, and how many existing links would fail the new link check.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `source_done` = false, `thread_columns` = 0, `clock_done` = false, `link_check_done` = false, `provenance_done` = false, `done_table_done` = false, `threads` = some number, `bad_links` = 0.
- **Send:** the row.
- **If `bad_links` is more than 0:** still fine to continue. The check only applies to new or changed links; existing ones are left alone and the app already hides a bad one. Tell Claude the number.
- **If every `_done` column is true and `thread_columns` = 3:** stop, J is done; tell Claude.

### J2 · Existing "done" marks (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT count(*)                                                        AS associations,
         count(*) FILTER (WHERE compliance_settings ? 'compliance_deadline_acks') AS with_done_marks
    FROM public.associations;
  ```

- **Does:** counts associations, and how many have state-law deadlines marked done the old way (these are copied into the new table later, by the app).
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row with two numbers; `with_done_marks` is 0 or small.
- **Send:** the row.

### J3 · Apply 0067 (changes the database)

- **Paste:** the **whole file** `migrations/0067_m3_batch.sql`. Ask Claude to copy it ("copy step J3").
- **Does:** adds the empty columns, the reply-clock rule (and fills it in once for existing conversations), the link check, the filed-from-email check, and the compliance "done" table with its board-only rules.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** a few seconds (the one-time fill touches each inbox conversation once).
- **Expect:** "Success. No rows returned".
- **Send:** "J3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### J4 · Verify (read-only)

- **Paste:** the J1 query again.
- **Expect:** one row: `source_done` = true, `thread_columns` = 3, `clock_done` = true, `link_check_done` = true, `provenance_done` = true, `done_table_done` = true, `threads` and `bad_links` the same numbers as in J1.
- **Then paste, on its own:**

  ```sql
  SELECT count(*)                                         AS threads,
         count(*) FILTER (WHERE first_inbound_at IS NOT NULL)  AS clocked,
         count(*) FILTER (WHERE first_response_at IS NOT NULL) AS answered,
         count(*) FILTER (WHERE snoozed_until IS NOT NULL)     AS snoozed,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'compliance_deadlines_done') AS done_table_rules,
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.compliance_deadlines_done'::regclass
                    AND tgname = 'compliance_deadlines_done_attribution')    AS done_by_rule
    FROM public.inbox_threads;
  ```

- **Expect:** `clocked` close to `threads` (a conversation the board started has no resident email, so it stays empty), `answered` ≤ `clocked`, `snoozed` = 0, `done_table_rules` = 4, `done_by_rule` = true.
- **Send:** both rows, and the words **"0067 is applied"**.
- **Flag Claude flips after J4:** `M3_APPLIED` → `true` (`packages/db/src/m3.ts`), then deploys hoa + jobs. That turns on, together: the opening-balance mark and the late-fee skip, the inbox Snooze control, "Snoozed" list and reply time, "Filed to library" on emails and "filed from an email" on documents, and the compliance "done" table (with the lazy copy of the old marks). `tests/integration/security/m3-batch.test.ts` covers all five parts, including the security rules, in CI.

---

## Section K · Migration 0068, batch M4 (insurance and fine hearings)

File: `migrations/0068_m4_batch.sql`. *Needs:* nothing else in this runbook
(it uses the board/admin check from migration 0012, the org check from
0000 and the "my homes" check from 0061, all live). Order against A to J
does not matter.

What it does, in two parts:

1. **Insurance policies (BL-132).** A new table for the association's
   insurance policies and fidelity bond: type, insurance company, policy
   number, coverage limit, deductible, premium, start and end dates, and an
   optional link to the policy PDF in Documents. Only the board and admins
   of that HOA can see or change it; owners cannot. A document from another
   HOA is refused. "Created by" is always the person who saved it.
2. **Fine hearings (BL-133).** A new table with one hearing record per
   violation: when the owner asked for it (and their written statement),
   the hearing date, time and place, the committee or panel (names, each
   marked board or owner), the day the notice went out, the outcome, and
   the findings and fine-due dates. Only the board and admins of that HOA
   can see or change it. Owners get one thing: a "request a hearing" button
   that works only on a violation on **their own home** that the board has
   sent a notice for, that is still open and not deleted. A violation from
   another HOA is refused. "Created by" is always the person who saved it,
   and only the owner's own button can record an owner's request (a board
   member cannot record one for them).

Nothing in the app reads or writes either table until Claude turns on
`M4_APPLIED` after K4. No existing table is changed.

### K1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.insurance_policies') IS NOT NULL                 AS insurance_done,
         to_regclass('public.violation_hearings') IS NOT NULL                 AS hearings_done,
         to_regprocedure('public.request_violation_hearing(uuid, text)') IS NOT NULL AS request_done,
         to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NOT NULL    AS board_check_ok,
         to_regprocedure('public.auth_org_ids()') IS NOT NULL                  AS org_check_ok,
         to_regprocedure('public.auth_resident_unit_ids()') IS NOT NULL        AS home_check_ok,
         (SELECT count(*) FROM public.hoa_violations)                          AS violations;
  ```

- **Does:** shows whether each part is already there, that the three checks it builds on exist, and how many violations there are.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `insurance_done` = false, `hearings_done` = false, `request_done` = false, `board_check_ok` = true, `org_check_ok` = true, `home_check_ok` = true, `violations` = some number.
- **Send:** the row.
- **If any `_ok` column is false:** stop and tell Claude (K3 would refuse to run, changing nothing).
- **If all three `_done` columns are true:** stop, K is done; tell Claude.

### K2 · Nothing to move (no step)

Both tables start empty. There is nothing to copy across, so there is no K2 query.

### K3 · Apply 0068 (changes the database)

- **Paste:** the **whole file** `migrations/0068_m4_batch.sql`. Ask Claude to copy it ("copy step K3").
- **Does:** creates the two empty tables, their board-only rules, the same-HOA checks, and the owner's "request a hearing" function.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** about a second (both tables are new and empty).
- **Expect:** "Success. No rows returned".
- **Send:** "K3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### K4 · Verify (read-only)

- **Paste:** the K1 query again.
- **Expect:** one row: `insurance_done` = true, `hearings_done` = true, `request_done` = true, every `_ok` = true, `violations` the same number as in K1.
- **Then paste, on its own:**

  ```sql
  SELECT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'insurance_policies')  AS insurance_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'violation_hearings')  AS hearing_rules,
         (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.insurance_policies'::regclass)                 AS insurance_locked,
         (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.violation_hearings'::regclass)                 AS hearings_locked,
         (SELECT count(*) FROM public.insurance_policies)                     AS policies,
         (SELECT count(*) FROM public.violation_hearings)                     AS hearings,
         has_function_privilege('anon', 'public.request_violation_hearing(uuid, text)', 'EXECUTE') AS anon_can_request,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname IN ('insurance_policies_attribution', 'violation_hearings_attribution')) AS attribution_rules;
  ```

- **Expect:** `insurance_rules` = 4, `hearing_rules` = 4, `insurance_locked` = true, `hearings_locked` = true, `policies` = 0, `hearings` = 0, `anon_can_request` = false, `attribution_rules` = 2.
- **Send:** both rows, and the words **"0068 is applied"**.
- **Flag Claude flips after K4:** `M4_APPLIED` → `true` (`packages/db/src/m4.ts`), then un-drafts the guide articles `insurance-policies`, `violations-fine-hearing` and `resident-request-hearing`, and deploys hoa + jobs. That turns on, together: the Insurance page (sidebar under Money), the insurance renewal card on the dashboard and the renewal lines in the board's morning email, the coverage check, the Fine hearing card on each violation (with "Draft hearing notice" into Messages), the state law check reading the hearing record, and the owner's "Request a hearing" on their violation page. `tests/integration/security/m4-insurance.test.ts` and `tests/integration/security/m4-hearings.test.ts` cover both parts, including the security rules, in CI.

---

## Section L · Migration 0069, batch M5 (dues rate schedule)

File: `migrations/0069_m5_batch.sql`. *Needs:* nothing else in this runbook
(it uses the board/admin check from migration 0012, the org check from
0000, the "my homes" check from 0061 and the budgets table from 0006, all
live). Order against A to K does not matter.

What it does (part 1, BL-137; BL-141, BL-143 and BL-145 add their own parts
to the same file when they land, and this section grows with them):

1. **Dues rates (BL-137).** A new table for the association's dues schedule:
   the amount per home, how often it is billed (monthly, quarterly, twice a
   year or yearly), the day it starts, an optional link to the budget it
   came from, and a short note. Only the board and admins of that HOA can
   add, change or remove a rate. An owner can see exactly one row: the rate
   in effect **today** for the association where they own a home (not
   upcoming rates, not other HOAs). Another HOA's association or budget is
   refused. "Created by" is always the person who saved it. Room is left
   for a future per-home-type or per-share rate; nothing uses it yet.

Nothing in the app reads or writes the table until Claude turns on
`M5_APPLIED` after L4. No existing table is changed. No step outputs names,
addresses or emails.

### L1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.dues_rates') IS NOT NULL                          AS rates_done,
         to_regprocedure('public.dues_rates_resident_current_ids()') IS NOT NULL AS owner_view_done,
         to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NOT NULL    AS board_check_ok,
         to_regprocedure('public.auth_org_ids()') IS NOT NULL                  AS org_check_ok,
         to_regprocedure('public.auth_resident_unit_ids()') IS NOT NULL        AS home_check_ok,
         to_regclass('public.budgets') IS NOT NULL                             AS budgets_ok,
         (SELECT count(*) FROM public.associations)                            AS associations;
  ```

- **Does:** shows whether the table is already there, that the four things it builds on exist, and how many associations there are.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `rates_done` = false, `owner_view_done` = false, `board_check_ok` = true, `org_check_ok` = true, `home_check_ok` = true, `budgets_ok` = true, `associations` = some number.
- **Send:** the row.
- **If any `_ok` column is false:** stop and tell Claude (L3 would refuse to run, changing nothing).
- **If both `_done` columns are true:** stop, L is done; tell Claude.

### L2 · Nothing to move (no step)

The table starts empty. Today's dues amounts are not copied in: the board
adds its current rate on the new **Dues rates** page after the switch. There
is no L2 query.

### L3 · Apply 0069 (changes the database)

- **Paste:** the **whole file** `migrations/0069_m5_batch.sql`. Ask Claude to copy it ("copy step L3").
- **Does:** creates the empty dues-rate table, its rules (board writes, owners see today's rate for their own HOA), the same-HOA checks, and "created by" stamping.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** about a second (the table is new and empty).
- **Expect:** "Success. No rows returned".
- **Send:** "L3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### L4 · Verify (read-only)

- **Paste:** the L1 query again.
- **Expect:** one row: `rates_done` = true, `owner_view_done` = true, every `_ok` = true, `associations` the same number as in L1.
- **Then paste, on its own:**

  ```sql
  SELECT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'dues_rates')        AS rate_rules,
         (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.dues_rates'::regclass)                       AS rates_locked,
         (SELECT count(*) FROM public.dues_rates)                           AS rates,
         has_function_privilege('anon', 'public.dues_rates_resident_current_ids()', 'EXECUTE') AS anon_can_read_owner_view,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname IN ('dues_rates_attribution', 'dues_rates_scope')) AS guard_rules;
  ```

- **Expect:** `rate_rules` = 4, `rates_locked` = true, `rates` = 0, `anon_can_read_owner_view` = false, `guard_rules` = 2.
- **Send:** both rows, and the words **"0069 is applied"**.
- **Flag Claude flips after L4:** `M5_APPLIED` → `true` (`packages/db/src/m5.ts`), then un-drafts the guide article `dues-rate-schedule`, updates the "Until dues rates can be saved" line in `accounting-budget-adoption`, and deploys hoa + jobs. That turns on, together: the **Dues rates** page (button on Dues), Generate dues and Add a due starting from the rate in effect (a different amount writes one `dues_rate.override` row to the activity log), the budget adoption checklist's last step opening Dues rates pre-filled from the approved budget, and **Draft owner notice** for an upcoming change (opens Messages; nothing is sent until the board sends it). `tests/integration/security/m5-dues-rates.test.ts` covers the table and its rules in CI.
- **First thing for the board after the flip:** open **Dues → Dues rates** and add today's rate (start day = the day it began), so billing pre-fills from it.

---

## App switches after each section

| After | Switch | Where | Who / how |
|---|---|---|---|
| A | none | — | — |
| B5 | `M1_APPLIED = true` | `packages/db/src/m1.ts` | Claude, then deploy hoa + jobs |
| C1 | none (page turns on by itself) | `apps/hoa/src/lib/resident-meetings/query.ts` detects the function | — |
| D3 | none | — | — |
| E5 | `SENDER_AUTH_COLUMN_LIVE = true`, plus the column in a numbered migration | `packages/mailbox/src/auth-results.ts`, `migrations/0065_*.sql` | Claude, then deploy hoa + jobs |
| F14 | none | — | — |
| G5 | none | — | — |
| H3 | `SENDER_AUTH_COLUMN_LIVE = true` if not done after E5; `PRICING_V2` stays off until OA-16 | `packages/mailbox/src/auth-results.ts` | Claude, then deploy hoa + jobs |
| I3 | `RECORDS_REQUESTS_LIVE = true`; `VIOLATION_FINED_STATUS_LIVE = true`; un-draft `resident-records-request` and `tickets-records-requests` | `packages/db/src/records-requests.ts`, `packages/db/src/violation-statuses.ts`, `apps/hoa/content/guide` | Claude, then deploy hoa + jobs |
| J4 | `M3_APPLIED = true` (one flag for all of 0067: BL-136, BL-134, BL-131) | `packages/db/src/m3.ts` | Claude, then deploy hoa + jobs |
| K4 | `M4_APPLIED = true` (one flag for all of 0068: BL-132, BL-133); un-draft `insurance-policies`, `violations-fine-hearing`, `resident-request-hearing` | `packages/db/src/m4.ts`, `apps/hoa/content/guide` | Claude, then deploy hoa + jobs |
| L4 | `M5_APPLIED = true` (one flag for all of 0069; today BL-137); un-draft `dues-rate-schedule` | `packages/db/src/m5.ts`, `apps/hoa/content/guide` | Claude, then deploy hoa + jobs |

After everything is applied, Claude may regenerate the database types
(`pnpm gen:types`) only once every file in `migrations/` is live, and diffs
columns afterwards (CLAUDE.md footgun 3).

---

## Notes for Claude (checked 2026-10-20)

Dependencies verified by reading each file and the schema:

- **0061 → 0063 → M1.** M1's DO block asserts `auth_resident_property_ids()` (0063) and `auth_resident_unit_ids()` (0061). 0060–0062 are applied (docs/NEXT.md).
- **M1 PART 2 = `migrations/0064_m1_batch.sql`** (diffed; identical apart from one trailing line).
- **C (meeting notices)** reads only 0000/0022 columns (`hoa_meeting_minutes.ai_summary`, `deleted_at`, ...); no hard dependency on 0063/M1, ordered after them as designed. Its returned columns match `RESIDENT_MEETING_COLUMNS` in `apps/hoa/src/lib/resident-meetings/select.ts`, and the function name matches `RESIDENT_MEETINGS_FUNCTION`.
- **D (sms consent)** is compatible with every app writer: the resident's own client (`apps/hoa/src/lib/sms-consent.ts`) sets its own row; the Vonage START path (`apps/hoa/src/lib/sms-inbound.ts`) uses the service role and only rows with a `user_id`.
- **E (inbound auth)** adds `inbox_messages.sender_auth`, matching `apps/hoa/src/lib/inbox/ingest.ts` and `account-context.ts`. The file calls itself "candidate 0065"; `docs/research/2026-10-inbox-plan.md` Phase B is also "0065" (inbox_threads, inbox_thread_links, tickets, arc_requests, hoa_documents). No overlapping table or column, so no conflict: when 0065 is written it must include `sender_auth` idempotently (the apply file already uses `ADD COLUMN IF NOT EXISTS` and a guarded constraint).
- **F** every indexed column exists (checked against `packages/db/src/database.types.ts`); no index name or column set in F collides with anything in `migrations/` (M1 only adds `storage_path` indexes).
- **G** memo formats match `packages/workflows/src/payment-plans/progress.ts` (`INSTALLMENT_MEMO_PREFIX`, `REPLACED_MEMO_PREFIX`).
- **I part 4 (orgs billing guard)** is compatible with every app writer of `orgs`: the guarded columns (`plan`, `stripe_customer_id`, `stripe_sub_id`, `doors_count`, `suspended_at`, `archived_at`, `hub_type`, `organization_type`, `id`, `created_at`) are written only by the service role (`packages/billing/src/webhook.ts`, the 0064 `stripe_webhook_*` functions which only `service_role` may execute, `apps/hoa/src/lib/platform-admin.ts`). No user-client code updates `orgs` at all (checked 2026-10-20); onboarding INSERTs, which the trigger does not cover. The trigger uses no helper function, so it does not depend on A.

Conflicts found:

1. **Duplicate index (benign).** `2026-10-20-audit-log-ai-index.sql` and perf item 9 create the same `idx_audit_log_org_action_created`. Same name and `IF NOT EXISTS`, so whichever runs second is a no-op. Runbook keeps only F9.
2. **Not fixed, needs a migration before `PRICING_V2`:** M1's `orgs_plan_check` allows `free, starter, standard, pro, enterprise, per_case, unlimited, monthly, annual`. The BL-104 code writes `essentials` / `complete` (`packages/billing/src/billing-status.ts` `PLAN_FOR_LOOKUP_KEY`), and the rollout spec plans `pilot` and `legacy_per_door` (`packages/billing/src/pricing-v2.ts`). Those writes would fail with 23514, the same silent failure M1 fixes for `monthly` / `annual`. Not changed in 0064 (it is mirrored in `tests/stripe-sandbox/lib/memdb.ts` and the M1 integration test). Add the values to the check in the next batch, before OA-16 / the `PRICING_V2` flip. **Addressed by `migrations/0065_m2_prep.sql` part 1 (Section H); the memdb copy and the integration tests now pin 0065's list.**
3. **CI drift after C, D and E.** C's function and D's trigger are not in `migrations/`, so the CI database will not have them. `tests/integration/security/resident-meetings.test.ts` asserts that the function is absent. Fold C, D and E into the next numbered migration and update that test when the flags flip. **Done in `migrations/0065_m2_prep.sql` (parts 2–4, verbatim from the spec files); `resident-meetings.test.ts` now expects the function, and `tests/integration/security/m2-prep.test.ts` covers the consent guard, the plan list and the column.**

Spec-file edits made with this runbook:

- `2026-10-19-perf-indexes.sql`: added item 13 (ANALYZE) and item 14 (read-only validity check). `IF NOT EXISTS` silently skips an INVALID leftover from a failed `CONCURRENTLY` build, so the old "run it again" advice could report success while leaving a broken index.
- `2026-10-19-resident-meeting-notices.sql`: added a read-only verify `SELECT` at the end, so a whole-file run shows a checkable result instead of "Success".

Known editor limits handled in the steps, not the SQL: the editor shows only the last statement's result (M1 PART 1b and inbound-auth part 3 are split into separate steps); NOTICE lines (0063, M1) may not be shown; payment-plan PART 3 previews may be hidden behind its final `ROLLBACK`.
