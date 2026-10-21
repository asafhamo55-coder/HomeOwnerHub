# BL-141 election planner ships without a migration

**Date:** 2026-10-21. **Decided by:** the autonomous loop (Asaf's standing "decide, then record" rule).

## Decision

The backlog planned `elections` and `election_candidates` tables in M5 (`0069_m5_batch.sql`). BL-141 is built with **no migration** instead: each meeting's election is a signed record in the primary association's `compliance_settings.meeting_elections[meetingId]`, the same storage and HMAC signing the BL-122 quorum kit uses. Nothing in `0069` or the Section L runbook changes, and the planner is not behind `M5_APPLIED`.

## Why

- **Timing.** The backlog's timing override is Q1 annual meetings. California needs about 90–120 days of lead time (§ 5103 acclamation notice 90 days before nominations close; § 5115 notices and ballots 60 days before the count). Georgia needs 21 days' notice. Waiting for M5 to be applied would cost most of that window.
- **The data is small and member-visible by nature.** Seats, dates, inspector names, candidate names as they appear on the ballot, the home id each was nominated from, on/off the ballot, and the vote counts. Every one of these is sent to every member anyway (CA § 5115(b)(4) candidate list; ballots; results).
- **Nothing sensitive is stored.** The FL § 720.306(9)(b) / CA § 5105 ledger check is computed on each page load and shown to the board only. No balance, no reason a candidate came off the ballot, no email or phone.
- **The pattern already exists and is tested** (quorum kit, director certifications, ARC clock).

## Costs accepted

- Last write wins on `compliance_settings` (read, change, write back), as for the quorum kit.
- At most 4 meetings keep an election (oldest-updated dropped).
- Candidate history across years is not queryable. If that is ever needed (e.g. CA § 5100(a)(2) "at least once every four years" reporting), add the tables then and backfill from the stored JSON.
