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
- **App:** https://www.homeownerledger.com. It is moving to app.homeownerledger.com (§5).
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

## 4. State at handoff (2026-10-20 ~07:00 ET)

- **Live in prod:** `05adcce`, deployed 01:46 ET. It includes:
  - the HomeownerHub brand and blue palette;
  - the resident assistant, off until a board turns it on;
  - estoppel, collections letters and the budget notice, with print gates;
  - the payment-plan double-count fix;
  - BL-099 streaming and skeletons;
  - inbox A1–A3/A6;
  - communications fixes: scheduled sends now actually send, honest SMS status, opt-outs respected, 7 built-in templates;
  - the Stripe sandbox suite and webhook error fixes.
- **Integration tip:** `56003e1`, CI green. The only change beyond prod is a release-note screenshot rule fix (test-only and CI-only commits now count as screen-neutral). It goes out with the next feature deploy.
- **Recent decisions:** see `docs/decisions/2026-10-19-*.md`, especially owner-delegated-defaults, brand-logo-palette, resident-assistant-default and hide-pm-eviction.

## 5. Waiting on Asaf (manual steps; list them, don't ask)

1. **Migrations, in order:**
   1. `0063`: `docs/specs/2026-10-16-rls-sweep-apply.sql`, starting with Part 1a.
   2. **M1**: `docs/specs/2026-10-18-m1-apply.sql`. Then flip `M1_APPLIED` in `packages/db/src/m1.ts`.
   - **Urgent:** before 0064 (M1), HOA subscription webhook writes fail, so paying orgs stay on Free. Stripe now retries for 3 days.
2. **Payment-plan correction:** run `docs/specs/2026-10-19-payment-plan-double-count.sql`. Parts 1–2 are read-only; Part 3 ends in ROLLBACK, so review it before you change that to COMMIT.
3. **Performance indexes:** `docs/specs/2026-10-19-perf-indexes.sql`. Run the 12 CONCURRENTLY statements one at a time.
4. **Resident meetings page:** `docs/specs/2026-10-19-resident-meeting-notices.sql`, after 0063 and M1.
5. **Domain split:** runbook `docs/specs/2026-10-19-domain-split.md`. Step 1 is done (app.homeownerledger.com was added to the Vercel project). Asaf's steps:
   - DNS at Network Solutions: CNAME `app` → `afa3394a804e31cd.vercel-dns-017.com.`
   - Supabase Auth: add `https://app.homeownerledger.com/**` to Redirect URLs.
   - Google OAuth: add the redirect `https://app.homeownerledger.com/api/oauth/google/callback`.
   - Webhooks: move Stripe, Resend and Plaid to app; re-sync Inngest.
   - Vercel: connect the `homeownerhub-marketing` project to git (prod branch, root `apps/marketing`). It has no git link, which is why it hasn't deployed in 148 days.

   After those, Claude runs runbook steps 3–7.
6. **Stripe test keys:** `gh secret set STRIPE_TEST_SECRET_KEY` and `gh secret set STRIPE_TEST_WEBHOOK_SECRET`, and save the test-mode Customer Portal settings once. See `docs/specs/2026-10-19-stripe-sandbox.md`. Also confirm live vs test mode: a checkout URL with `cs_live_` means live.
7. **Stripe product name:** rename "HOA Hub" in the Stripe dashboard. Then change `PRODUCT_NAME` in setup-stripe-pricing in the same step.
8. **Inngest:** confirm `communications-scheduled-dispatch` appears after sync. Scheduled messages need it.
9. **Other:**
   - Vonage keys and 10DLC, if texting is wanted.
   - Is support@homeownerledger.com a real inbox?
   - The FL state-law refresh (`fetch('/api/admin/refresh-state-law',{method:'POST'})` as platform admin).
   - The S-01 audit query.
   - Rotate the leaked Supabase key before any investor due diligence (owner accepted the risk earlier).

## 6. Work in flight when the session closed (agents die with the session)

Check each worktree with `git -C <path> status` / `diff`. Finish the work in place or re-dispatch it with the same brief:

- `.claude/worktrees/agent-a18892f00b3cbda1b`: inbox sale window plus A4 one-click convert. It had partial edits to `lib/inbox/account-context.ts`, `draft/account-fragments.ts`, `ContextSections.tsx` and `resident-assistant/reads.ts`, plus a new `account-sale-window.test.ts`.
- `.claude/worktrees/agent-a83082c556b01bf17`: Stripe follow-ups (handle `customer.subscription.updated`, past_due banner, friendly checkout errors, record `invoice.payment_failed`). Little or no progress.
- `.claude/worktrees/agent-a6376bc69df5f0064`: communications A2 one-box composer plus A3 plain-text editor. Little or no progress.
- The briefs are in `docs/research/2026-10-inbox-plan.md` and `2026-10-communications-plan.md` (Phase A).

## 7. Next up, after the in-flight work

- **Inbox Phase A, the rest:** saved replies, mobile triage, attachments to the documents library, and batch replies. Phase B needs SQL (migration 0065 in the plan).
- **Communications Phase A, the rest:** A5 plain-language audiences (street), A7 phone preview, A6 channel auto-pick, A8 results page with resend, A9 hiding advanced options, A10 guide rewrite, A11 a unified "Messages" area.
- **Review the `[perf]` logs** in Vercel after real traffic, then fix the slowest pages.
- **Pricing:** an advisor-reviewed pricing analysis. $4.99/door is about 3–4× PayHOA for small HOAs (BL-001 refresh, BL-068 module pricing).
- **Keep the decks current** in `~/HomeownerHub-decks/`.
- **Backlog items needing migrations, by batch:** M-P1/M-P2 (people), M2 (BL-068 modules, BL-069 law sync, BL-023 polls), BL-085 columns.
