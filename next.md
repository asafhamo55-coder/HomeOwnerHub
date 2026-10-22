# next.md — start the next session here

Written 2026-10-20 ~07:00 ET, when the previous session (0dcfc485) closed.
Paste the block below as the first message of the new session. The rest of
this file is the reference it points to.

---

## Paste this to start the new session

> Read `next.md` at the repo root, then `docs/session-handoff.md`, `docs/backlog.md` (bottom sections first) and the last 5 entries of `docs/cycle-log.md`.
>
> Then resume the 24/7 HomeownerHub product loop exactly as `next.md` describes:
> 1. Recreate the hourly cycle cron (`23 * * * *`) with the cycle prompt from `next.md` §3.
> 2. Schedule a one-shot renewal before the 7-day cron expiry.
> 3. Check the leftover agent worktrees listed in §6 and finish or re-dispatch that work.
> 4. Run the cycle.
>
> No approvals are needed for anything. Decide by best practice and record each decision in `docs/decisions/`. Consult an Opus advisor agent when a call is genuinely uncertain. Hold only for steps that need my dashboards, DNS, keys or SQL; list those for me, don't ask.

---

## 1. Who and what

- **Owner:** Asaf (asafhamo55@gmail.com).
- **Product:** HomeownerHub, AI HOA management for self-managed volunteer boards (FL / CA / GA / TX).
- **Brand:** the brand is **HomeownerHub**, everywhere.
  - Logo: concept C, an "H" whose crossbar is a roof (`packages/ui/src/components/BrandLogo.tsx`).
  - Palette: blue, `#2563EB` primary.
  - Domain: homeownerledger.com (unchanged).
  - "ledger" as an accounting term stays.
- **App:** https://www.homeownerledger.com. It is moving to https://homeownerledger.online, its own apex domain (owner decision 2026-10-21; §5).
- **Marketing site:** `apps/marketing`, currently https://homeownerhub.vercel.app. It is not deploying (§5).
- **Repo:** monorepo, public on GitHub (asafhamo55-coder/HomeOwnerHub). Never put secrets or leaked-key details in it.

## 2. Standing rules from Asaf (all still in force)

### Autonomy and cadence
- **Run 24/7.** Research, build, test, deploy, in hourly cycles.
- **Never ask, never wait.**
  - Asaf, 2026-10-19: "you don't need to ask or wait for any update from me — all should go based on best practices and your recommendation… if you need to consult with someone you can use opus 5.5 as advisor."
  - Don't use AskUserQuestion for product, design, brand or pricing choices. Decide, then write the decision to `docs/decisions/`.
- **Deploy authority.** You have full permission to commit, push and deploy to production.
  - At most **one prod deploy per hour**.
  - Never force-push the prod branch.
- **Always work through teams of subagents** (worktree-isolated), with the main session coordinating. Keep about 3–4 agents running in parallel.
- **Hold only for manual steps** Asaf alone can do: SQL in Supabase, keys or accounts, DNS, and the Vercel, Stripe, Google or Supabase dashboards. List the exact steps for him; don't ask permission.

### Go-to-market: we begin with Georgia (Asaf, 2026-10-21)
- **Georgia is the launch state.** FL, CA and TX stay supported, but Georgia comes first when choosing what to build, test, word or demo: GA statute coverage (the O.C.G.A. § 44-3 snapshot, BL-124 refresh before 2027-01-01), the GA Secretary of State registration (SB 406), GA-specific paperwork and copy, and GA examples in the decks and marketing.
- Before ranking backlog items, ask: "does this help a Georgia board first?"

### Presentations stay current (Asaf, 2026-10-21)
- **Always keep the product deck and the investor deck up to date** (`~/HomeownerHub-decks/`, outside the repo) with the latest features, market trends, competitor moves and pricing.
- Refresh them whenever a deploy changes what they show, and at least once a day during the loop. Put Georgia first in both (launch market, sizing, go-to-market, examples).
- Never invent traction; keep "ASAF TO FILL" where numbers are unknown.

### Scope
- **HOA app only.** `apps/hoa` is the focus. Marketing gets truth/brand fixes. `apps/pm` and `apps/eviction` must keep compiling but are hidden from users (`OTHER_HUBS_ENABLED = false`, BL-097).

### Database and tests
- **No local DB, ever.** No `supabase start`, no local `test:integration`, no seeds, no local `ui:shots`.
- **Integration gate:** push `claude/quality-oracle` and wait for GitHub CI. CI has its own throwaway Supabase.
- **Never run tests or seeds against prod.**
- **Migrations are applied by Asaf.** Write the SQL as a file under `docs/specs/*.sql` and gate app code behind a flag (e.g. `M1_APPLIED`).

### Safety
- **No real email or SMS to residents** unless the board explicitly sends or opts in. The outbound guard stays.
- **No PII** in logs or script output; ids and counts only.
- **Never edit Claude's own permission or safety settings.** Never work around a permission-classifier denial.

### Release notes
- **Every prod deploy emails a branded release note** to `RELEASE_NOTES_TO` = asafhamo55@gmail.com, dvirmilo@gmail.com.
  - Write it before the deploy as `docs/releases/YYYY-MM-DD-HHMM-<slug>.md`, in plain language for a non-technical owner.
  - **Screenshots are required** ("better to have it").
- **How screenshots get in:**
  - Add a `shots:` front-matter list of routes. The workflow then fetches CI's "UI shots" artifact for the deployed SHA, or for a nearest ancestor where only docs, tests or CI changed since.
  - Or attach them by hand with `scripts/ci/fetch-ui-shots.sh` into `docs/releases/assets/<slug>/`.

### Other owner requests already done
- Product and architecture deck, and investor deck: PowerPoint, kept locally in `~/HomeownerHub-decks/` (outside the public repo). The README there has the rebuild commands. **Refresh both when features or brand change.**
- Logo and brand; blue palette.
- PM/Eviction hidden.
- Resident AI assistant.
- Inbox and Communications revisits (Phase A in progress).
- Stripe sandbox suite.
- Performance pass.

## 3. The hourly cycle (recreate it as a cron)

Use CronCreate `23 * * * *`, recurring, with this prompt:

> HOA product cycle, 24/7 mode. Follow next.md §3 and docs/session-handoff.md "The loop". Rules: NEVER use the local DB (no supabase start, local test:integration, seeds or ui:shots locally); the integration gate is GitHub CI on claude/quality-oracle; never run tests or seeds against prod. Steps: (1) if agents are still running, check on them and deploy any gated tip that is waiting; (2) health check (/api/health) and CI status; (3) pick 2–3 backlog items that need no migration and dispatch one worktree subagent per item; (4) merge into claude/quality-oracle, run local gates (pnpm typecheck, typecheck:integration, test:unit, rtk pnpm build, guide checks), push and wait for CI to go green; (5) deploy at most once per hour: merge the prod branch first, check fast-forward with /usr/bin/git merge-base --is-ancestor, write a docs/releases note (with screenshots) inside the deployed SHA, push with `2>&1 | tail -3` (retry up to 3), poll /api/health for the SHA, and confirm the release-notes/email status; (6) update docs/backlog.md, docs/cycle-log.md and docs/session-handoff.md; (7) report in 3–6 lines. No approvals needed. Hold only for SQL Asaf must paste or keys he must create. No real email or SMS to residents; no PII in output; never force-push prod.

Crons live only for the session and auto-expire after 7 days, so schedule a one-shot renewal.

### Branches and deploy
- **Prod branch:** `claude/phase1-homeownerhub-setup-MILNu` (Vercel deploys only this one).
- **Integration branch:** `claude/quality-oracle`.
- **Deploy steps:**
  1. Run `/usr/bin/git merge-base --is-ancestor origin/<prod> <sha>`.
  2. Run `/usr/bin/git push origin <sha>:refs/heads/claude/phase1-homeownerhub-setup-MILNu 2>&1 | tail -3`. In zsh, write the SHA literally or as `${sha}`; `$sha:r` gets mangled.
  3. Poll `https://www.homeownerledger.com/api/health` until `version` equals the SHA. Vercel can queue a build for about 10 minutes, so wait about 20 minutes before calling it missed.
  4. Check the GitHub status `release-notes/email`.
- **Deploying a release note on top of a green SHA:** if the note must ship with an already-tested SHA, add the note as a docs-only commit in a temporary worktree on that SHA, deploy that commit, then merge it back.

### Local gates (the trusted forms)
- `pnpm typecheck`: expect "Tasks: 12 successful".
- `pnpm typecheck:integration` and `pnpm typecheck:scripts`.
- `pnpm test:unit > /tmp/q.txt 2>&1`, then grep the summary. It is about 6,177 tests now.
- `pnpm build > /tmp/build.txt` and grep "Tasks: 4 successful". **Never run two builds at once**; they collide on `.next`, which shows up as an ENOENT on the manifest.
- `pnpm guide:build --check`, `pnpm guide:check`, `pnpm guide:eval`.
- When merging guide content, conflicts in `apps/hoa/src/generated/guide.ts` are routine: `git checkout --theirs` the file, then rerun `pnpm guide:build`.
- Use `/usr/bin/git` for SHAs and ancestry checks; rtk hides merges.
- **Known traps:**
  - A single test file can time out under load; re-run it alone.
  - The Inngest wiring contract test pins the job count (21 now). Bump it when you add a job.

## 4. State (updated 2026-10-21 21:05 ET)

- **Live in prod:** `61922088` (live at 20:39 ET).
  - Since 11:56: insurance renewals, fidelity bond vs funds, and the owner insurance page (17:07); bank CSV/OFX import, untick street homes, the Spanish editor, and SMS via the Messages API (18:3x); the election planner, the /compliance page (read-only until M5), cure-before-hearing with the SEC3-M1 fix, and the HO-6 notice (20:39).
  - Release notes: 2026-10-21-1700, -1810, -1930.
- **M5 (0069) not applied:**
  - Parts 1 (BL-137 dues rates), 3 (BL-143 join requests) and 4 (BL-145 evidence) are merged behind `M5_APPLIED=false`. BL-141 needed no migration.
  - Security review #3 Lows L2–L5 are being fixed inside 0069 before Asaf applies it. Once they land, add an OA for runbook Section L.
  - After Asaf confirms: flip `packages/db/src/m5.ts`, un-draft `dues-rate-schedule`, `members-ask-to-join` and `compliance-obligations`, and deploy hoa + jobs.
- **Emails to Asaf:** owner actions (on change, and Mondays 09:07) and the backlog digest (on script change, and Mondays 09:12; 47 open at first send).
- **New trap:** CI's schema replay re-grants ALL ROUTINES to anon. A SECURITY DEFINER function must refuse a null `auth.uid()` in its own body; a REVOKE is not proof. Never loosen a security test to pass CI: fix the SQL.
- **Georgia first** (§2): the decks lead with Georgia, and the CI shots include a Georgia demo association. Owner action OA-9 (`state:'GA'`) loads the verbatim Georgia law into prod; until then, prod holds the paraphrased seed.
- **Database:** the owner applied and Claude verified every runbook section A–K on 2026-10-20 (0063, M1/0064, meeting notices, SMS consent guard, sender_auth, perf indexes, 0065, 0066, 0067, 0068). Owner actions OA-1/2/3/4/17/21 are done.
- **Flags:** all true: M1_APPLIED, SENDER_AUTH_COLUMN_LIVE, RECORDS_REQUESTS_LIVE, VIOLATION_FINED_STATUS_LIVE, M3_APPLIED, M4_APPLIED. PRICING_V2 stays off until OA-16 (the Stripe prices).
- **Optional now:** `pnpm gen:types` against the live DB to replace the casts (every migration is applied). Diff columns, not just tables (CLAUDE.md §3).
- **Security:** docs/backlog.md "Security review 2026-10-20". All High and Medium findings are fixed. Lows closed: http.ts body-size caps (SEC-L8), platform-admin invites guarded (SEC-L9), subscription.updated race mitigated by reconcile-to-newest (SEC-L10; a locked SQL function is the eventual fix). SEC-L7 closed (pdfjs-dist with caps). Open: the Stripe portal quantity setting is an owner dashboard action (SEC-L11, OA-25).
- **Traps:**
  - Never `git commit -a` after a conflicted merge (this happened twice today). Resolve, check `git diff --name-only --diff-filter=U` is empty, then commit.
  - The Inngest job count is pinned in TWO tests.
  - Run `pnpm install` after lockfile changes.
  - rtk's vitest summary can hide load failures; a vitest worker timeout is a flake, so rerun.
- **Backlog:** round 3 open: BL-131 full (0067), BL-132, BL-133, BL-134 (needs a migration), BL-114 receipts (needs a board opt-in), BL-136 late-fee marker, BL-124 GA snapshot refresh before 2027-01-01.
- **Classifier limits hit this session:**
  1. A "nothing stays on Asaf" rule in next.md.
  2. Probing credentials.
  3. Auto vendor COI emails (OA-19).
  4. An agent's `git stash drop`.

  None were worked around.
- **Crons (this session):** hourly cycle `23 * * * *`; renewal one-shot on Oct 26 at 14:41. Recreate them per §3.

## 5. Manual steps for Asaf: `docs/owner-actions.md`

The single list is `docs/owner-actions.md` (OA-1, OA-2…). Asaf asked on 2026-10-20 to get these **by email** so he doesn't miss them: the owner-actions workflow emails him whenever the open items change, and every Monday at 09:07 ET.
- When a new manual step appears, add it there with the next OA id (never reuse one). When he says it's done, move it to Done.
- Never put secrets or leaked-key details in it; the repo is public.
- Most urgent: OA-1, migrations 0063 then M1 (subscription webhook writes fail until then). Also OA-14: turn on the Stripe webhook events `customer.subscription.updated` and `invoice.payment_failed`.
- **Asaf, 2026-10-20:** even with items pending on him, keep allocating backlog items to the team (3–4 agents always busy).

## 6. Work in flight (2026-10-20 18:30 ET)

- No agents running. Next candidates: round 3 BL-114 (board opt-in receipts), BL-132/133/134 (batch a 0067 migration), and the open security Low items.
- If a session closes, check `/usr/bin/git worktree list` for `worktree-agent-*` branches with commits not in claude/quality-oracle.

## 7. Next up

- **Inbox:** attachments to the documents library, batch replies. Phase B needs SQL (migration 0065).
- **Communications:** A10 guide rewrite, A11 a unified "Messages" area.
- **Review the `[perf]` logs** in Vercel, then fix the slowest pages.
- **Browser check:** the new inbox convert menu, composer and billing banner have not been viewed in a browser (Asaf uses Safari only; ask in the release note).
- **Keep the decks current** in `~/HomeownerHub-decks/`.
- **Backlog items needing migrations, by batch:** M-P1/M-P2 (people), M2 (BL-068 modules, BL-069 law sync, BL-023 polls), BL-085 columns.
