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
