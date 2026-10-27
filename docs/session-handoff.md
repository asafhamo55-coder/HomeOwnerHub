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
- **Live in prod:** 7f73e120 (deploying 18:31; second-round security fixes, resident violation replies, owner invites), after 561211bf at 17:30 and eac8cd52 at 16:05. Owner start point: OA-1 runbook (sections A–I). Backlog rounds 2–3 in docs/backlog.md; security status under "Security review 2026-10-20".
- **2026-10-19 22:05:** domain split in progress (runbook docs/specs/2026-10-19-domain-split.md). Step 1 done (app domain added). WAITING ON ASAF: CNAME app → afa3394a804e31cd.vercel-dns-017.com at Network Solutions; then step 2 dashboard changes (Supabase redirect URLs, Google OAuth URI, Stripe/Resend/Plaid webhooks, Inngest sync). Agents running: BL-099 perf, payment-plan double-count fix, BL-101 inbox research, BL-102 communications research. Deploy 4a535e9 (review fixes) at 22:46.

## Gates (the trusted forms)

- `pnpm typecheck`: expect "Tasks: 12 successful".
- `pnpm typecheck:integration`
- `pnpm test:unit`: send output to a file and grep the summary.
- `rtk pnpm build`: if it fails with PageNotFoundError, an agent's `next dev` collided with it; rerun.
- **No local DB (owner rule 2026-10-17).** Integration runs only in GitHub CI, which has its own throwaway Supabase: push claude/quality-oracle and wait for CI to be green before deploying. Never run tests or seeds against prod. ui:shots waits for a CI job (BL-075).
- Use `/usr/bin/git` and `/usr/bin/grep`, because rtk mangles some output.

## Waiting on Asaf (manual steps only)

Single source: `docs/owner-actions.md` (emailed to Asaf by a workflow). At 2026-10-27:
- **OA-37 (in progress, live with Claude):** apply 0070 (tenant isolation), then 0071 (roles), using runbook Sections M and N in `docs/specs/2026-10-20-sql-runbook.md`. M1 and M2 are done: 121 links, 0 violations. Next is M3, then the M4 apply, but only after CI is green on the fixed 0070/0072. Set PRO_INVITE_SECRET before flipping M6_APPLIED. 0072 (Section O, M7) follows.
- **OA-34 (urgent):** RESEND_API_KEY, EMAIL_FROM and DEMO_INBOX_EMAIL on the marketing project, so demo requests reach Asaf.
- OA-35 (analytics and Search Console), OA-36 (isolation checks), OA-26 (secrets), OA-33 (Stripe test webhook secret), OA-32 (GA 590-13 PDFs, due Nov 2).

## In flight at this update (2026-10-27 16:00 EDT)

- **Prod:** 94b8d859. Integration: claude/quality-oracle at f71fc407, which includes claude/m7 (0070 rebuilt to 121 prod links, plus 0072). Its CI is red: 7 integration tests. The M7 agent is fixing the trigger order (23503 vs 42501) and `v_num` in `record_lump_payment`. **Do not deploy quality-oracle until it is green.** It's safe once green: the migrations are applied by Asaf, and the M6/M7 code is flag-gated.
- **Agents:** BL-044 reminder follow-ups, BL-043 date-only math, BL-059 Select styling, deck refresh.
- **Next, by priority:** the ranked lists at the bottom of `docs/backlog.md` (rounds 5 and 6, plus owner asks BL-157 to BL-177). The "Groomed 2026-10-20" lines are a week old, so check the code before starting an item.

## Decisions taken without the owner (reversible)

- 2026-10-18: removed the composite marketing testimonials. Marketing shows only the price checkout charges today. Enabled the repo setting that lets Actions create PRs (default token read-only).

- **Module pricing (BL-068):** Core $0.60/door ($39 min); Accounting $0.40 ($20 min); AI $0.50 ($25 min); Mailbox, Vendors and Leases $0.10 each ($5 min). This extends pricing scenario A. Existing subscriptions keep their price until renewal. The decision doc will be written when BL-068 is built.
