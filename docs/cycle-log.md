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
