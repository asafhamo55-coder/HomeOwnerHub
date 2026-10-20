# Session handoff: HomeownerHub autonomous loop

> **Start here:** `next.md` at the repo root is the full handoff (2026-10-20). This file is the detailed reference.

_Updated every cycle. Last update: 2026-10-18 10:20 ET (loop paused until the weekly limit resets Oct 19 11:00 ET)._

## Start the next session with this prompt

> Read docs/session-handoff.md, docs/backlog.md (bottom sections first) and the last 3 entries of docs/cycle-log.md. Then resume the 24/7 HOA product loop exactly as described in the handoff: recreate the hourly cron, check for unmerged agent branches, run the cycle. No approvals needed for anything, pricing and deploys included (max one prod deploy per hour). Hold only for SQL I must paste or keys I must create.

## Standing rules (also in Claude memory)

- **Scope:** the HOA app only (apps/hoa). The pm, eviction and marketing apps must keep compiling.
- **Approvals:** none needed for any decision, including pricing and deploys.
  - Record each decision in docs/decisions/ or the backlog.
  - Deploy at most once per hour.
- **Holds:** the only reasons to stop are SQL that Asaf pastes into the Supabase editor, and keys or accounts only he can create.
- **Release notes** go to asafhamo55@gmail.com and dvirmilo@gmail.com (RELEASE_NOTES_TO). Every deploy writes `docs/releases/<YYYY-MM-DD-HHMM>-<sha>.md`, and the release-notes GitHub Action emails it. See docs/releases/README.md once it lands.
- **Never:**
  - send real email or SMS to residents;
  - put PII in logs or script output;
  - force-push the prod branch;
  - work around a permission-classifier denial.
- **Delegation:** use worktree subagents for work. The main session coordinates, reviews screenshots, merges and gates.

## The loop (recreate the cron in each new session)

CronCreate `23 * * * *`, recurring. Prompt: the "HOA product cycle, 24/7 mode" text. Its steps:

1. If agents are still running, check on them and deploy if a gated tip is waiting.
2. Health check and CI.
3. Pick 2–3 items with no migration, and dispatch one worktree agent per item.
4. Merge, then run the gates.
5. Deploy: merge the prod branch in first, check fast-forward, push, poll /api/health.
6. Update the backlog, the cycle log and this file.
7. Report in 3–6 lines.

Also schedule a one-shot renewal before the 7-day cron expiry.

## Branches and deploy

- **Prod branch:** `claude/phase1-homeownerhub-setup-MILNu`. Vercel deploys only this branch. Asaf sometimes pushes here directly (e.g. d060e08); merge it into quality-oracle before deploying.
- **Integration branch:** `claude/quality-oracle`. All merges land here.
- **Deploy:** run `/usr/bin/git merge-base --is-ancestor <prod> <tip>`, then `/usr/bin/git push origin <sha>:claude/phase1-homeownerhub-setup-MILNu`. Prod pushes FAIL when their output is redirected to /dev/null; always run them as `... 2>&1 | tail -3`, and retry up to 3 times.
- **Verify:** poll `https://www.homeownerledger.com/api/health` until `version` equals the SHA. The public body is `{ok, app, version}`.
- **Live in prod:** a66a384 (saved replies, phone inbox, street messages, results and follow-up), deployed 2026-10-20 08:51 ET. Manual owner steps live in docs/owner-actions.md (emailed to Asaf); add new ones there.
- **2026-10-19 22:05:** domain split in progress (runbook docs/specs/2026-10-19-domain-split.md). Step 1 done (app domain added). WAITING ON ASAF: CNAME app → afa3394a804e31cd.vercel-dns-017.com at Network Solutions; then step 2 dashboard changes (Supabase redirect URLs, Google OAuth URI, Stripe/Resend/Plaid webhooks, Inngest sync). Agents running: BL-099 perf, payment-plan double-count fix, BL-101 inbox research, BL-102 communications research. Deploy 4a535e9 (review fixes) at 22:46.

## Gates (the trusted forms)

- `pnpm typecheck`: expect "Tasks: 12 successful".
- `pnpm typecheck:integration`
- `pnpm test:unit`: send output to a file and grep the summary.
- `rtk pnpm build`: if it fails with PageNotFoundError, an agent's `next dev` collided with it; rerun.
- **No local DB (owner rule 2026-10-17).** Integration runs only in GitHub CI, which has its own throwaway Supabase: push claude/quality-oracle and wait for CI to be green before deploying. Never run tests or seeds against prod. ui:shots waits for a CI job (BL-075).
- Use `/usr/bin/git` and `/usr/bin/grep`, because rtk mangles some output.

## Waiting on Asaf (manual steps only)

1. **Migration 0063:** run Part 1a from `docs/specs/2026-10-16-rls-sweep-apply.sql` and send the output. Then Parts 1b, 2 and 3, using the updated versions; don't use the old Part 2.
2. **FL state-law first refresh:** signed in as platform admin, run `fetch('/api/admin/refresh-state-law',{method:'POST'})` in the browser console. Prod has 0 FL statutes.
3. **S-01 audit query:** run it read-only, on its own in the SQL editor. It lists resident_portal.enter rows outside the acting org.
4. ~~GitHub secrets for release-note emails~~: done 2026-10-17.
5. **Later:** an Open States and/or LegiScan API key (BL-069), and `LAW_REPORT_TO` as a Vercel env var.
6. **After 0063:** migration batch M1, READY and CI-validated: docs/specs/2026-10-18-m1-apply.sql (then flip packages/db/src/m1.ts M1_APPLIED=true): BL-020, BL-050, BL-052, BL-058, BL-063 and Stripe 0064. Then the properties expand/backfill (M-P1, M-P2). Then M2: BL-068 modules and BL-069 run log.

## In flight at this update

- **Paused:** the loop is paused for the weekly usage limit. On resume, re-dispatch BL-082 resident notifications, the M1 UI behind the flag and the guide classifier tuning; partial diffs are in .claude/worktrees/agent-a1496b73cd811725c, agent-abd18994e3c673a61 and agent-a0c6a9e45dd9f07e0.
- **UI shots CI** opens "Refresh guide screenshots" PRs automatically. Review two images, then squash-merge.
- **Next, by priority:** see **"Ranked open work (groomed 2026-10-20)"** at the bottom of `docs/backlog.md`, the single source for what to build next. Every backlog item now carries a "Groomed 2026-10-20" line saying Done (with commit), Partly, Open or which migration batch it waits for. Check that line before you start an item.
  - Everything this list used to name has shipped: BL-079 (fe712f36, 12a3d395), BL-025 (2026-10-19), the P5 statutory roster (72f0b92d) and records copy (173f4727), the guide's first-week cards (`apps/hoa/src/lib/guide/first-week.ts`), and the /inspect idempotency key (9830f49d; shared-cap test c577ada9). BL-068 still waits for M2.
- **Waiting on Asaf:**
  - Is support@homeownerledger.com a real inbox?
  - The FL refresh, the S-01 audit query and the 0063 Part 1a SQL.
  - Try /inspect on an iPhone.

## Decisions taken without the owner (reversible)

- 2026-10-18: removed the composite marketing testimonials. Marketing shows only the price checkout charges today. Enabled the repo setting that lets Actions create PRs (default token read-only).

- **Module pricing (BL-068):** Core $0.60/door ($39 min); Accounting $0.40 ($20 min); AI $0.50 ($25 min); Mailbox, Vendors and Leases $0.10 each ($5 min). This extends pricing scenario A. Existing subscriptions keep their price until renewal. The decision doc will be written when BL-068 is built.
