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

## 4. State (updated 2026-10-20 10:10 ET)

- **Live in prod:** `744a492`, deployed 10:02 ET; release email sent.
- **Integration tip (local, gating):** release note `docs/releases/2026-10-20-1053-state-law-resale-roster.md`; deploy at or after 11:02 ET. It contains:
  - TX/GA resale paperwork and CA/TX law loaders (OA-9 to load prod);
  - the records-request roster and "Scan as a bill";
  - the Copilot state-law tool and BL-106 caps;
  - BL-108 AI spend ceiling (behind PRICING_V2) and BL-109 held statuses;
  - BL-110 resident SMS opt-in and inbox draft metrics.
- **Backlog:** groomed 2026-10-20. Pick work from docs/backlog.md "Ranked open work (groomed 2026-10-20)".
- **Classifier limits hit this session:**
  1. Writing a "nothing stays on Asaf" rule into next.md.
  2. Probing local credentials.
  3. Restoring automatic vendor COI emails (OA-19).

  None were worked around.
- **Crons (this session):** hourly cycle `23 * * * *`, renewal one-shot on Oct 26 at 14:41, and a deploy one-shot at 10:57 (deploy only once 744a492 is 1h old, i.e. 11:02+). Recreate them per §3 in a new session.

## 5. Manual steps for Asaf: `docs/owner-actions.md`

The single list is `docs/owner-actions.md` (OA-1, OA-2…). Asaf asked on 2026-10-20 to get these **by email** so he doesn't miss them: the owner-actions workflow emails him whenever the open items change, and every Monday at 09:07 ET.
- When a new manual step appears, add it there with the next OA id (never reuse one). When he says it's done, move it to Done.
- Never put secrets or leaked-key details in it; the repo is public.
- Most urgent: OA-1, migrations 0063 then M1 (subscription webhook writes fail until then). Also OA-14: turn on the Stripe webhook events `customer.subscription.updated` and `invoice.payment_failed`.
- **Asaf, 2026-10-20:** even with items pending on him, keep allocating backlog items to the team (3–4 agents always busy).

## 6. Work in flight (2026-10-20 10:10 ET)

Worktree agents. If the session closes, check `/usr/bin/git worktree list` for `worktree-agent-*` branches with commits not in claude/quality-oracle.
- **BL-111:** SMS consent tied to the phone number (hash match at send), plus a Vonage inbound STOP/START route behind SMS_INBOUND_ENABLED.
- **BL-112:** meter every AI call; kill switch inside the shared AI client; job and embedding usage counted.
- **BL-104 leftovers:** nightly band-sync, grandfathered renewal-notice job, SMS allowance (all behind PRICING_V2).

## 7. Next up

- **Inbox:** attachments to the documents library, batch replies. Phase B needs SQL (migration 0065).
- **Communications:** A10 guide rewrite, A11 a unified "Messages" area.
- **Review the `[perf]` logs** in Vercel, then fix the slowest pages.
- **Browser check:** the new inbox convert menu, composer and billing banner have not been viewed in a browser (Asaf uses Safari only; ask in the release note).
- **Keep the decks current** in `~/HomeownerHub-decks/`.
- **Backlog items needing migrations, by batch:** M-P1/M-P2 (people), M2 (BL-068 modules, BL-069 law sync, BL-023 polls), BL-085 columns.
