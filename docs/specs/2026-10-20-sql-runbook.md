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
| L | Migration 0069 (batch M5): dues rate schedule (BL-137) and join requests (BL-143); more M5 parts may join | BL-137, BL-143 | L1–L4, L-BL143a–c | Yes (L3, adds four tables, their rules, four automatic checks and three join functions) | none |
| M | Migration 0070 (BL-175b): tenant-isolation hardening (SECURITY; apply before any other pending migration) | BL-175b | M1–M5 | Yes (M4, adds 16 same-HOA checks, replaces security functions and rules) | none |
| N | Migration 0071 (batch M6): CPA, attorney and officer roles, invitations, dual control (BL-168; apply after Section M) | BL-168 | N1–N4 | Yes (N3, adds tables, columns and rules; the app stays off until `M6_APPLIED`) | M |
| O | Migration 0072 (batch M7): certified-mail tracking on collection events (BL-166), one-transaction payment recording with unapplied credit (BL-177), admin-only state and type (BL-176; apply after Section N) | BL-166, BL-176, BL-177 | O1–O4 | Yes (O3, adds 4 columns, 1 table, 1 function, 1 rule; the app stays off until `M7_APPLIED`, except the state/type rule, which is on at once) | N |

50 steps in total. Sections A and B are **Urgent**. If you only have ten
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

## Section L · Migration 0069, batch M5 (dues rate schedule, join requests, compliance evidence)

File: `migrations/0069_m5_batch.sql`. *Needs:* Section J done (part 4
adds a column to J's compliance "done" table; L3 refuses to run, changing
nothing, if it is missing). Otherwise it uses the board/admin check from
migration 0012, the org check from 0000, the "my homes" check from 0061,
the budgets table from 0006 and the homes and owners tables from 0004, all
live.

What it does (part 1, BL-137; part 3, BL-143; part 4, BL-145; BL-141
(part 2) adds its own part to the same file when it lands, and this
section grows with it):

1. **Dues rates (BL-137).** A new table for the association's dues schedule:
   the amount per home, how often it is billed (monthly, quarterly, twice a
   year or yearly), the day it starts, an optional link to the budget it
   came from, and a short note. Only the board and admins of that HOA can
   add, change or remove a rate. An owner can see exactly one row: the rate
   in effect **today** for the association where they own a home (not
   upcoming rates, not other HOAs). Another HOA's association or budget is
   refused. "Created by" is always the person who saved it. Room is left
   for a future per-home-type or per-share rate; nothing uses it yet.
3. **Join requests (BL-143).** Three new tables and three new functions.
   An owner whose account isn't linked to a home asks to join it, by its
   street address and ZIP or with a one-time code the board made for that
   home. The request waits in **Approvals**; approving makes them a
   resident and links the home. Only the board and admins of that HOA see
   requests and codes. Codes are stored only as a fingerprint (SHA-256),
   work once and expire. Every ask, matched or not, is counted: 5 a day per
   account. The answer to an address ask is the same whether or not it
   matched a home, so nobody can use it to find out which addresses exist.
   The asker never sees a request row. Hardened before apply (security
   review #3, 2026-10-21): a sign-in email counts as matching the owner
   on file only if the asker confirmed it; only homes in HOA accounts can
   be found by address; nobody can approve their own request; and a
   cancelled code stays cancelled. See **L-BL143** below.
4. **Compliance evidence (BL-145).** One new, optional column on the
   compliance "done" table from Section J: the document (from the HOA's own
   Documents) the board keeps as proof it met a state-law deadline, such as
   the Georgia Secretary of State registration receipt. A document from
   another HOA is refused. Deleting the document clears the link; the
   deadline stays done. Who can see or change it is unchanged: the board
   and admins of that HOA only. Existing rows are untouched (no evidence).
   See **L-BL145** below.

Nothing in the app reads or writes the new tables or column until Claude
turns on `M5_APPLIED` after L4. The only existing table changed is J's
compliance "done" table (one empty column, no rewrite). No step outputs
names, addresses or emails.

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

### L-BL145 · Compliance evidence (part 4)

Three sub-steps. L-BL145a runs **before** L3, L-BL145b is part of L3, and
L-BL145c runs **with** L4.

#### L-BL145a · Pre-check (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.compliance_deadlines_done') IS NOT NULL AS done_table_ok,
         to_regclass('public.hoa_documents') IS NOT NULL             AS documents_ok,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'compliance_deadlines_done'
                    AND column_name = 'document_id')                 AS evidence_done,
         (SELECT count(*) FROM public.compliance_deadlines_done)      AS done_rows;
  ```

- **Does:** checks Section J's "done" table and the Documents table are there, whether the evidence column already is, and counts the deadlines already marked done.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `done_table_ok` = true, `documents_ok` = true, `evidence_done` = false, `done_rows` = some number (often 0 or 1).
- **Send:** the row.
- **If `done_table_ok` is false:** stop. Section J (J3) isn't applied yet; do J first. (If the query itself errors with "relation does not exist", that means the same thing.)
- **If `evidence_done` is true:** part 4 is already applied; carry on with L3 anyway (it is safe to re-run).

#### L-BL145b · Applied by L3 (no separate paste)

Part 4 is in the same file as parts 1 and 3, so pasting the whole file at
L3 applies it. If L3 already ran before part 4 was in the file, run L3
again; it is safe to re-run and only adds what is missing. It adds the column, the link to Documents, an index, and the
same-HOA check. All-or-nothing with the rest of the file.

#### L-BL145c · Verify (read-only, with L4)

- **Paste:** this query, on its own:

  ```sql
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'compliance_deadlines_done'
                    AND column_name = 'document_id')                    AS evidence_done,
         (SELECT is_nullable FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'compliance_deadlines_done'
             AND column_name = 'document_id')                           AS evidence_optional,
         (SELECT count(*) FROM pg_constraint
           WHERE conname = 'compliance_deadlines_done_document_id_fkey') AS evidence_link,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname = 'compliance_deadlines_done_document_org')     AS evidence_guard,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename = 'compliance_deadlines_done')               AS done_rules,
         (SELECT count(*) FROM public.compliance_deadlines_done
           WHERE document_id IS NOT NULL)                               AS with_evidence,
         (SELECT count(*) FROM public.compliance_deadlines_done)         AS done_rows;
  ```

- **Expect:** one row: `evidence_done` = true, `evidence_optional` = `YES`, `evidence_link` = 1, `evidence_guard` = 1, `done_rules` = 4 (J's rules, unchanged), `with_evidence` = 0, `done_rows` = the same number as in L-BL145a.
- **Send:** the row (with L4).

### L2 · Nothing to move (no step)

The table starts empty. Today's dues amounts are not copied in: the board
adds its current rate on the new **Dues rates** page after the switch.
Deadlines already marked done keep no evidence; the board can attach it on
**Compliance** after the switch. There is no L2 query.

### L3 · Apply 0069 (changes the database)

- **Paste:** the **whole file** `migrations/0069_m5_batch.sql`. Ask Claude to copy it ("copy step L3").
- **Does:** creates the empty dues-rate table, its rules (board writes, owners see today's rate for their own HOA), the same-HOA checks, and "created by" stamping; the three empty join-request tables, their rules and the three join functions (L-BL143); and (L-BL145b) the optional evidence column on the compliance "done" table with its same-HOA check.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** about a second (every table is new and empty).
- **Already ran L3 before part 3 (BL-143) was in the file?** Run the whole file again: it is safe to re-run, and it only adds what is missing. Then do L-BL143.
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
- **Then paste L-BL143c** (below), on its own, and check it against its **Expect**.
- **Then paste L-BL145c** (above), on its own, and check it against its **Expect**.
- **L4 is done only when all four rows match:** the L1 query, the query above, L-BL143c and L-BL145c.
- **Send:** all four rows, and the words **"0069 is applied"**.
- **Flag Claude flips after L4:** `M5_APPLIED` → `true` (`packages/db/src/m5.ts`), then un-drafts the guide articles `dues-rate-schedule`, `members-ask-to-join` and `compliance-obligations`, updates the "Until dues rates can be saved" line in `accounting-budget-adoption`, and deploys hoa + jobs. That turns on, together: the **Dues rates** page (button on Dues), Generate dues and Add a due starting from the rate in effect (a different amount writes one `dues_rate.override` row to the activity log), the budget adoption checklist's last step opening Dues rates pre-filled from the approved budget, and **Draft owner notice** for an upcoming change (opens Messages; nothing is sent until the board sends it); for BL-143, **Ask to join** on every resident "No home linked yet" screen and under **Create your HOA**, **Join codes** on Settings → Members, and **Requests to join** in Approvals; and for BL-145, on **Compliance** (sidebar under Knowledge; the page itself is already live, read-only), **Mark as done** with an evidence document, and attaching or changing evidence on a deadline already done. `tests/integration/security/m5-dues-rates.test.ts`, `tests/integration/security/m5-join-requests.test.ts` and `tests/integration/security/m5-compliance-evidence.test.ts` cover the tables, the column and their rules in CI.
- **First thing for the board after the flip:** open **Dues → Dues rates** and add today's rate (start day = the day it began), so billing pre-fills from it.
- **And for join requests:** nothing to set up. Owners who ask show up in **Approvals → Requests to join**; codes are made on **Settings → Members → Join codes**.

### L-BL143 · Join requests (part 3 of 0069)

These are part of L3 (the same file). They are here so you can check part 3
on its own, before and after.

#### L-BL143a · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.owner_join_requests') IS NOT NULL              AS requests_done,
         to_regclass('public.owner_join_codes') IS NOT NULL                 AS codes_done,
         to_regclass('public.owner_join_attempts') IS NOT NULL              AS attempts_done,
         to_regprocedure('public.owner_join_claim(text, text, text, text)') IS NOT NULL AS ask_done,
         to_regprocedure('public.owner_join_decide(uuid, boolean, text)') IS NOT NULL   AS decide_done,
         to_regclass('public.ownerships') IS NOT NULL                       AS owners_ok,
         to_regclass('public.units') IS NOT NULL                            AS homes_ok,
         (SELECT count(*) FROM public.units)                                AS homes,
         (SELECT count(*) FROM public.units WHERE postal_code IS NULL OR postal_code = '') AS homes_without_zip;
  ```

- **Does:** shows whether part 3 is already there, that the homes and owners tables exist, and how many homes have no ZIP code on file.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: every `_done` = false, `owners_ok` = true, `homes_ok` = true, `homes` = some number, `homes_without_zip` = some number (often 0).
- **Send:** the row.
- **If `homes_without_zip` is above 0:** nothing to fix now. Owners of those homes can't ask by address (it needs the ZIP); the board gives them a join code instead, or adds the ZIP on the property page.
- **If every `_done` is true:** part 3 is in; skip to L-BL143c.

#### L-BL143b · Apply (changes the database)

- **Paste:** nothing new — L3 (the whole `migrations/0069_m5_batch.sql`) applies part 3 together with part 1. If L3 already ran before part 3 was in the file, run L3 again; it is safe to re-run.
- **Does:** creates the three empty join tables (requests, codes, the per-account count of asks), their security rules, the fingerprint and same-HOA checks on codes, and the three functions: ask to join, "my asks today", and the board's decision.
- **Read-only:** no. All-or-nothing, like L3.
- **Expect:** "Success. No rows returned".
- **Send:** "L-BL143b done", or the error.

#### L-BL143c · Verify (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'owner_join_codes')     AS code_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'owner_join_requests')  AS request_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'owner_join_attempts')  AS attempt_rules,
         (SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE oid IN ('public.owner_join_codes'::regclass,
                         'public.owner_join_requests'::regclass,
                         'public.owner_join_attempts'::regclass))              AS join_locked,
         (SELECT count(*) FROM public.owner_join_requests)
           + (SELECT count(*) FROM public.owner_join_codes)
           + (SELECT count(*) FROM public.owner_join_attempts)                 AS join_rows,
         has_function_privilege('anon', 'public.owner_join_claim(text, text, text, text)', 'EXECUTE') AS anon_can_ask,
         has_function_privilege('anon', 'public.owner_join_decide(uuid, boolean, text)', 'EXECUTE')   AS anon_can_decide,
         has_function_privilege('authenticated', 'public.owner_join_claim(text, text, text, text)', 'EXECUTE') AS members_can_ask,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname IN ('owner_join_codes_scope', 'owner_join_codes_attribution')) AS code_guards,
         public.owner_join_norm_address('12 Oak Street.') = public.owner_join_norm_address('12 OAK st') AS address_match_ok,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'owner_join_requests'
                    AND column_name = 'requester_email_confirmed')          AS hardened_ok;
  ```

- **Does:** counts the security rules on the three tables, checks they are locked, empty, closed to signed-out visitors, open to signed-in accounts for asking, that the code checks are in place, and that address matching ignores "Street"/"St" and punctuation. `hardened_ok` shows the file you pasted is the version hardened by security review #3 (2026-10-21), not an older copy.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `code_rules` = 4, `request_rules` = 1, `attempt_rules` = 0, `join_locked` = true, `join_rows` = 0, `anon_can_ask` = false, `anon_can_decide` = false, `members_can_ask` = true, `code_guards` = 2, `address_match_ok` = true, `hardened_ok` = true.
- **If `hardened_ok` is false:** an older copy of the file was pasted. Ask Claude for the current file ("copy step L3") and run L3 again; it is safe to re-run. The hardening is in functions and one new column, so re-running replaces the functions and adds the column.
- **Send:** the row (with L4).
- **If `request_rules` is not 1 or `attempt_rules` is not 0:** stop and tell Claude. Requests must be readable by the board only and written by nobody directly; attempts must be readable by nobody.

---

## Section M · Migration 0070, tenant-isolation hardening (BL-175b) (SECURITY, apply before any other pending migration)

File: `migrations/0070_tenant_isolation.sql`. *Needs:* nothing new (it asserts
the tables and functions it touches, and changes nothing if one is missing).
**Apply this before the BL-168 migration**; that one will be renumbered after it.

The problem it fixes: anyone can create their own HOA account and become its
admin. The security rules only checked which HOA a row belongs to, so that
admin could add rows to their own HOA that *point at another HOA's records*
(a neighbour's home, a mailbox, a bank account), and then read or act on them.

What it does, in plain words:

1. **Same-HOA checks.** Sixteen new automatic checks refuse a record that
   points into a different HOA (inbox drafts and threads to a mailbox or
   thread; bank transactions to a bank account; recurring journal entries to a
   template; owners, tenants, residents and homes to their home or property;
   message recipients and threads to their message or thread; dues, violations
   and rent-ledger rows to their property; tickets to a home). They apply to everyone
   including the app's background jobs. **They only look at new and changed
   rows; existing rows are not touched** (M2 counts the bad ones).
2. **"My homes" checks.** The two functions that decide which homes a resident
   may see now require the owner/resident record to be in the *same HOA as the
   home*, require a **confirmed** sign-in email for the email match, and treat a
   blank email as no match.
3. **Message visibility.** A resident sees a message only through a recipient
   record in the message's own HOA.
4. **State-law updates** can be written only by platform admins (and the
   service role), no longer by the board of any HOA. **The in-app "Law updates"
   editor under Legal therefore works for platform admins only.**
5. **Suspended or archived HOAs.** Their members can read and change nothing.
   They still see their own membership and the HOA's name/status (so billing and
   a "suspended" screen can load); billing columns stay locked to the service role.
6. **Function hardening.** The security functions get a fixed search path and
   explicitly return nothing for a signed-out visitor.
7. **AI run log.** Board and admins can read it and update a run's review
   status; nobody can insert or delete rows from the app.
8. **Violation photos and eviction documents** become board/admin-only
   (residents never used them).
9. **Resident attachment paths** must start with `<HOA>/submissions/`.
10. **One HOA per Stripe customer** (a unique index).

Nothing in this section outputs names, emails or addresses: ids and counts only.

### M1 · Prerequisites (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regprocedure('public.auth_is_platform_admin()') IS NOT NULL   AS platform_admin_fn_ok,
         to_regprocedure('public.storage_object_org_id(text)') IS NOT NULL AS storage_helper_ok,
         to_regclass('public.state_statute_changes') IS NOT NULL           AS statute_changes_ok,
         to_regclass('public.submission_attachments') IS NOT NULL          AS attachments_ok,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orgs'
                    AND column_name IN ('suspended_at', 'archived_at')
                  HAVING count(*) = 2)                                     AS org_status_cols_ok,
         to_regclass('public.orgs_stripe_customer_id_uniq') IS NOT NULL    AS already_applied;
  ```

- **Expect:** five `true` and `already_applied` = false.
- **If any `_ok` is false:** stop and tell Claude (M4 would refuse to run, changing nothing). If `already_applied` is true, M is done; run M5.

### M2 · Rows that already break each new same-HOA rule (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT 'inbox_drafts.mailbox_account_id' AS rule, count(*) AS violating_rows
    FROM public.inbox_drafts c JOIN public.mailbox_accounts p ON p.id = c.mailbox_account_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'inbox_drafts.thread_id', count(*)
    FROM public.inbox_drafts c JOIN public.inbox_threads p ON p.id = c.thread_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'inbox_threads.mailbox_account_id', count(*)
    FROM public.inbox_threads c JOIN public.mailbox_accounts p ON p.id = c.mailbox_account_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'bank_transactions.bank_account_id', count(*)
    FROM public.bank_transactions c JOIN public.bank_accounts p ON p.id = c.bank_account_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'recurring_journal_entries.template_je_id', count(*)
    FROM public.recurring_journal_entries c JOIN public.journal_entries p ON p.id = c.template_je_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'ownerships.unit_id', count(*)
    FROM public.ownerships c JOIN public.units p ON p.id = c.unit_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'tenancies.unit_id', count(*)
    FROM public.tenancies c JOIN public.units p ON p.id = c.unit_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'property_residents.property_id', count(*)
    FROM public.property_residents c JOIN public.hoa_properties p ON p.id = c.property_id
   WHERE p.org_id <> c.organization_id
  UNION ALL SELECT 'units.legacy_hoa_property_id', count(*)
    FROM public.units c JOIN public.hoa_properties p ON p.id = c.legacy_hoa_property_id
   WHERE p.org_id <> c.organization_id
  UNION ALL SELECT 'communication_recipients.communication_id', count(*)
    FROM public.communication_recipients c JOIN public.communications p ON p.id = c.communication_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'tickets.unit_id', count(*)
    FROM public.tickets c JOIN public.units p ON p.id = c.unit_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'communication_threads.root_communication_id', count(*)
    FROM public.communication_threads c JOIN public.communications p ON p.id = c.root_communication_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'communications.thread_id', count(*)
    FROM public.communications c JOIN public.communication_threads p ON p.id = c.thread_id
   WHERE p.organization_id <> c.organization_id
  UNION ALL SELECT 'hoa_dues.property_id', count(*)
    FROM public.hoa_dues c JOIN public.hoa_properties p ON p.id = c.property_id
   WHERE p.org_id <> c.org_id
  UNION ALL SELECT 'hoa_violations.property_id', count(*)
    FROM public.hoa_violations c JOIN public.hoa_properties p ON p.id = c.property_id
   WHERE p.org_id <> c.org_id
  UNION ALL SELECT 'pm_rent_ledger.property_id', count(*)
    FROM public.pm_rent_ledger c JOIN public.pm_properties p ON p.id = c.property_id
   WHERE p.org_id <> c.org_id;
  ```

- **Does:** counts, for each new rule, the rows that already point into a different HOA. Counts only.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** sixteen rows, **every `violating_rows` = 0**.
- **Send:** the sixteen rows.
- **If any is above 0:** do not clean it yourself. Those are either planted rows or an old bug. The migration still applies (it checks new and changed rows only, and the new "my homes" functions already ignore such rows), but tell Claude the rule name and count first so the rows can be reviewed and removed.

### M3 · Other things that change for existing users (read-only)

Run these as **separate queries** (the editor shows only the last result).

- **M3a, duplicate Stripe customers (blocks M4 if above 0):**

  ```sql
  SELECT count(*) AS duplicate_stripe_customers
    FROM (SELECT stripe_customer_id FROM public.orgs
           WHERE stripe_customer_id IS NOT NULL
           GROUP BY stripe_customer_id HAVING count(*) > 1) d;
  ```

  **Expect:** 0. If not, **stop**: two HOAs share one Stripe customer; M4 refuses to run until one is fixed. Send the number to Claude.

- **M3b, residents who match only by an unconfirmed email:**

  ```sql
  SELECT count(*) AS residents_with_unconfirmed_email
    FROM public.property_residents pr
    JOIN auth.users au ON lower(au.email) = lower(pr.email)
   WHERE pr.moved_out_at IS NULL AND pr.email IS NOT NULL
     AND au.email_confirmed_at IS NULL;
  ```

  **Expect:** a small number (often 0). Those residents lose their email-matched home view until they confirm their email. Send the number.

- **M3c, HOAs that will lose all member access:**

  ```sql
  SELECT count(*) FILTER (WHERE suspended_at IS NOT NULL) AS suspended_orgs,
         count(*) FILTER (WHERE archived_at  IS NOT NULL) AS archived_orgs
    FROM public.orgs;
  ```

  **Expect:** the HOAs you have suspended or archived on purpose (often 0 and 0). If a *live, paying* HOA appears here, stop and tell Claude.

- **M3d, security functions without a fixed search path (informational):**

  ```sql
  SELECT p.proname
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
   ORDER BY 1;
  ```

  **Expect:** `auth_org_ids` only (M4 fixes it). Send any other name: M4 does not change those.

- **M3e, who writes the law-updates table today (informational):**

  ```sql
  SELECT policyname, cmd FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'state_law_updates' ORDER BY 1;
  ```

  **Expect:** `public_read` (SELECT) and the three `board_or_admin_*` rules; M4 removes the three.

### M4 · Apply 0070 (changes the database)

- **Paste:** the **whole file** `migrations/0070_tenant_isolation.sql` (it is one transaction; say "copy step M4").
- **Does:** everything listed above. All-or-nothing; safe to re-run.
- **Time:** about 2 s.
- **Expect:** `Success`. A notice `0070 ok: tenant isolation hardening applied.` may show.
- **If it errors:** copy the red text to Claude. Nothing is changed (the file is one transaction). The most likely message is the duplicate Stripe customer from M3a.
- **After:** sign in as a board member and as a resident and open the dashboard; both should look unchanged. Platform admins: the Legal > Law updates editor still works for you; other boards now see an error when they save there.

### M5 · Verify (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
           WHERE NOT t.tgisinternal AND p.proname = 'tenant_fk_same_org')        AS same_org_triggers,
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
            AND tablename IN ('ai_runs', 'ai_feedback') AND cmd = 'ALL')         AS ai_all_policies,
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'state_law_updates' AND cmd <> 'SELECT')             AS law_write_policies,
         (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.prosecdef AND p.proname IN ('auth_org_ids', 'auth_is_admin', 'auth_is_board_or_admin',
                'auth_resident_unit_ids', 'auth_resident_property_ids')
            AND p.proconfig @> ARRAY['search_path=public, pg_temp'])             AS pinned_helpers,
         to_regclass('public.orgs_stripe_customer_id_uniq') IS NOT NULL           AS stripe_unique,
         has_function_privilege('anon', 'public.auth_org_ids()', 'EXECUTE')       AS anon_can_call_org_ids;
  ```

- **Expect:** one row: `same_org_triggers` = 16, `ai_all_policies` = 0, `law_write_policies` = 1 (the platform-admin rule), `pinned_helpers` = 5, `stripe_unique` = true, `anon_can_call_org_ids` = false.
- **Send:** the row.
- **If a number is off:** stop and tell Claude.

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
| L4 + L-BL143c + L-BL145c | `M5_APPLIED = true` (one flag for all of 0069; today BL-137, BL-143 and BL-145); un-draft `dues-rate-schedule`, `members-ask-to-join` and `compliance-obligations` | `packages/db/src/m5.ts`, `apps/hoa/content/guide` | Claude, then deploy hoa + jobs |
| O4 | `M7_APPLIED = true` (one flag for all of 0072: BL-166, BL-177; BL-176 needs none) | `packages/db/src/m7.ts` | Claude, then deploy hoa |

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

---

## Section N · Migration 0071, batch M6 (professional and officer roles)

File: `migrations/0071_m6_roles.sql`. *Needs:* Section M (the tenant-isolation migration 0070) applied first and verified (M5 in that section), and Sections A (0063), J (0067) and K (0068) done, because it builds on the money-table rules, the compliance "done" table and the fine-hearing table; N3 refuses to run, changing nothing, if any is missing. Design: `docs/specs/2026-10-26-professional-roles.md` (BL-168). BL-156 and BL-166 append their own parts to the same file when they land, and this section grows with them.

What it does (part 1, BL-168):

1. **New roles.** A member of your HOA can now also be a **CPA** or an **Attorney**. Both must have an end date; once it passes they see nothing. Board members can also carry an **officer title** (President, Vice-President, Secretary, Treasurer, Director), and an attorney can be marked **general counsel**. Board members may now add, renew and remove CPAs and attorneys (before: residents only). Only admins add or change board members and admins, as before.
2. **Professionals are not members.** The shared "members can read" rule used by dozens of tables now lists only admins, board members and residents. A CPA or attorney never inherits it, so they cannot read anything just by belonging to the HOA.
3. **What a CPA reads.** Read-only: the books (accounts, funds, fiscal years, journal entries, ledger, budgets, bank accounts and transactions, reconciliations, charges, payments, bills, payment plans, recurring entries). Owner names come through one function that returns the name and home only, no email, phone or address. Nothing else.
4. **What an attorney reads.** Only the collections cases, violations (and their hearings) and records requests the board assigns, the open charges and payments of those homes, and the board's collections letters for assigned cases. The owner's name and the home's address of an assigned matter come through one function. General counsel also reads the governing documents and the compliance record.
5. **Assignments.** A new table says which attorney sees which matter. The board writes it; an attorney reads their own live rows. The person must be an attorney of that HOA and the matter that HOA's.
6. **Approvals.** `approval_requests` gains a "proposed by" column so a professional can read the status of their own proposals (and nobody else's). A new sign-off table, one function and database rules make every money approval (deposits, scanned bills, opening balances, a CPA's entry) above the board's amount (new column on associations; blank = none) need two different board members who are *currently* admin or board and did not propose it. Changing the item's payload or amount clears its sign-offs, a money item can only be created as "proposed", and only an admin can change the amount (every change is audited).
7. **A professional sees names, not rows, of the org.** They cannot read the organization or association rows at all (no billing ids, no compliance settings); one function returns the organization and association name, and the organization name only once their grant has ended.
8. **The grant is guarded.** A grant runs at most a year at a time (also for us), a membership can't be moved to another person or HOA, every grant, change and removal is audited, and removing a professional ends their matter assignments and rejects what they had waiting in Approvals.
9. **Invitations are the only way in.** The board records an invitation that grants nothing; the person accepts through a signed, single-use link (7 days) while signed in as that confirmed email, and only then is the membership created. A board member or admin can no longer add or upgrade a CPA or attorney directly (only renew, change or remove one). An approval's type and organization can never be changed, and an item from a professional whose access has ended can't be approved until it is renewed (their matters come back with the renewal).
10. Every new function refuses a caller with no sign-in, even if a later blanket grant reopens it to `anon`.

Nothing in the app reads or writes the new columns, tables or functions until Claude turns on `M6_APPLIED` after N4. The only existing tables changed: `org_members` (new columns and checks, the role check, the insert/update/delete rules), `approval_requests` (one nullable column, 2 rules, 3 rules in the database), `associations` (one nullable column and a guard). The shared "members can read" function is replaced (same name and shape). No step outputs names, addresses or emails.

### N1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.matter_assignments') IS NOT NULL                        AS roles_done,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'org_members'
                    AND column_name = 'access_expires_at')                           AS expiry_column_done,
         to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NOT NULL          AS board_check_ok,
         to_regprocedure('public.auth_is_admin(uuid)') IS NOT NULL                   AS admin_check_ok,
         to_regprocedure('public.auth_org_ids()') IS NOT NULL                        AS org_check_ok,
         to_regclass('public.approval_requests') IS NOT NULL                         AS approvals_ok,
         to_regclass('public.collection_cases') IS NOT NULL
           AND to_regclass('public.collection_events') IS NOT NULL                   AS collections_ok,
         to_regclass('public.violation_hearings') IS NOT NULL                        AS hearings_ok,
         to_regclass('public.compliance_deadlines_done') IS NOT NULL                 AS compliance_ok,
         (SELECT count(*) FROM public.org_members)                                   AS members,
         (SELECT count(*) FROM public.org_members
           WHERE role NOT IN ('admin', 'board', 'resident'))                         AS unexpected_roles;
  ```

- **Does:** shows whether M6 is already applied, that everything it builds on exists, and that every member today is an admin, board member or resident.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `roles_done` = false, `expiry_column_done` = false, every `_ok` = true, `members` = some number, `unexpected_roles` = 0.
- **Send:** the row.
- **If any `_ok` column is false:** stop and tell Claude (N3 would refuse to run, changing nothing).
- **If `unexpected_roles` is not 0:** stop and tell Claude; the new role rule would refuse those rows.
- **If both `_done` columns are true:** stop, M is done; tell Claude.

### N2 · Nothing to move (no step)

Every new table starts empty and no existing row changes meaning. Nobody gets a professional role until the board invites one after the switch. There is no N2 query.

### N3 · Apply 0071 (changes the database)

- **Paste:** the **whole file** `migrations/0071_m6_roles.sql`. Ask Claude to copy it ("copy step N3").
- **Does:** adds the two roles, the officer title, the end date and the general-counsel switch to the members table (with their checks); replaces the "members can read" function so professionals are not members; creates the assignments table, the invitation table, the sign-off table and eleven helper functions; adds the proposer column, the dual-control amount and rule; and adds the read-only rules for CPAs and attorneys (listed above).
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** about a second (the new tables are empty; the new columns are added without a rewrite).
- **Expect:** "Success. No rows returned".
- **Send:** "N3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### N4 · Verify (read-only)

- **Paste:** the N1 query again.
- **Expect:** one row: `roles_done` = true, `expiry_column_done` = true, every `_ok` = true, `members` the same number as in N1, `unexpected_roles` = 0.
- **Then paste, on its own:**

  ```sql
  SELECT (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.org_members'::regclass
             AND conname IN ('org_members_role_check', 'org_members_officer_title_check',
                             'org_members_pro_expiry_check', 'org_members_general_counsel_check')) AS member_checks,
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.matter_assignments'::regclass)    AS assignments_locked,
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.approval_signoffs'::regclass)     AS signoffs_locked,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'matter_assignments')                        AS assignment_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND policyname LIKE '%\_cpa\_select')                        AS cpa_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND policyname LIKE '%\_attorney\_select')                   AS attorney_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND policyname LIKE '%\_counsel\_select')                    AS counsel_rules,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname IN ('matter_assignments_scope', 'matter_assignments_attribution',
                            'approval_requests_dual_control', 'approval_requests_money_insert',
                            'approval_requests_0_reset_signoffs', 'approval_requests_00_immutable_identity',
                            'associations_dual_control_guard',
                            'org_members_pro_guard', 'org_members_pro_audit', 'org_members_pro_revoke',
                            'professional_invites_attribution'))                                    AS guard_rules,
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.professional_invites'::regclass)  AS invites_locked,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'professional_invites')                      AS invite_rules,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND policyname IN ('orgs_pro_select', 'associations_pro_select')) AS leaked_read_rules,
         pg_get_functiondef('public.auth_org_ids()'::regprocedure) LIKE '%''resident''%'            AS members_only_list;
  ```

- **Expect:** `member_checks` = 4, `assignments_locked` = true, `signoffs_locked` = true, `assignment_rules` = 5, `cpa_rules` = 17, `attorney_rules` = 7, `counsel_rules` = 2, `guard_rules` = 11, `invites_locked` = true, `invite_rules` = 3, `leaked_read_rules` = 0, `members_only_list` = true.
- **Then paste, on its own:**

  ```sql
  SELECT count(*)                                                    AS helper_functions,
         bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))   AS anon_can_run_any
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('auth_pro_active', 'auth_has_pro_membership', 'auth_attorney_has_matter',
                       'auth_attorney_matter_ids', 'auth_attorney_unit_ids', 'auth_pro_org_ids',
                       'auth_counsel_org_ids', 'cpa_owner_names', 'attorney_matter_party',
                       'record_approval_signoff', 'pro_org_info');
  ```

- **Expect:** `helper_functions` = 11, `anon_can_run_any` = false.
- **N4 is done only when all three rows match:** the N1 query, the query above and this one.
- **Send:** all three rows, and the words **"0071 is applied"**.
- **Before the flip:** set `PRO_INVITE_SECRET` (any random string of 32+ characters) in Vercel **production**. Without it invitations are refused (there is deliberately no fallback to another key).
- **Flag Claude flips after N4:** `M6_APPLIED` → `true` (`packages/db/src/m6.ts`), then un-drafts the guide article `members-invite-professional` and deploys hoa. That turns on, together: **Settings → Professionals** (Invite a professional, who has access, matter assignments, officer titles, the dual-control amount), the CPA's **Accounting & Reports** and the attorney's **My matters** at `/pro`, **From your professionals** in Approvals (a CPA's review note and proposed entry; an attorney's notes, uploads and draft letters), and the Treasurer-first routing and two-board-member rule on scanned bills and CPA entries. `tests/integration/security/m6-roles.test.ts` covers every role and table (allowed, denied, expired) in CI.
- **First thing for the board after the flip:** open **Settings → Professionals**. An admin sets the Treasurer (and other officers) under **Officers**, and the dual-control amount if you want one; until then money approvals behave exactly as today. Then invite your CPA or attorney.


---

## Section O · Migration 0072, batch M7 (mail tracking, one-transaction payments, admin-only state and type)

File: `migrations/0072_m7_batch.sql`. *Needs:* Section N (0071) applied and verified, and Section M (0070) before it, because it reuses the same-HOA check from 0070 and the matter table from 0071; O3 refuses to run, changing nothing, if either is missing. Backlog: BL-166, BL-177, BL-176.

What it does:

1. **Mail tracking (BL-166).** The collections trail (`collection_events`) gets four optional columns: how a notice was sent (certified, statutory overnight, first class, email, hand), the tracking number, the day it was mailed and the day it was delivered. The trail is still add-only: nothing can be edited or deleted, so a delivery you learn about later is a new entry. The existing rules (board adds and reads, an assigned attorney reads, nobody else) already cover the new columns because they apply to the whole row; O3 stops with an error if anyone has since added a rule that lets entries be edited.
2. **One-transaction payments and unapplied credit (BL-177).** A new table `unapplied_credits` holds money received beyond what a home owed (board reads and writes; a resident reads their own home). A new function `record_lump_payment` posts every part of a payment, with its payment row, balanced ledger entry and the charge's new status, in one go: if any part fails, nothing is posted. It refuses a caller who is not signed in, anyone who is not the board or an admin of that HOA, a charge that is not on that home, and any amount above what a charge has left. It cannot be run by anonymous visitors.
3. **Admin-only state and type (BL-176).** A rule on the associations table: only an admin of the HOA (or us, with the service key) can change the state, the governing-law state or the type. A board member's attempt to change them through the API is refused; the other columns stay as they are. **This one takes effect the moment O3 runs.** The Settings → Association form was already admin-only, so nothing changes for you.

Nothing in the app reads or writes the new columns, table or function until Claude turns on `M7_APPLIED` after O4.

### O1 · What is already there (read-only)

- **Paste:** this query, on its own:

  ```sql
  SELECT to_regclass('public.unapplied_credits') IS NOT NULL                          AS credits_done,
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'collection_events'
             AND column_name IN ('mail_method', 'tracking_number', 'mailed_on', 'delivered_on')) AS mail_columns_done,
         to_regprocedure('public.record_lump_payment(uuid, uuid, jsonb, text, date, text)') IS NOT NULL AS function_done,
         to_regprocedure('public.tenant_fk_same_org()') IS NOT NULL                    AS from_0070_ok,
         to_regclass('public.matter_assignments') IS NOT NULL                          AS from_0071_ok,
         to_regclass('public.collection_events') IS NOT NULL                           AS collections_ok,
         to_regclass('public.assessments') IS NOT NULL
           AND to_regclass('public.payments') IS NOT NULL
           AND to_regclass('public.journal_entries') IS NOT NULL
           AND to_regclass('public.ledger_entries') IS NOT NULL                        AS books_ok,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'assessments'
                    AND column_name = 'deleted_at')                                    AS deleted_at_ok,
         (SELECT count(*) FROM public.collection_events)                               AS events,
         (SELECT count(*) FROM public.associations)                                    AS associations,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'collection_events'
             AND cmd IN ('UPDATE', 'DELETE', 'ALL'))                                   AS edit_rules_on_trail;
  ```

- **Does:** shows whether M7 is already applied, that everything it builds on exists, and the row counts to compare against after.
- **Read-only:** yes. **Time:** ~1 s.
- **Expect:** one row: `credits_done` = false, `mail_columns_done` = 0, `function_done` = false, every `_ok` = true, `events` and `associations` = some numbers (write them down), `edit_rules_on_trail` = 0.
- **Send:** the row.
- **If any `_ok` column is false:** stop and tell Claude (O3 would refuse to run, changing nothing).
- **If `edit_rules_on_trail` is not 0:** stop and tell Claude; the trail must stay add-only.
- **If `mail_columns_done` is 1, 2 or 3:** stop and tell Claude (a half-applied attempt).
- **If `credits_done` is true and `mail_columns_done` is 4:** stop, M7 is done; tell Claude.

### O2 · Nothing to move (no step)

The four new columns start empty (no existing entry changes), the credits table starts empty, and no existing association row changes. There is no O2 query.

### O3 · Apply 0072 (changes the database)

- **Paste:** the **whole file** `migrations/0072_m7_batch.sql`. Ask Claude to copy it ("copy step O3").
- **Does:** adds the four mail columns and their checks to the collections trail; creates `unapplied_credits` with its three same-HOA checks and two access rules; creates `record_lump_payment` (locked to signed-in board members and admins, closed to anonymous visitors); adds the admin-only rule on state and type to the associations table; then re-checks all of it and undoes everything if anything is off.
- **Read-only:** no. All-or-nothing (one transaction): if anything fails, nothing changes. Safe to re-run.
- **Time:** about a second (the new columns are added without rewriting the table; the new table is empty).
- **Expect:** "Success. No rows returned" and a notice "0072 ok: M7 applied".
- **Send:** "O3 done", or the error.
- **If it errors:** nothing was changed. Send the error.

### O4 · Verify (read-only)

- **Paste:** the O1 query again.
- **Expect:** one row: `credits_done` = true, `mail_columns_done` = 4, `function_done` = true, every `_ok` = true, `events` and `associations` **the same numbers as in O1**, `edit_rules_on_trail` = 0.
- **Then paste, on its own:**

  ```sql
  SELECT (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.collection_events'::regclass
             AND conname IN ('collection_events_mail_method_check', 'collection_events_tracking_number_check',
                             'collection_events_mail_needs_method_check', 'collection_events_mail_dates_check')) AS mail_checks,
         (SELECT count(*) FROM public.collection_events WHERE mail_method IS NOT NULL
             OR tracking_number IS NOT NULL OR mailed_on IS NOT NULL OR delivered_on IS NOT NULL)   AS rows_with_mail_data,
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.unapplied_credits'::regclass)     AS credits_locked,
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'unapplied_credits')                         AS credits_rules,
         (SELECT count(*) FROM pg_trigger
           WHERE NOT tgisinternal AND tgrelid = 'public.unapplied_credits'::regclass
             AND tgname LIKE '%\_org\_scope')                                                      AS credits_same_hoa_checks,
         (SELECT count(*) FROM public.unapplied_credits)                                            AS credits_rows,
         (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)'::regprocedure) AS function_is_definer,
         (SELECT coalesce(proconfig, '{}') @> ARRAY['search_path=public, pg_temp'] FROM pg_proc
           WHERE oid = 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)'::regprocedure) AS function_path_pinned,
         has_function_privilege('anon', 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)', 'EXECUTE') AS anon_can_run,
         has_function_privilege('authenticated', 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)', 'EXECUTE') AS signed_in_can_run,
         (SELECT count(*) FROM pg_trigger
           WHERE tgrelid = 'public.associations'::regclass AND tgname = 'associations_state_type_guard') AS state_type_rule;
  ```

- **Expect:** `mail_checks` = 4, `rows_with_mail_data` = 0, `credits_locked` = true, `credits_rules` = 2, `credits_same_hoa_checks` = 3, `credits_rows` = 0, `function_is_definer` = true, `function_path_pinned` = true, `anon_can_run` = false, `signed_in_can_run` = true, `state_type_rule` = 1.
- **O4 is done only when both rows match.**
- **Send:** both rows, and the words **"0072 is applied"**.
- **Flag Claude flips after O4:** `M7_APPLIED` → `true` (`packages/db/src/m7.ts`), then deploys hoa. That turns on, together: **how and when it was mailed** on the Georgia collections-letter screen and on the case's "Record an action" form (the attorney's-fee check and the earliest foreclosure date then count from the delivery day, for certified mail or statutory overnight delivery only); **Record payment** posting every part in one go, with a payment method, a date and a note, and keeping any overpayment as a **credit** shown on the home's page and the owner's ledger.
- **First thing for the board after the flip:** print a Georgia notice before attorney's fees, then open **Letters printed for this case** on the collections-letter page and record how and when it was mailed. Until then nothing changes.
