# next.md — start the next session here

Written 2026-10-22 ~13:50 ET, when session f99e6621 closed (Asaf: "update next.md with all guidance and close this session").
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
> 4. Refresh the product deck and the investor deck (`~/HomeownerHub-decks/`) so they match what is live and merged, then keep them current every cycle (§2 "Presentations stay current").
> 5. Run the cycle.
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
- **App:** https://www.homeownerledger.com. It will move to https://homeownerledger.online, its own apex domain (owner decision 2026-10-21). That move is **paused by Asaf** ("leave it for later phase"): the domain already serves the app with a certificate, and the DNS A record and the Supabase and Google allow-lists are done. What's left is in OA-5. Don't change env vars or move www until he resumes it.
- **Marketing site:** `apps/marketing`, at https://homeownerhub.vercel.app. **Connected to GitHub on 2026-10-21** (Vercel project `homeownerhub-marketing`, production branch = the prod branch, root `apps/marketing`). It now deploys on every prod push. Asaf: "make sure you can start work on the web site and manage it". So the website is ours to build and maintain under the same loop and gates. It moves to www only with OA-5.
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
- **Default engine: Sonnet 5.5** (Asaf, 2026-10-26: "use Sonnet 5.5 as default engine"). Dispatch every subagent with `model: "sonnet"`. Use Opus only as the advisor for a genuinely uncertain call. The main session's own model is Asaf's `/model` choice.
- **Hold only for manual steps** Asaf alone can do: SQL in Supabase, keys or accounts, DNS, and the Vercel, Stripe, Google or Supabase dashboards. List the exact steps for him; don't ask permission.

### Go-to-market: we begin with Georgia (Asaf, 2026-10-21)
- **Georgia is the launch state.** FL, CA and TX stay supported, but Georgia comes first when choosing what to build, test, word or demo: GA statute coverage (the O.C.G.A. § 44-3 snapshot, BL-124 refresh before 2027-01-01), the GA Secretary of State registration (SB 406), GA-specific paperwork and copy, and GA examples in the decks and marketing.
- Before ranking backlog items, ask: "does this help a Georgia board first?"

### SEO is the primary growth channel (Asaf, 2026-10-26: "invest the most in SEO")
- The marketing site's main job is ranking for what Georgia boards search, then turning visitors into demo requests.
- Every day the loop dispatches a Sonnet SEO agent that ships at least 3 new or improved pages (BL-172). A full SEO audit runs weekly.
- Quote law only from the official fixtures; describe shipped features only.
- Plan and quality bar: `docs/decisions/2026-10-26-seo-primary-growth-channel.md`.

### Presentations stay current (Asaf, 2026-10-21; repeated 2026-10-22: "always keep the deck for product and for investors up to date")
- **A standing rule, not a one-off task.** Every cycle checks whether the decks still match the product, and they are refreshed in the same cycle as any deploy or merge that changes a feature, price, brand element, competitor fact or market number.
- **Always keep the product deck and the investor deck up to date** (`~/HomeownerHub-decks/`, outside the repo) with the latest features, market trends, competitor moves and pricing.
- Refresh them whenever a deploy changes what they show, and at least once a day during the loop. Put Georgia first in both (launch market, sizing, go-to-market, examples).
- Never invent traction; keep "ASAF TO FILL" where numbers are unknown.

### Working with Asaf on manual steps (2026-10-21)
- **SQL and scripts are done step by step.** `pbcopy` one step at a time, say what to expect, check his pasted result, then copy the next. Read-only checks can be combined into one query to save pastes.
- **Manual steps go in `docs/owner-actions.md`**, which is emailed to him automatically. When he sends a result, mark the item done there.
- **He may pause a plan** (as with OA-5). Record it as paused with the remaining steps, and don't push it again.
- **The marketing website is ours to manage** (§1). Treat it like the app: gates, release notes, Georgia first.

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

> HOA product cycle, 24/7 mode. Follow next.md §3 and docs/session-handoff.md "The loop". Rules: NEVER use the local DB (no supabase start, local test:integration, seeds or ui:shots locally); the integration gate is GitHub CI on claude/quality-oracle; never run tests or seeds against prod. Dispatch every subagent with model "sonnet" (owner rule 2026-10-26). Steps: (1) if agents are still running, check on them and deploy any gated tip that is waiting; (2) health check (/api/health) and CI status; (3) pick 2–3 backlog items that need no migration and dispatch one worktree subagent per item; plus SEO (owner: "invest the most in SEO"): at least once a day, dispatch a Sonnet SEO agent for BL-172 that ships 3+ new or improved marketing pages (official-fixture quotes only, shipped features only, demo CTA), and a full SEO audit weekly; (4) merge into claude/quality-oracle, run local gates (pnpm typecheck, typecheck:integration, test:unit, marketing build, guide checks), push and wait for CI to go green; (5) deploy at most once per hour (check the last prod deployment's created time via the Vercel API; 60+ minutes, no exceptions): merge the prod branch first, check fast-forward with /usr/bin/git merge-base --is-ancestor, write a docs/releases note (with screenshots; list new SEO pages) inside the deployed SHA, push with `2>&1 | tail -3` (retry up to 3), poll /api/health for the SHA, and confirm the release-notes/email status; (6) keep the product and investor decks in ~/HomeownerHub-decks/ current: dispatch a Sonnet deck-refresh agent when a deploy changes what they show, and at least once a day; (7) update docs/backlog.md (titles inside the bold lead), docs/cycle-log.md and docs/session-handoff.md; (8) report in 3–6 lines (include deck and SEO status). No approvals needed. Hold only for SQL Asaf must paste or keys/dashboards he must handle (list them in docs/owner-actions.md). No real email or SMS to residents; no PII in output; never force-push prod.

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
- `pnpm test:unit > /tmp/q.txt 2>&1`, then grep the summary. It is about 9,300 tests now.
- `pnpm build > /tmp/build.txt` and grep "Tasks: 4 successful". **Never run two builds at once**; they collide on `.next`, which shows up as an ENOENT on the manifest.
- `pnpm guide:build --check`, `pnpm guide:check`, `pnpm guide:eval`.
- When merging guide content, conflicts in `apps/hoa/src/generated/guide.ts` are routine: `git checkout --theirs` the file, then rerun `pnpm guide:build`.
- Use `/usr/bin/git` for SHAs and ancestry checks; rtk hides merges.
- **Known traps:**
  - A single test file can time out under load; re-run it alone.
  - The Inngest wiring contract tests pin the job count (24 now, in two tests). Bump it when you add a job.

## 4. State (updated 2026-10-22 13:50 ET)

> **Update 2026-10-22 18:50 ET (session ed7c42d3):** live in prod is **d0984e66**, with everything below plus BL-152, BL-154 and BL-157. The Vercel OOM is **fixed**: `experimental.cpus: 1` plus `webpackMemoryOptimizations` in apps/hoa/next.config.ts, with the build type check kept on (the classifier refuses skipping it). NODE_OPTIONS is set in Vercel but doesn't matter (it isn't in turbo.json). The "FIRST THING" and "Merged, waiting" bullets below are historical. In flight: BL-155, BL-158, BL-159 and round-6 research. See docs/cycle-log.md.

- **Live in prod:** `edf70ede` (21:51 ET Oct 21): the CINC aging import (BL-031) plus the security review #3 app fixes. Healthy.
- **🔴 FIRST THING: the next deploy failed on Vercel with OOM.** Deploy `86994ea8` reached the prod branch at 23:02 but its Vercel build exited 137 ("Out of Memory", 2 cores / 8 GB). The OOM came after "Compiled successfully", in next build's type-check stage, about 30 minutes in. Prod kept serving edf70ede.
  - Likely fix: add the env var `NODE_OPTIONS=--max-old-space-size=6144` (plain, production + preview) on Vercel project `home-owner-hub-hoa`. Use the `vercel api` POST `/v10/projects/home-owner-hub-hoa/env` from /private/tmp. None exists today. Then redeploy the current prod-branch tip.
  - If it still OOMs, look at the next.config memory options. Don't drop the build type-check silently; if you choose that because CI already gates `pnpm typecheck`, record a decision.
  - Also, `deploy.sh` (scratchpad) exits 0 after its poll times out without saying LIVE. Always confirm `/api/health` shows the SHA.
- **Merged on `claude/quality-oracle` (tip 2e53f2c8, pushed), waiting for that deploy:**
  - **M5 on:** dues rates (BL-137), join requests (BL-143), compliance evidence (BL-145).
  - **BL-147 late-fee policy.** NO late fee until a board saves a policy. This changes billing; the release note says so.
  - **BL-150/151:** GA quorum and proxy rules; elections on /compliance.
  - **BL-148:** GA collections letters (SB 406 § 7 fee notice, § 44-3-232(c)).
  - **BL-153:** GA annual report for owners.
  - **BL-149:** GA registration kit, plus the 2027 registration gate.
  - **Fix:** daily-digest snapshot written via the service role. This was a prod 500 for every board Refresh.
  - The release note `docs/releases/2026-10-21-2255-dues-rates-late-fees-georgia.md` is in. Add a short note for BL-149 and the digest fix.
- **Database:** every migration through **0069 is applied** in prod. Asaf ran Section L on 2026-10-21 and all 30 verification values matched, including `hardened_ok`. OA-28 is done. Flags: M1, SENDER_AUTH, RECORDS_REQUESTS, VIOLATION_FINED, M3, M4 and **M5** are all true. PRICING_V2 stays off until OA-16.
- **OA-10 done:** the S-01 audit found 0 "enter as resident" rows at all.
- **OA-9 (state law load):** GA, FL, CA and TX were all queued (202) from Asaf's Safari console on 2026-10-21. **Not yet verified.** Have Asaf run the count query: `SELECT state, count(*) FILTER (WHERE superseded_at IS NULL) AS current_sections, count(*) FILTER (WHERE superseded_at IS NOT NULL) AS retired, max(last_checked_at) FROM public.state_statutes WHERE state IN ('GA','FL','CA','TX') GROUP BY state;`. Expect GA 18 (+2 retired), FL 36, CA 234, TX 61. If they match, mark OA-9 done.
- **Safari console tip:** Safari's console rejects top-level `await` in a `for` loop. Give Asaf `.then()` chains or an async IIFE.
- **Agents interrupted by the weekly limit (resets Oct 26 11:00 ET).** Re-dispatch them:
  - **BL-152** GA Nonprofit Code pack. Worktree `agent-ace918c626e7aa0a0`; it was fetching Title 14 text, "release 86 ODT".
  - **BL-154** SB 406 2027 readiness, which absorbs BL-124 (deadline 2027-01-01). Worktree `agent-af579646fc43106e1`; it was fetching the official SB 406 enrolled text.
  - Check both worktrees for partial commits first.
- **Emails to Asaf (GitHub Actions):**
  - Owner actions: on change, and Mondays 09:07 ET.
  - Backlog digest: on script change, and Mondays 09:12 ET.
  - Release note: on each deploy.
- **Security:** reviews #1–#3 are in docs/backlog.md. No open High or Medium. Open Lows: L1 (concurrent bank-import commits), L6 (no replay cache on the Vonage webhook), L10 (Info).
- **Traps:**
  - **CI's schema replay re-grants ALL ROUTINES to anon.** A SECURITY DEFINER function must refuse a null `auth.uid()` in its own body. Never loosen a security test to pass CI; fix the SQL. The classifier blocks loosening, correctly.
  - **Don't push to `claude/quality-oracle` while a deploy is waiting on CI for an earlier SHA.** CI cancels the in-progress run and the deploy fails. Push after the prod push.
  - Never `git commit -a` after a conflicted merge. `generated/guide.ts` conflicts are routine: `git checkout --theirs` the file, run `pnpm guide:build`, then commit.
  - New guide articles shift BM25 ranking. Fix the content (keywords, wording), never the eval thresholds.
  - The Inngest job count is pinned in TWO tests (24).
  - rtk hides failures. Use the raw gate commands. A vitest worker timeout is a flake.
- **Classifier limits hit:** the "nothing stays on Asaf" rule; probing credentials; auto vendor COI emails; an agent's `git stash drop`; loosening the 0069 anon assertions; a subagent editing docs/backlog.md (the coordinator grooms it). None were worked around.

## 5. Manual steps for Asaf: `docs/owner-actions.md`

The single list is `docs/owner-actions.md` (OA-1, OA-2…). Asaf asked on 2026-10-20 to get these **by email** so he doesn't miss them: the owner-actions workflow emails him whenever the open items change, and every Monday at 09:07 ET.
- When a new manual step appears, add it there with the next OA id (never reuse one). When he says it's done, move it to Done.
- Never put secrets or leaked-key details in it; the repo is public.
- Most urgent: OA-1, migrations 0063 then M1 (subscription webhook writes fail until then). Also OA-14: turn on the Stripe webhook events `customer.subscription.updated` and `invoice.payment_failed`.
- **Asaf, 2026-10-20:** even with items pending on him, keep allocating backlog items to the team (3–4 agents always busy).

## 6. Work in flight (2026-10-22 13:50 ET)

- **No agents running.** The weekly limit stopped BL-152 and BL-154 (see §4).
- Leftover worktrees: run `/usr/bin/git worktree list` and check `worktree-agent-*` branches for commits not in claude/quality-oracle. Everything reported was merged except BL-152 and BL-154.
- **Crons:** none survive this session. Recreate them per §3.

## 7. Next up (Georgia first)

1. Fix the Vercel OOM and deploy the merged tip (§4), then write a short release note for BL-149 and the digest fix.
2. Verify OA-9 with Asaf (the state_statutes count).
3. Re-dispatch BL-154 (SB 406 2027 text and date-aware rules; hard deadline 2027-01-01) and BL-152.
4. Round 5 remainder: BL-155 GA Condominium Act snapshot; BL-156 e-ballots (needs M6). Write round 6 research when round 5 runs low.
5. **Marketing site** (now deployable): truth pass against shipped features, Georgia-first copy, and the `ledger.ai` contact addresses (domain-split spec, "Unrelated finding").
6. **Decks:** refresh both (last refresh 2026-10-21 evening: 39 and 24 slides). Add dues rates, late-fee policy, join, GA letters, registration kit and annual report.
7. **Owner actions open (20):** see docs/owner-actions.md. OA-5 (domain) is paused at his request.
