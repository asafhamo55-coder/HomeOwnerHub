# HOA product cycle log

One dated entry per autonomous cycle: what shipped, how it was verified, issues, next.
Backlog: `docs/backlog.md`. Production: www.homeownerledger.com (`/api/health` → `version`).

## 2026-10-15 — Cycle 1

- **Shipped to `claude/quality-oracle`:**
  - BL-001 pricing decision doc.
  - BL-003 mailbox-broken digest.
  - BL-004 outbound guard.
  - BL-005 inbox backfill banner.
  - BL-006/BL-010 resident Pay-by-Zelle, ledger and statement.
  - BL-008 setup checklist.
  - UI overhaul (design system v2).
- **Security:** 0063 RLS sweep (BL-007): 33 tables, 127 policies, plus `property_bridge_gaps` closed to anon. Merged at c7fa7e2.
- **Fix:** resident date off-by-one ("Sep 30" for Oct 1) at 3806a75. Follow-up logged as BL-043.
- **Verified:**
  - typecheck 12/12
  - unit 2402
  - build 4/4
  - integration 324 (at c7fa7e2)
  - CI green
- **Issues:**
  - The prod deploy of 4142bcb hit the Vercel Hobby daily limit.
  - Prod still serves 7aeaa66; the scheduled deploy is 2026-10-16 14:47 EDT.
  - 0063 awaits Asaf's apply, after the code deploy.

## 2026-10-16 — Cycle 2 (started 00:45 EDT)

- **Dispatched:** BL-011 data export, BL-012 actionable empty states, BL-013 dues reminders (off by default, guarded).
- **Health:** prod 7aeaa66 ok (db, ai). CI green on 91c893d.
- **Merged** into `claude/quality-oracle` at ffabc32:
  - BL-012 empty states: 12 routes, ratchet rule 8.
  - BL-011 data export: `/settings/data`, streamed zip, column allowlist, audit row first.
  - BL-013 dues reminders: `/settings/reminders`, off by default, HMAC-signed config, idempotent per (assessment, step), guarded send. I also skip `board_authorized_suit`.
- **Verified** at ffabc32:
  - typecheck 12/12, typecheck:integration ok
  - unit 2500/139 files
  - build 4/4
  - integration 324/13 after `db:local:reset`
- **Screenshots reviewed:** bank 390, documents 1440, settings-data 375 dark.
- **Deploy:** not pushed to prod this cycle because the Vercel daily limit resets around 14:29 EDT. The 14:47 EDT scheduled deploy ships ffabc32 or later.
- **Next:** BL-014 approvals inbox, BL-015 FL §720.303 check, BL-016 board packet. The M1 batch stays open for BL-020.

## 2026-10-16 — Cycle 3 (started 04:45 EDT)

- **Health:** prod still 7aeaa66 ok (Vercel daily limit; scheduled deploy 14:47 EDT). CI green on the working branch.
- **Dispatched:** BL-014 approvals inbox, BL-015 FL §720.303 compliance check, BL-016 monthly board packet.
- **Merged** into `claude/quality-oracle` at 1a01fb4:
  - BL-015 `/legal/compliance` (FL §720.303; quotes validated against the official statute fixture).
  - BL-014 `/approvals`: W18, W3 and W21, reusing executors, with a sidebar badge.
  - BL-016 `/meetings/[id]/packet` with a print stylesheet (dark prints light). It also fixes the 1000-row cap in the accounting reports via `readAll`.
- **Verified** at 1a01fb4:
  - typecheck 12/12, typecheck:integration ok
  - unit 2645/149 files
  - build 4/4
  - integration 327/14 files after `db:local:reset`, including the approve-once test
- **Screenshots reviewed:** compliance 1440, approvals 1440, packet print 816 dark.
- **Deploy:** still waiting on the Vercel daily limit; the 14:47 EDT scheduled deploy ships this.
- **New items:** BL-047 (1000-row cap, high), BL-048 to BL-051. BL-050 joins migration batch M1 with BL-020.
- **Next:** BL-047 (bug), BL-049 resident documents, BL-019 statute-aware letters. M1 (BL-020 + BL-050) is ready to batch.

## 2026-10-16 — Cycle 4 (started 08:45 EDT)

- **Health:** prod 7aeaa66 ok; CI green on 6ea7f57. Scheduled prod deploy 14:47 EDT.
- **Dispatched:**
  - BL-047 1000-row cap sweep (bug)
  - BL-049 resident documents
  - BL-019 statute-aware violation letters
- **Held:** migration batch M1 (BL-020 + BL-050) until 0063 is applied, so Asaf has one SQL set in flight at a time.
- **Merged** into `claude/quality-oracle` at ca2ed89:
  - BL-019 statute-aware letters: FL rules checked against the official fixture; CA unverified, so it says "verify"; refusals before any model call.
  - BL-047 row-cap sweep: about 20 sites. It also closes a late-fee double-charge risk and wrong period-close amounts. A ratchet test now blocks the pattern.
  - BL-049 `/resident/documents`: default-deny type allowlist, 60-second signed URLs, and the "Posted for owners" status on `/legal/compliance`.
- **Verified** at ca2ed89:
  - typecheck 12/12, typecheck:integration ok
  - unit 2755/162 files
  - build 4/4
  - integration 331/15 files after `db:local:reset`, including the resident-documents security test
- **Screenshots reviewed:** violations approval queue 375, resident documents 375.
- **New items:** BL-052 (DB-enforced document visibility, security, M1), BL-053, BL-054.
- **M1 batch** is now BL-020 + BL-050 + BL-052. It is built after 0063 is applied.
- **Next:** M1 batch (once 0063 is in), BL-048 W3 one-click approve, BL-053.

## 2026-10-16 (afternoon) — security deploy + route conventions

- **Shipped to prod:** 0439e1e. All three apps report it on /api/health; the Vercel statuses for all three say "completed". This adds the signed, org-bound owner-portal impersonation fix (S-01) and the amended 0063 file, which Asaf has not applied yet.
- **Merged, not deployed:** 0b05f1e. These are the route-handler conventions: the skill, the shared lib/api helpers, a JSON 401 for /api/*, and 21 of 29 routes brought into line. Every gate passes and CI is green. They ship in the next deploy.
- **Not merged:** 8 route fixes the skeptic review rejected. They stay on claude/routes-fix/*-r2: ask-community, cron/recurring-events, health, plaid/exchange, rfp-bid submit, vendor-onboard submit, webhooks/resend, and webhooks/stripe (whose 0064 can drop a paying org to the free plan).
- **Blocked:** the FL law refresh can't be triggered from here. INNGEST_EVENT_KEY is a sensitive Vercel variable that pulls empty, and the admin route needs a platform-admin session. Asaf needs to trigger it from his browser.
- **Next:** 0063 apply (Asaf), deploy 0b05f1e, rework the 8 refuted routes, then the M1 migration batch.

## 2026-10-16 (evening) — cycle 5

- **Built and merged into claude/quality-oracle** (local gates all pass: typecheck 12/12, typecheck:integration, unit 3342/3342, build 4/4, integration 348/348 after reset):
  - BL-048: approve or reject violation letters from /approvals, reject vendors, and per-association vendor counts. The badge no longer counts a vendor twice. Approving files an open violation and sends nothing.
  - BL-053: the last 1000-row caps (CSV exports, invoice payment entry, payment plans, platform-admin metrics, recurring-events worklist), and removed `getDashboardStats`. It also fixes the platform-admin document count, which counted every tenant's documents.
  - Route conventions, round 3: health, rfp-bid submit, vendor-onboard submit and recurring-events now follow the skill. An annual event moves forward a year only after a real delivery.
- **Not deployed:** the push of e92da24 to the production branch was refused by the permission classifier. Prod stays on 0439e1e until the owner allows the push.
- **New items:** BL-055 to BL-057.
- **Next:** deploy (needs the owner's OK), 0063 apply (Asaf), then the M1 batch (BL-020, BL-050, BL-052, and the Stripe 0064 fix).

## 2026-10-16 (night) — cycle 6

- **Built and merged into claude/quality-oracle** (all gates pass: typecheck 12/12, typecheck:integration, unit 3584/3584, build 4/4, integration 348/348 after reset):
  - **BL-022, ⌘K record search:** the new board-only `/api/search` covers owners, units, violations, ARC, tickets, threads and vendors. It runs on the user's RLS client, and residents get 403.
  - **BL-021, AI bill scan:** a bill upload becomes a "Bills to enter" approval, and approving enters it through `enterBill`. Workflow W36. Only a fake model has been tested.
  - **BL-055, route conventions round 4:** ask-community (coded tool errors, a camelCase public shape, owner contact shown only to board), plaid/exchange (a write order that can be undone), and webhooks/resend (our own Message-ID, with the reply fetched through Resend's received-email API).
- **Deploy:** blocked by the permission classifier. Prod is serving d060e08, which this loop did not push; the owner is asked to confirm where it came from.
- **New items:** BL-058 to BL-062. BL-058 (stored bills readable by residents) joins the M1 storage policies.
- **Next:** BL-051 board packet follow-ups, BL-043 association timezone, BL-056 invitation follow-ups. M1 waits on 0063.

## 2026-10-17 — cycles 7 and 8

- **Built and merged** (all gates pass at the tip: typecheck 12/12, typecheck:integration, unit 3733/3733, build 4/4, integration 348/348 after reset, first try):
  - **c7:**
    - **BL-043/044:** "today" is the association's day, worked out from its state; one helper shared by apps/hoa and jobs.
    - **BL-045:** all CSV goes through `lib/csv.ts`, which has the formula guard, plus a ratchet test.
    - **BL-046:** an inline "Set up your association" form creates the association, its funds, the chart of accounts and the fiscal year. The platform-admin `createTenant` association insert is fixed.
    - **BL-056:** the invitation pages show a "try again" state, invitation errors use codes, events-alerts checks every write, and the alert retry cap is 3.
  - **c8:**
    - **Integration flake root cause:** the Mac idle-slept in the middle of a run (pmset `sleep 1`), and overlapping runs shared one local DB. The suite now holds a sleep block and an advisory lock, and `truncateAll` is async with a lock timeout. 3 clean runs.
    - **BL-057:** approval-queue buttons, an `approveVendor` gate, and analytics as head counts.
    - **BL-060:** ⌘K rows show status and day, documents and meetings are searchable, and the inbox property link (a unit id where a property id was expected, giving a 404) is fixed.
- **Issue:** dc1cf0a went red in CI. My merge fix changed `readPrimaryAssociation`'s output without updating its test. Fixed in 43ce04a, which is green.
- **Deploy:** still blocked by the classifier, and prod is on d060e08.
- **Next:** BL-064 open-the-books, BL-065 time zone leftovers, BL-066 overflow, and clean up about 90 stale agent worktrees.

## 2026-10-17 (afternoon) — deploy resumed, cycle 9 part 1

- **Owner authorization:** commit, push and deploy to prod at any time, at most once per hour. The cycle cron is now hourly and deploys gated tips.
- **Merged:** Asaf's d060e08 (the api-audit-fix skill, pushed straight to prod), BL-064 "Open the books", and BL-065 (time zone leftovers: the events pages and the recurring-events cron together, recurring-jes per association, form date defaults, and the heat-map grid built from calendar dates).
- **Gates at bb1418e:** typecheck 12/12, typecheck:integration, unit 3788/3788, build 4/4, integration 348/348.
- **Deployed bb1418e to prod** (cycles 5–9). /api/health reports bb1418e, and the Vercel statuses say completed on hoa, pm and eviction.
  - Smoke checks: /login 200; / and /dues 307 to login; /api/search and /api/accounting/bill-scan give a 401 JSON envelope.
  - The public /api/health body is now {ok, app, version}. The detailed probes need the bearer key.
- **Next:** merge BL-066 (overflow and T-07) when it reports, then BL-059 bill-scan edits, BL-051 board packet, BL-062 owner contact sent to the AI.

## 2026-10-17 (16:00) — cycle 9 done, cycle 10 started

- **Deployed c56061f:** BL-066 (admin analytics donut cards now lay out by the card's own width) and T-07 (the bill-scan test reads the W36 constant from source, so it no longer imports the workflows package).
  - Gates: unit 3789/3789, integration 348/348, build 4/4.
  - Live at 15:55 on /api/health. /login 200, /dues 307, /api/search 401.
- **Push quirk:** a prod push made right after pushing claude/quality-oracle fails once and works on retry. Retry once before treating it as a failure.
- **Cycle 10 dispatched:** BL-059 (edit bill fields before approving, and the ?type=bill filter), BL-062 plus a sweep (no owner email or phone in AI prompts), BL-051 (board packet as of month-end, and the TZ leak T-05).

## 2026-10-17 (17:03) — deploy 69361f7

- **Live:** BL-051 (the board packet is as of month end), BL-062 (no owner email or phone sent to the AI; inbox drafts redacted; W21 sends no W-9 identity), BL-059 (bill edits before approval; the sign-in redirect keeps the query), and the auth-callback open-redirect fix. Also the release-notes pipeline (.github/workflows/release-notes.yml) and the first two release notes.
- **Gates:** unit 3886/3886, integration 348/348, build 4/4, typecheck:scripts.
- **Smoke:** /login 200, /dues 307, /api/search 401.
- **Release-note email:** the workflow fired on deployment_status. The hoa run was queued; the pm/eviction runs were skipped. It can't send until the owner adds the GitHub secrets.
- **Merged after the deploy, gating now:** properties P0 (653df38). Every create, update and delete writes both records, a unit-id URL redirects to the property, there's a ratchet for direct bridge reads, the import writes both sides, and the dues dead-end is fixed.
- **In flight:** properties P1 quick wins, BL-071 version indicator, BL-070 guide phase 1 day 1.

## 2026-10-17 (18:13) — deploy 809b442: properties rebuild part 1

- **Live:** properties P0 and P1.
  - Every home is one record: create, update, archive and import write both sides. A unit-id URL redirects to the property. The dues dead-end is fixed.
  - Search covers every home, with All as the default view and a Filters menu.
  - Contact actions; addresses link to the property everywhere; `?property=` scopes Violations, Dues and Leases.
  - The violation wizard picker no longer preselects a home.
  - Archive with warnings, a Cure-by column, and a compact mobile header.
  - The sign-in redirect keeps the query string.
- **Gates at d1e2143:** unit 4013/4013, integration 354/354, build 4/4. CI green.
- **Release-note email:** sent (status `release-notes/email` success at 22:13Z). The 69361f7 and c56061f notes were also sent, by manual dispatch, after the GitHub secrets were set from Vercel.
- **Push quirk:** the first one or two prod pushes fail and a retry works. Keep retrying up to 3 times.
- **Next deploy allowed after 19:13.** Queued for it: BL-070 guide phase 1 (being rebased) and BL-071 version indicator.

## 2026-10-17 (21:04) — deploy ac0e7c4: user guide phase 1 (BL-070) and version label (BL-071)

- **Live:**
  - /help and /resident/help: search, 12 articles and "Take me there".
  - The "?" help drawer on every page (Shift+/).
  - The guide:check CI gate.
  - At 19:55 (2ed5d8b): the version label everywhere and the /whats-new page.
- **Gates:** unit 4092/4092, build 4/4, guide:check 0 errors (2 stale-shot warnings), CI green, including integration on CI's throwaway Supabase.
- **Owner rule:** no local DB from now on. Integration runs in CI only, and the local Supabase stack is stopped.
- **Release-note email:** sent.
- **In flight:** BL-074 performance, BL-073 month-end board report.

## 2026-10-17 (22:33) — deploy 80ecc63: BL-074 speed and BL-073 month-end board report

- **Region:** functions moved from iad1 to pdx1. `x-vercel-id` now reads `iad1::pdx1` (an East Coast edge, then an Oregon function next to the Supabase DB).
- **/api/health TTFB from the owner's area, 5 runs:**
  - before: 308–538 ms (warm);
  - after: 279–372 ms.
  - The page-level gain is bigger but can't be measured unauthenticated. The ~70 ms cross-country trip is gone from every DB call, and calls per navigation fell from 5–18 to 2–6.
- **Smoke checks:** /login 200 (688 ms cold), /accounting/reports 307 (216 ms).
- **Release-note email:** sent.
- **Merged locally after the deploy:** BL-072 (guide-found bugs, incl. an SMS link that got cut off). Day 2 of the guide is ready to merge.
- **Open:**
  - Confirm that support@homeownerledger.com is a real inbox.
  - `AI_MODEL_FAST` is unset in prod, so Ask the guide uses the team AI_MODEL (120b). It works, just slower. Leaving it as is.

## 2026-10-17 (23:41) — deploy b31729f: Ask the guide (BL-070 day 2) and BL-072 fixes

- **Live:**
  - /api/help/ask, grounded in the guide: it refuses below the score gate, routes rules questions to Ask the Docs, and never logs the question.
  - Ask UI in /help and the drawer.
  - "How?" links on the checklist and empty states, ⌘K help, and the What's new dot.
  - BL-072: the SMS portal link stays intact, an "Open the books" notice replaces developer text, Ask the Docs citations show again, the SMS hint is accurate, the invite hint follows the role, and the setup import link is fixed.
- **Smoke:** /help 307, /login 200, POST /api/help/ask without a session gives a 401 JSON envelope.
- **Merged and pushed for CI (next deploy after 00:41):**
  - properties P2: full-width table and the property 360 page;
  - properties P4: a roster import the board runs itself.
  - Local gates: unit 4506/4506, build 4/4, guide:check 0 errors, guide:eval pass.

## 2026-10-18 (00:53) — deploy 68106bf: properties 360 and board roster import

- **Live:**
  - P2: a full-width sortable table, and the property 360 page (action bar, Needs action, People, Money, Compliance, Leases, Communications, Activity; Log note).
  - P4: /properties/import (CSV and XLSX, CINC preset, dry run, Skip or Update, chunked writes, error CSV).
- **Smoke:** /properties 307, /properties/import 307, /login 200.
- **Release-note email:** sent.
- **Merged and pushed for CI (969622e):**
  - BL-075: the ui-shots CI workflow. Its first run is on this push.
  - BL-042 round 2 marketing truth pass:
    - one pricing source matching checkout ($4.99/door, 41-door minimum);
    - false claims removed;
    - composite testimonials removed by the coordinator.
- **Open:**
  - Billing rounding: the in-app annual figure is $9,700.56 but Stripe charges $9,698.40 at 180 doors.
  - Unverified marketing numbers (Madison Park figures, conversion rates, uptime) are left for the owner.

## 2026-10-18 (02:03) — deploy 5116b2d: record a sale, marketing truth pass, ui-shots CI

- **Live:**
  - P3 record a sale: closes the seller's ownership, opens the buyer's, ends the seller's portal access, and the buyer sees only post-sale charges in the app.
  - BL-042: marketing pricing from one source that matches checkout; false claims and composite testimonials removed.
  - BL-075: the ui-shots CI workflow.
- **First ui-shots CI run:**
  - login, seeding and 281 overflow checks worked;
  - 1 real overflow, vendors @375 (the search form couldn't shrink): fixed;
  - the .ui-shots artifact wasn't uploaded because upload-artifact skips dot-dirs: fixed with include-hidden-files;
  - the refresh PR was blocked by a repo setting. Enabled (Actions may create PRs; default token stays read-only).
- **Merged and pushed for CI:**
  - BL-029: budget first draft from last year plus actuals, and billing displays equal Stripe's unit amount × quantity.
  - BL-024/027: ARC AI pre-check for residents and a cited board review in /approvals (W37).
- **New items:** BL-076 to BL-079, including BL-077, a high-priority accounting bug: closing entries net closed-year actuals to about zero in reports.

## 2026-10-18 (03:21) — deploy 4c88f89: ARC AI, budget draft, exact billing

- **Live:**
  - BL-024/027: W37 ARC pre-check for residents, and an AI review on the board side, also listed in /approvals.
  - BL-029: budget first draft.
  - Billing displays now equal unit_amount × quantity.
  - The vendors @375 overflow is fixed.
- **Smoke:** /arc 307, /accounting/budget/draft 307, /login 200, POST /api/ai/arc-precheck without a session gives 401 JSON.
- **UI shots CI, second run:**
  - artifacts uploaded: 449 shots, 108 MB;
  - the guide refresh PR #6 opened automatically;
  - one overflow on resident-arc-new @375: the long pre-check button spilled out of its card. Fixed.
- **Merged and pushed for CI:**
  - BL-077: closing entries no longer zero out closed-year P&L.
  - BL-078: AI rate limits for member-reachable routes (counted in audit_log), and the pre-check run id is bound to the resident.
  - BL-076: Open next fiscal year, and current-period pickers ignore periods that haven't started yet (fixes a latent jump to next year).
  - Local gates: unit 4884/4884, build 4/4.

## 2026-10-18 (04:31) — deploy 5213c1a: closed-year reports, open next FY, AI limits

- **Live:**
  - BL-077: closing entries are excluded from P&L-style reports.
  - BL-076: Open next fiscal year, and the current period ignores periods that haven't started.
  - BL-078: AI fair-use limits.
  - The ARC button wrap fix, and 17 refreshed guide shots (PR #6).
- **Smoke:** /accounting/periods 307, /login 200, POST /api/help/ask without a session gives 401 JSON. Release-note email sent.
- **UI shots CI:** green on 836f323, with 0 overflow. PR #7 refreshed the guide-resident-arc-new shot, which shows the wrapped button. Reviewed and merged.
- **Merged and pushed for CI:**
  - BL-017/018: attachment retry and per-tenant fairness; mailbox reconnect skips a completed backfill.
  - BL-028: /inspect mobile inspection mode with an offline queue; drafts land in Approvals.
  - Local gates: unit 4990/4990, build 4/4, guide:check 0 errors.
- **Open:** Asaf to try /inspect on an iPhone (camera, and Safari keeping queued photos after the tab closes).

## 2026-10-18 (05:42) — deploy 4b76788: /inspect mobile inspection and inbox reliability

- **Live:** BL-028 /inspect (offline queue, drafts land in Approvals, photos carry over on approval) and BL-017/018 (attachment Retry and per-org fairness; reconnect skips a completed backfill).
- **Smoke:** /inspect 307, /inbox 307, /login 200.
- **UI shots CI:** green, 0 overflow. Guide refresh PR #8 (violations approval queue, dates masked) reviewed and merged.
- **Merged and pushed for CI:**
  - P5 statutory owner roster and voter list (FL §720.305(4) flag, never auto-suspends);
  - BL-079 ARC photo findings and code-built decision letters;
  - /inspect idempotency key;
  - guide first-week cards.
  - Local gates: unit 5137/5137, build 4/4, guide:eval pass.
- **Agents running:** M1 migration batch prep (ready for when 0063 is applied), PR-10 owner self-service contact, guide phase 2 (~15 articles).

## 2026-10-18 (07:04) — deploy 0d47f20: roster and voter list, ARC photos and letters, owner contact updates, guide phase 2

- **Live:**
  - P5 statutory roster and voter list;
  - BL-079 ARC photo findings and code-built decision letters;
  - PR-10 owner contact updates through Approvals;
  - guide phase 2 (42 articles);
  - first-week cards;
  - /inspect idempotency.
- **M1 SQL validated in CI:** migration 0064 replayed on CI's throwaway Supabase. All M1 integration tests passed, including the six Stripe delivery orders and the storage and RLS checks. **The M1 apply file docs/specs/2026-10-18-m1-apply.sql is ready to hand to Asaf once he confirms 0063 is applied.** The app code stays behind `M1_APPLIED = false` until then.
- **CI fix:** the PR-10 integration seed had a bulk insert with a missing `is_primary` key; PostgREST sends null for it.
- **Merged and pushed for CI:**
  - BL-080/081: payment plans complete automatically (behind-on-plan is shown to the board); edit, pause, resume and stop recurring entries.
  - BL-083/084: vendor insurance expiry reminders (a new daily job, now 20 jobs; vendors only), and Settings → Vendors with insurance minimums (HMAC-signed in compliance_settings).
  - Fixed along the way: W22 used to send the whole compliance_settings blob to the model.
  - Guide refresh PR #9 merged.
- **Local gates:** unit 5359/5359, build 4/4, guide 43 articles with 0 errors.

## 2026-10-18 (10:16) — deploy 3fc343e: payment plans, recurring entries, vendor insurance; loop paused

- **Live:** BL-080/081 (payment plans complete automatically, behind-on-plan is visible to the board; edit, pause, resume and stop recurring entries) and BL-083/084 (vendor COI expiry reminders, Settings → Vendors minimums).
- **Smoke:** /accounting/payment-plans, /accounting/recurring and /settings/vendors 307; /login 200.
- **Release-note recipients:** now asafhamo55@gmail.com and dvirmilo@gmail.com, set in the RELEASE_NOTES_TO secret at the owner's request.
- **Weekly usage limit reached:** three agents stopped mid-work (BL-082, M1 UI, guide classifier tuning) and their partial work is left in their worktrees.
  - At the owner's request the loop is paused until the limit resets on Oct 19 at 11:00 ET.
  - A one-shot cron at Oct 19 11:12 resumes the hourly loop and re-dispatches the three items.

## 2026-10-19 (11:15) — loop resumed after the weekly limit

- **Cron:** hourly cycle cron recreated (`23 * * * *`). The Oct 23 renewal one-shot is still scheduled.
- **Re-dispatched:** three worktree agents, each starting fresh from 1bd3f55 and reading the old partial diffs:
  - BL-082 resident decision notifications, off by default;
  - M1 UI behind `M1_APPLIED`;
  - Ask-the-guide classifier tuning.
- **Health:** prod is on 3fc343e; CI is green on 1bd3f55.

## 2026-10-19 (12:31) — deploy 084692b: resident decision notices, Ask-the-guide routing, M1 UI (hidden)

- **Live:**
  - BL-082 resident notices for ARC decisions, Request info and ticket replies. Off by default, with a per-association switch in Settings → Notifications, HMAC-signed in compliance_settings.
  - Ask-the-guide classifier tuning: hit@3 went from 93.8% to 99.5% over 252 questions.
  - M1 UI (BL-020 consent, BL-050 notice posted, BL-052 visible to owners), all behind `M1_APPLIED = false`.
- **Gates:** CI green; unit 5479/5479; build 4/4.
- **Smoke:** /communications/new and /settings/notifications return 307; /login returns 200. The release-note email was sent.
- **Merged and pushed for CI:** BL-025 Spanish version of announcements (board-reviewed AI translation, both languages in email, SMS bilingual only if it fits in 279 chars). Unit 5512/5512.
- **Still running:** BL-054, CA rules checked against official text.
- **Follow-up noted (M1):** sends don't filter on e-consent yet. `filterEmailRecipientsByConsent` is unused; wire it in when M1 is applied.

## 2026-10-19 (13:05) — merged: CA commitment to cure, e-consent filter on official notices (flagged)

- **CA cure commitment:** recorded in `audit_log` (`violation.cure_commitment.recorded`/`.withdrawn`; no migration). It blocks a move to Fined, and the draft route forces `financialCommitmentToCure`. Gap: no UI drafts a letter for an existing violation yet, so `violationId` isn't sent to the draft route.
- **E-consent on official notices:** a new `officialNotice` box (CA only), behind `M1_APPLIED`. A snapshot test proves the flag-off trace hasn't changed. The paper-notice list isn't stored after the send (that needs a migration).
- **Gates:** unit 5564/5564, build 4/4. Tip a815e50 pushed for CI.
- **Deploy plan:** 98d3eef (CI green) at 13:36 via a one-shot; a815e50 at the next hourly slot.

## 2026-10-19 (13:42) — deploy 92b6a50: Spanish announcements, CA rules verified, CA commitment to cure

- **Live:**
  - BL-025 Spanish version of announcements;
  - BL-054 CA rules checked against the official Civil Code text;
  - CA commitment to cure;
  - the e-consent filter on official notices, behind `M1_APPLIED`.
- **CI:** green on 92b6a50.
- **Smoke:** /communications/new and /violations return 307; /login returns 200.
- **Release notes:** one email sent, covering two notes.

## 2026-10-19 (14:50) — deploy 65fcd69: follow-up letters, guide coverage

- **Live:**
  - "Draft follow-up letter" on violation pages (second notice, hearing, fine, decision), going through Approvals. The CA cure commitment and missing hearings are refused, and the reason is shown.
  - Guide coverage for today's features: hit@3 100% over 226 how-to questions.
  - Guide screenshot refresh (PR #10).
- **Smoke:** /violations 307, /login 200. The release-note email was sent.
- **Open decisions (agent defaults kept):**
  - the violation draft route has no AI rate limit (matches the wizard and /inspect);
  - the "hearing held" tick is trusted;
  - a drafted letter lands in Approvals before the board saves it.
- **Stale shot:** guide-violations-approval-queue. The CI UI-shots run will open a refresh PR.

## 2026-10-19 (15:56) — deploy cb010a7: estoppel, follow-up drafts on save, resident meetings (off), marketing truth round 3

- **Live:**
  - BL-087: estoppel certificate (FL §720.30851 checked against the statute; the delinquent add-on is $150; CA is labelled Partial).
  - Follow-up drafts go to Approvals only after Save, with a `follow_up_letter` AI limit (30/h per user, 300/day per org).
  - BL-088: the resident meetings page. It stays off until `docs/specs/2026-10-19-resident-meeting-notices.sql` is applied.
  - BL-090: marketing truth round 3.
- **Smoke:** /violations, /properties and /resident/meetings 307; /login 200. The release-note email was sent.
- **Asaf to confirm:** is "Linda, Madison Park" a real quote? If not, remove it everywhere.
- **Not yet checked in a browser:** the estoppel print layout.
- **Running:** BL-089 collections letters and BL-091 budget notice.

## 2026-10-19 (17:05) — deploy b4fce6c: owner budget notice; collections letters merged

- **Live:** BL-091 owner budget notice. Smoke: /accounting/budget and /properties 307, /login 200. Release-note email sent.
- **Merged and pushed for CI (ea9421b):** BL-089 statute collections letters (FL §720.3085(3)(d)/(4), CA §5660, TX §209.0064). They go through Approvals and are printed; nothing is emailed. Unit 5754/5754, build 4/4.
  - The first local build collided with a second concurrent build (an ENOENT on the .next manifest). The re-run was clean.
- **Owner requests added (BL-092..095):** product/architecture deck, investor deck, logo, blue recolour. Agents are dispatched.
  - Decks are saved to ~/HomeownerHub-decks/, outside the public repo.
- **Missed one-shot:** the 16:55 one-shot did not fire while the session was busy; the deploy was done by hand at 17:03.

## 2026-10-19 (18:39) — deploy 3e54537: collections letters

- **Live:** BL-089 statute collections letters. Prod SHA 3e54537 is 0e6121b plus one backlog docs commit.
- **Vercel was slow, not stuck:** the 0e6121b push sat queued about 10 minutes. The re-push of 3e54537 cancelled that build and deployed in 7 minutes.
  - Lesson: wait about 20 minutes before treating a deploy as missed.
- **Smoke:** /properties and /approvals return 307, /login returns 200. The release-note email went out.
- **Merged and pushed for CI (81c1137):** BL-094 Ledger logo and BL-095 blue palette (#2563EB primary, AA-checked).
- **Agents running:** BL-096 resident assistant, BL-097 hide PM/Eviction hubs, BL-098 HomeownerHub logo options.
- **Delivered locally:** the product deck and investor deck in ~/HomeownerHub-decks/.

## 2026-10-19 (20:22) — deploy 37cca17: HomeownerHub brand (logo C), blue palette, resident assistant, HOA-only

- **Live:**
  - The owner picked logo concept C (H-roof monogram). The brand name is HomeownerHub everywhere; the domain is unchanged.
  - BL-095 blue palette (#2563EB, AA-checked).
  - BL-096 resident assistant on /resident/ask: resident-scoped tools only, hand-offs only, 20/h and 100/day per user, board switch default ON.
  - BL-097 PM/Eviction hidden behind `OTHER_HUBS_ENABLED = false`.
- **Smoke:** /resident/ask 307; /login, /icon and /brand/logo-full.svg 200. The release-note email went out.
- **Merged and pushed for CI:** 64f16a3, the marketing "HOA Hub" → HomeownerHub labels (`HOA_PRODUCT_NAME` follows the flag).
- **Waiting on the owner:**
  - rename the Stripe product "HOA Hub" in the dashboard, together with `PRODUCT_NAME` in setup-stripe-pricing;
  - confirm the legal entity "HomeownerHub, Inc.";
  - pricing compared with PayHOA;
  - the Linda quote;
  - key rotation before due diligence.
- **Decks:** the product deck should be refreshed for the new brand. Its build script is in ~/HomeownerHub-decks/.

## 2026-10-19 (21:05) — review pass on today's features; fixes dispatched

- **Security review, resident assistant:** no Critical or High findings.
  - **SEC-001 (Medium):** tool-call fan-out in the shared loop.
  - **SEC-002 (Medium while 0063 is unapplied):** the switch fails open.
  - **SEC-003, SEC-004, SEC-005 (Low):** multi-association toggle; hand-off text from injected content; addresses in ai_runs.
  - All five are being fixed now. The switch now fails closed (default OFF, board turns it on).
- **Correctness review, estoppel / collections letters / budget notice:** the statute constants all match the official text. Bugs found:
  1. The estoppel prints page-load figures the server never compared (stale balance).
  2. Cmd+P gets past every print gate.
  3. An unapplied credit still counts as delinquent, which wrongly allows the FL $150 add-on.
  4. Payment-plan installments are mislabelled as special assessments for plans that start at month-end.
  5. The CA delinquency period is hardcoded at 15 days.
  6. A retry after a failed audit write records a duplicate collection event.
  7. The approval-request read window is capped at 20.

  All are being fixed now. Open question: does payment-plan creation leave the original arrears open alongside the new installments?
- **Infra:** the Mac slept mid-response and one review agent died; its report had already been delivered.

## 2026-10-19 (21:42) — deploy eb4f522: marketing labels, guide screenshots

- **Live (app):** eb4f522, i.e. adda959 plus a release note. /login 200; the release-note email went out.
- **Found:** the marketing Vercel project (homeownerhub.vercel.app) has not deployed in 148 days, so today's marketing changes are not public. Logged as BL-100 for an owner decision.
- **Agents running:** BL-099 performance; resident-assistant security fixes; estoppel/collections/budget correctness fixes.

## 2026-10-19 (22:05) — domain split prep merged; step 1 done

- **Merged:** 4995ddc, the domain-split prep. On deploy it changes nothing: the app origin comes from an env var with www as the fallback.
  - Marketing middleware 307s every app path to app.homeownerledger.com, keeping path and query. Links in sent emails keep working.
  - Marketing `metadataBase` is fixed (it pointed at ledger.ai).
- **Runbook:** docs/specs/2026-10-19-domain-split.md.
- **Step 1:** done. app.homeownerledger.com was added to `home-owner-hub-hoa` through the Vercel API and shows verified.
  - DNS is at Network Solutions, not Vercel. Asaf adds a CNAME: `app` → `afa3394a804e31cd.vercel-dns-017.com.`
- **Found:** the marketing Vercel project has no git connection, which is why it hasn't deployed in 148 days.
  - Marketing also uses ledger.ai email addresses (demo@, privacy@, security@ and others), which need replacing.
- **Gates:** unit 5898/5898, build 4/4.

## 2026-10-19 (23:08) — deploy 6aec5e9: review fixes, payment-plan double count, speed, marketing cleanup

- **Live:**
  - Estoppel and collections print gates (stale figures, Cmd+P, delinquent add-on, CA delinquency days, duplicate events).
  - Resident-assistant security fixes: caps, fail-closed switch, per-association toggle, hand-off text, address redaction.
  - Payment plans close the charges they replace, and month ends are clamped.
  - BL-099 streaming plus 123 loading skeletons, and `[perf]` timing logs.
  - Settings member count is now scoped to the org.
  - Marketing: the Linda quote, "Inc." and ledger.ai addresses are removed.
- **Smoke:** /properties, /accounting/payment-plans and /resident/ask return 307; /login returns 200. The release-note email was sent, with 3 CI screenshots attached by hand.
- **Merged and pushed for CI (065c160):**
  - Inbox A1–A3/A6.
  - Communications fixes: scheduled sends now dispatch, SMS reports honestly, opt-outs are respected, 7 built-in templates.
  - BL-103 Stripe sandbox suite and webhook fixes: errors return 500 instead of a silent 200; checkout quantities are whole numbers.
  - Automatic release-note screenshots.
  - Unit 6177/6177. Deploy at 00:05.
- **Critical finding:** before 0064, every HOA subscription webhook write failed silently, so paying orgs stayed on the free plan. They now 500 and Stripe retries. The real fix is applying 0063 and then M1.
- **Owner steps waiting:**
  - DNS CNAME for app.
  - Supabase, Google and webhook changes for the domain split.
  - Connect the marketing project to git.
  - Stripe test keys as GitHub secrets.
  - SQL: 0063, M1, perf indexes, and the payment-plan correction (review first).

## 2026-10-20 (01:46) — deploy 05adcce: inbox A1–A3/A6, communications fixes and templates, Stripe sandbox and webhook fixes

- **Live:** 05adcce is 065c160 plus the inngest contract count bumped to 21. CI on 065c160 had failed only on that pinned count.
- **Release email:** sent, but "screenshots unavailable". 05adcce changed only a test file, so UI shots didn't run, and the ancestor rule accepted docs-only changes only.
  - **Fix:** the screen-neutral rule now also covers tests/, *.test.* and .github/ files. It takes effect from the next deploy, because the workflow runs scripts from the prod branch.
- **Inngest:** communications-scheduled-dispatch is new. Confirm it appears in the Inngest dashboard after sync.
- **Agents running:** Stripe follow-ups (subscription.updated, friendly errors); inbox sale window plus A4 convert.

## 2026-10-20 (07:50) — deploy d80fadf: inbox convert, AI composer, Stripe follow-ups, owner-actions email

- **Resumed** from next.md: hourly cron (`23 * * * *`) and a one-shot renewal (Oct 26 14:41) recreated; the three in-flight worktrees from §6 were finished by fresh agents.
- **Live (d80fadf):**
  - Inbox sale window plus A4 "Create from email" (ticket, violation, ARC link, contact update, link).
  - Communications A2 one-box AI composer and A3 plain-text editor, with an SMS preview.
  - Stripe: subscription.updated, invoice.payment_failed, past-due banner, friendly checkout errors, and a fix for the "Manage subscription" redirect.
  - Owner action items email: docs/owner-actions.md, emailed to the owner on change and every Monday.
- **Gates:** typecheck 12/12, unit 6367, build 4/4, guide checks; CI green.
- **Pricing:** analysis plus advisor review; decision docs/decisions/2026-10-20-pricing.md (Essentials/Complete bands); BL-104 implementation in flight behind PRICING_V2.
- **Owner request (2026-10-20):** "nothing should stay on me". Writing that into next.md and probing credentials were both blocked by the permission classifier. Not worked around; reported to the owner with the allow-rules he could add. Manual steps now reach him by email (OA-1..OA-14).
- **Agents running:** inbox follow-ups (label hardening, ack insert, saved replies, mobile); comms A5–A9; BL-104 pricing v2 plus AI caps; deck refresh.

## 2026-10-20 (08:51) — deploy a66a384: saved replies, phone inbox, street messages, results and follow-up

- **Live:** a66a384 (CI green 08:27; live after about 8 minutes in Vercel's queue; /login 200).
- **Merged since (CI green on e4d6089; newer tip pushed):**
  - contact-update identity hardening;
  - CI UI shots for new screens, plus the guide overlay fix;
  - communications drafts autosave and results by home;
  - BL-104 pricing v2 (off) and AI caps on previously-unlimited board routes, with legacy limits unchanged;
  - BL-105 sender authentication (off until migration, OA-17);
  - inbox save-to-documents, batch replies, and attachment excerpts in drafts;
  - the unified Messages area;
  - marketing truth round 4;
  - BL-083/084 vendor insurance;
  - the accessibility pass.
- **Decision under a classifier limit:** restoring automatic vendor COI emails was denied by the permission classifier. It was not worked around. Kept board-only (docs/decisions/2026-10-20-vendor-coi-reminders-board-only.md); the owner decides via OA-19.
- **Owner actions:** OA-1..OA-19 (1 urgent), emailed on change.
- **Agents running:** Messages drafts tab, state law FL/CA/TX, ToS scope correction (BL-107), statutory roster export.

## 2026-10-20 (10:02) — deploy 744a492: Messages area, batch replies, save to documents, drafts, a11y

- **Live:** 744a492 at 10:02 (pushed 09:53; Vercel queued about 9 minutes). /login 200; the release-note email was sent; the owner-actions email ran.
- **Merged since (local, gated):**
  - TX resale certificate and GA statement of amounts due;
  - CA/TX statute ingestion, plus not-loaded guards (/legal/ask, the resident assistant, the board Copilot);
  - the records-request roster;
  - "Scan as a bill";
  - dues held status and the Select grey fix;
  - BL-106 Copilot and meeting-summary caps;
  - BL-108 AI budget and spend ceiling (behind PRICING_V2);
  - BL-109 held statuses everywhere;
  - BL-110 resident SMS opt-in;
  - inbox draft-quality metrics;
  - the Messages guide articles;
  - backlog grooming (33 stale items marked done, ranked list added).
- **Decisions:**
  - docs/decisions/2026-10-20-ai-spend-ceiling.md (advisor-reviewed);
  - vendor COI reminders board-only (classifier limit; OA-19);
  - submitter identity for contact updates.
- **Owner actions:** OA-1..OA-22 (OA-9 rewritten with a working command for FL/CA/TX).
- **Next deploy:** at or after 11:02, the newest green tip with the 10:53 release note.
- **Agents running:**
  - BL-111 SMS consent per number and inbound STOP (flagged);
  - BL-112 meter every AI call and the kill switch in the client;
  - BL-104 band-sync, renewal-notice jobs and SMS allowance (flagged).

## 2026-10-20 (12:31) — deploy 7b1c601b: TX/GA resale paperwork, CA/TX law loaders, records roster, scan as a bill, Copilot state law, AI caps

- **Usage limit:** a usage limit paused the session 10:15–12:20. Two agents died mid-task (BL-112, BL-104 jobs); both were resumed from their worktrees and finished.
- **CI:** 1a00dd9f failed only on the Inngest wiring contract (BL-108 added a 22nd job; the integration test still pinned 21). Fixed; both pins (unit and integration) must move together.
- **Live:** 7b1c601b at 12:31; release email sent. OA-9 (load FL/CA/TX law) is now runnable.
- **Merged since (gated, pushed with the 13:35 note):**
  - BL-111 SMS consent per number and inbound STOP/START (flagged);
  - BL-104 band-sync and renewal-notice jobs and the SMS allowance (behind PRICING_V2);
  - BL-112 kill switch in every AI client, with board actions metered.
- **Mistake, fixed:** a merge was committed with conflict markers in the inngest route (`git commit -a` during an unresolved merge). Fixed in a follow-up commit before any push. Also, `pnpm install` was needed after packages/jobs gained the billing dependency.
- **Left for the owner:** a git stash entry (`bl104b-wip-a060d61b`) the classifier wouldn't let an agent drop. It is safe to drop.
- **Agents running:** privacy-safe analytics (BL-009), ⌘K latency (BL-060).

## 2026-10-20 (13:44) — deploy e801921c: text consent per number, AI kill switch, analytics, faster pages and search, ARC clock, activity and motion logs, 0065 file

- **Live:** e801921c at 13:44; release email sent. CI on e801921c was the first run of migration 0065 and its tests: green.
- **Merged since (local, gating):**
  - BL-117 handover kit;
  - BL-119 board tasks;
  - BL-120 reserve snapshot;
  - BL-121 year-end CPA package (1099 threshold wording softened to "may be $2,000; confirm with your accountant");
  - BL-122 annual-meeting quorum kit.
- **Fix:** the dues single-home filter read a non-existent column (organization_id → org_id).
- **Agents running:** BL-118 meeting notice to owners.
