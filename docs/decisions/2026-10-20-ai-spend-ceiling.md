# AI budget per plan: sized caps plus a hard monthly spend ceiling (BL-108)

- **Date:** 2026-10-20
- **Status:** Implemented behind PRICING_V2 (2026-10-20; off, so no effect yet). Accepted by Claude after an Opus advisor review, under the owner's 2026-10-19 delegation. It amends §3 of `2026-10-20-pricing.md`.
- **Applies:** only to orgs on the new Essentials/Complete plans, once `PRICING_V2` is on. Legacy and pre-flip orgs keep today's limits.

## Problem
The pricing decision's guard was "worst-case monthly AI cost ≤ 30% of price, assuming every cap is hit every day at the most expensive call". That left Essentials with 0 board Copilot questions a day, and Complete over 30% even at 25 a day. Real use (a busy 50-door board) is about $1–2 a month, 60–100 times below that assumption.

## Decision
1. **Sizing rule.** Per-bucket daily caps must keep a *heavy-use* month at or below 20% of price. Heavy use means the existing buckets at 25% of their caps, `board_ai` at 30%, the Copilot at 50%, and 8 meeting summaries a month.
2. **Hard ceiling.** Each org has a monthly AI spend ceiling, metered from `audit_log` `ai.usage.*` counts × worst-case per-call estimates (calendar month UTC, cached 60 seconds):
   - **20% of price:** one FYI email to the board.
   - **25% (tier 1):** resident-facing and automatic AI stops (resident_assistant, ask_docs, help_ask, rewrite, arc_precheck, inbox_autodraft). The existing 429 messages apply, and the board gets a banner and an email.
   - **30% (tier 2):** board AI stops too (Copilot, meeting summary, board_ai, follow_up_letter, translate) until the 1st of the month.
   - **Trials** (no card): $5/month in total.
   - **Platform:** an alert, plus a kill-switch env flag, if total AI spend passes $50/day.
3. **Caps.** The existing bucket multipliers and the `board_ai` pool (100 Essentials / 200 Complete) are unchanged. The Copilot and meeting summaries get their own buckets, never the pool:

| Band | Essentials Copilot/day | Essentials summaries/day | Complete Copilot/day | Complete summaries/day |
|---|---:|---:|---:|---:|
| 1–50 | 10 | 2 | 25 | 3 |
| 51–100 | 15 | 2 | 40 | 3 |
| 101–200 | 20 | 2 | 60 | 3 |
| 201–400 and 401+ | 30 | 2 | 100 | 3 |

   Heavy use comes to 13–17% of price at every band. With every cap hit, the total would be 42–50%, but the hard ceiling stops it at 30%.

## Risks and follow-ups
- The per-call estimates are unmeasured. Re-derive them from `ai_runs` within 30 days of launch, and move the meter to actual tokens.
- `audit_log` may need an index on (org_id, action, created_at). That is SQL for the owner if the query is slow.
- Marketing must publish the real caps (for example "Copilot: 10 questions/day" on Essentials), never "unlimited".
- Verify the meeting-summary input cap. The advisor read `MAX_DOCUMENT_TEXT` (500k characters, about $0.02/call); the BL-106 work describes a 30k-character cut (about $0.0024). Use whichever the route actually enforces.

## Implementation notes (2026-10-20)
- **Meeting-summary input cap, verified.** The route accepts up to `MAX_DOCUMENT_TEXT` (500,000 characters), but `summarizeMeeting` sends the model only the first `MEETING_TRANSCRIPT_MAX_CHARS` (30,000). The 30k cut is what binds, so the estimate stays **$0.0024** per call. Both constants are now exported and pinned by tests.
- **Trials.** The $5 is the tier-2 hard stop. The earlier tiers keep their proportions: the FYI email at $3.33 and tier 1 at $4.17.
- **Meter failure.** If the meter can't be read for a new-plan org, the per-bucket caps still apply, the failure is logged with ids only, and AI is **not** blocked.
- **Notices.** Each level's email goes out at most once per calendar month. A claim row `ai.spend.notice.<level>` is written to `audit_log` before sending. Recipients are board-role members only, and the email goes through the guarded `sendEmail`.
- **Kill switch scope.** `AI_PLATFORM_KILL_SWITCH` refuses every call that draws on an AI bucket (`requireAiQuota` / `checkAndRecordAiUsage`). That covers every member-facing AI route and the inbox auto-draft. Model calls that don't meter usage are not covered: the inbox's manual "Draft a reply", background jobs and embeddings.
- **Platform alert.** The daily Inngest job `ai-spend-alert` (00:30 UTC) emails `AI_SPEND_ALERT_TO` when yesterday's estimate passes $50.
