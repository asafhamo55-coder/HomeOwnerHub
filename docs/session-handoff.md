# Session handoff: HomeownerHub autonomous loop

_Updated every cycle. Last update: 2026-10-17 18:15 ET._

## Start the next session with this prompt

> Read docs/session-handoff.md, docs/backlog.md (bottom sections first) and the last 3 entries of docs/cycle-log.md. Then resume the 24/7 HOA product loop exactly as described in the handoff: recreate the hourly cron, check for unmerged agent branches, run the cycle. No approvals needed for anything, pricing and deploys included (max one prod deploy per hour). Hold only for SQL I must paste or keys I must create.

## Standing rules (also in Claude memory)

- **Scope:** the HOA app only (apps/hoa). The pm, eviction and marketing apps must keep compiling.
- **Approvals:** none needed for any decision, including pricing and deploys.
  - Record each decision in docs/decisions/ or the backlog.
  - Deploy at most once per hour.
- **Holds:** the only reasons to stop are SQL that Asaf pastes into the Supabase editor, and keys or accounts only he can create.
- **Release notes:** every deploy writes `docs/releases/<YYYY-MM-DD-HHMM>-<sha>.md`, and the release-notes GitHub Action emails it. See docs/releases/README.md once it lands.
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
- **Deploy:** run `/usr/bin/git merge-base --is-ancestor <prod> <tip>`, then `/usr/bin/git push origin <sha>:claude/phase1-homeownerhub-setup-MILNu`. A push made right after pushing quality-oracle fails once; retry it once.
- **Verify:** poll `https://www.homeownerledger.com/api/health` until `version` equals the SHA. The public body is `{ok, app, version}`.
- **Live in prod:** 809b442 (properties rebuild part 1), deployed 2026-10-17 18:13 ET. The next deploy is allowed after 19:13. Release-note emails work: the GitHub secrets were set on 2026-10-17.

## Gates (the trusted forms)

- `pnpm typecheck`: expect "Tasks: 12 successful".
- `pnpm typecheck:integration`
- `pnpm test:unit`: send output to a file and grep the summary.
- `rtk pnpm build`: if it fails with PageNotFoundError, an agent's `next dev` collided with it; rerun.
- `pnpm db:local:reset && pnpm test:integration`: the suite holds a sleep block and an advisory DB lock, so overlapping runs queue.
- Use `/usr/bin/git` and `/usr/bin/grep`, because rtk mangles some output.

## Waiting on Asaf (manual steps only)

1. **Migration 0063:** run Part 1a from `docs/specs/2026-10-16-rls-sweep-apply.sql` and send the output. Then Parts 1b, 2 and 3, using the updated versions; don't use the old Part 2.
2. **FL state-law first refresh:** signed in as platform admin, run `fetch('/api/admin/refresh-state-law',{method:'POST'})` in the browser console. Prod has 0 FL statutes.
3. **S-01 audit query:** run it read-only, on its own in the SQL editor. It lists resident_portal.enter rows outside the acting org.
4. ~~GitHub secrets for release-note emails~~: done 2026-10-17.
5. **Later:** an Open States and/or LegiScan API key (BL-069), and `LAW_REPORT_TO` as a Vercel env var.
6. **After 0063:** migration batch M1: BL-020, BL-050, BL-052, BL-058, BL-063 and Stripe 0064. Then the properties expand/backfill (M-P1, M-P2). Then M2: BL-068 modules and BL-069 run log.

## In flight at this update

- **Agents:**
  - BL-070 guide phase 1, rebasing onto the properties work and updating the properties articles.
  - BL-071 version indicator.
- **Next:** guide day 2 (Ask the guide, What's new, checklist links), BL-072 guide-found bugs, properties P2 (table and 360 page), P4 (board-run import), P3 (record a sale).

## Decisions taken without the owner (reversible)

- **Module pricing (BL-068):** Core $0.60/door ($39 min); Accounting $0.40 ($20 min); AI $0.50 ($25 min); Mailbox, Vendors and Leases $0.10 each ($5 min). This extends pricing scenario A. Existing subscriptions keep their price until renewal. The decision doc will be written when BL-068 is built.
