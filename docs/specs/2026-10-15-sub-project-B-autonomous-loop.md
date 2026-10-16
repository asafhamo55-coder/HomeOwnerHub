# Sub-project B: the autonomous self-healing loop

**Date:** 2026-10-15
**Status:** Design. Decisions taken by the author, reasoning recorded inline.
**Depends on:** Sentry DSNs configured (`docs/OBSERVABILITY.md` §"Turning it on");
sub-project A's integration suite (already gating CI).
**Out of scope:** the approval layer (D), chaos/scale testing (C), UI (E).

---

## 1. What exists today, with evidence

| Fact | Evidence |
|---|---|
| Sentry is wired everywhere but sends nothing until a DSN is set | `docs/OBSERVABILITY.md:3-6` |
| Every failed Inngest attempt reaches Sentry; retries are `warning`, the last attempt is `error`, fingerprinted per function | `packages/jobs/src/failure-reporting.ts:35-49` |
| Inngest failures land in the **hoa** Sentry project (jobs run inside the hoa deployment) | `docs/OBSERVABILITY.md:63-64` |
| Events carry `release` = deployed SHA and `app` tag | `docs/OBSERVABILITY.md:19-23` |
| A canary route creates a known Sentry issue on demand, behind `CRON_SECRET` | `docs/OBSERVABILITY.md:69-72`, `apps/hoa/src/app/api/cron/sentry-test/` |
| `/api/health` never returns 500, so you have to read `ok` from the body; it also reports the deployed SHA | `apps/hoa/src/app/api/health/route.ts:12-14`, `:246` |
| `/api/health` is polled only when a deploy happens, never on a schedule | `.github/workflows/smoke.yml:3-12`; `docs/OBSERVABILITY.md:84` |
| The smoke probe targets three hosts; marketing has no health route | `smoke.yml:56,76,96`; `apps/*/src/app/api/health/route.ts` (hoa, pm, eviction only) |
| CI runs on push to `claude/**` and on PRs to `main` only | `.github/workflows/ci.yml:3-10` |
| The production branch is `claude/phase1-homeownerhub-setup-MILNu`, so a PR targeting it does **not** trigger the `pull_request` CI run | `ci.yml:8-10`; `docs/NEXT.md:8` |
| The integration suite exits the process if Supabase is not loopback | `tests/integration/setup/env.ts:37`; quality-oracle spec §2 |
| The owner applies migrations by hand, and committed migrations can sit unapplied | `docs/NEXT.md:28-30` |
| The repo is **public** (`gh repo view` → `visibility: PUBLIC`) | checked 2026-10-15 |
| No real users yet: production will rarely show a bug on its own | quality-oracle spec, "The decisive constraint" (`docs/superpowers/specs/2026-10-15-quality-oracle-design.md:37-43`) |

There are two consequences. First, the loop's input is thin until Sentry is
turned on and synthetic traffic exists, so phase 1 is worth something mainly as
a **detector of the detectors**. Second, because the repo is public, every GitHub
issue body and every Actions log in it is public. That decides where the loop
runs (§4).

## 2. Detection sources

| # | Source | How it is read | What it catches |
|---|---|---|---|
| S1 | **Sentry issues** (hoa, pm, eviction, marketing projects) | Sentry REST API, read-only token (`event:read`, `project:read`). Unresolved issues with `level:error`, `lastSeen` inside the window | Uncaught server/edge/browser errors, `reportError` calls, Inngest final-attempt failures (tag `source:inngest`) |
| S2 | **Inngest failures** | Through S1, using tags `inngest.function` and `inngest.final_attempt=true`. No separate Inngest API reads in phase 1 | Jobs that gave up |
| S3 | **Inngest missed runs** | Phase 2. For each `cron:` in `packages/jobs/src/*.ts` (13 schedules), check that a run happened within its period through the Inngest REST API. *Spike first:* confirm the endpoint and the free-tier API access. If either is missing, fall back to a heartbeat row written by each job | Crons that never fire. Quality-oracle finding F1 was two jobs unregistered for months, which no error source can see |
| S4 | **`/api/health` probes**, every tick (30 min, see §4) | `curl` the three hosts and parse `ok`, `probes.*.ok` and `version`. Never trust the status code (route.ts:12-14). **HOA (since the api-route-conventions fix, C-15):** the public body is only `{ ok, app, version }` and runs only the DB probe; unhealthy is a 503 `{ error: { code, app, version } }` envelope (`not_configured` for a missing required env var, `upstream_unavailable` for a DB failure). The AI probe, `probes.*`, `models` and `env` are on the details tier only, so S4 must send `Authorization: Bearer $EMBEDDING_PROBE_KEY` to HOA to catch an AI outage (never `?key=`; never `?probe=embedding` on a tick, it is billed) | DB unreachable, AI provider or model retired (the 2026-08 outage; HOA: bearer tier only), version drift between apps |
| S5 | **Smoke workflow results** | `gh run list --workflow smoke.yml` and look at the conclusion of the latest production run | A deploy that went out red |
| S6 | **CI on the production branch** | `gh run list --workflow ci.yml --branch <prod>` | A red main line, so nothing builds on top of it |

**Detector self-test.** `docs/NEXT.md:58-63` records five green signals that
proved nothing. So the loop proves its own eyes work. Once a week it calls
`/api/cron/sentry-test` and must then find that issue through S1 within 10
minutes. If it can't, it raises a `detector-blind` escalation. Without this
check, a revoked Sentry token would look exactly like "no errors".

## 3. Triage

The classification is deterministic: a rules table with no LLM in it. Each
signal gets a **fingerprint** (Sentry issue id, or `health:<app>:<probe>`, or
`cron-missed:<fn>`) and exactly one class:

| Class | Rule | Action |
|---|---|---|
| `security` | Any signal from RLS, auth, storage policy or `org_members` paths, or an error message matching `permission denied`/`row-level security` | Escalate immediately, P0. Never autofix |
| `config` | Health probe failing with `not set`, a 401/404 from a provider, a retired model id | Escalate with a diagnosis. Env vars belong to the owner (memory: `AI_MODEL` is team-level and invisible to `vercel env ls`) |
| `outbound-or-money` | Stack or `inngest.function` touches `mailbox-send`, `ticket-notifications`, `web-push`, `daily-digest`, `*-late-fees`, `recurring-jes`, `plaid-sync`, W18 | Escalate. These paths send to residents or post to ledgers (`docs/NEXT.md:34-38` on W18) |
| `regression` | `firstSeen` release equals the current deployed SHA | Escalate with commit range `prev..current`. The fix candidate is the diff |
| `transient` | Provider 5xx or timeout, fewer than 5 events in 24h, not on a final attempt | Record only. Re-classify if it persists 24h |
| `code-defect` | Top in-app stack frame resolves to a file in this repo, matches no class above, and has ≥ 2 events | Candidate for autofix (phase 3) |
| `unknown` | Anything else | Escalate |

Two decisions about triage:

- **The rules come first and the LLM second.** Triage runs on every tick, so it
  has to be free and reproducible. An LLM is called only after a signal has been
  classified, and only to write the human-facing diagnosis (phase 2+).
- **A fingerprint is reported once.** The ops-repo issue (§4) is the state. A
  repeat signal adds a comment with the count. It never opens a new issue.

## 4. Where it runs: GitHub Actions in a private ops repo

**Decision:** a new **private** repo, `HomeownerHub-ops`. Its scheduled
workflow (`*/30 * * * *`) checks out the public repo read-only for code context
and keeps its state as issues in the ops repo.

| Option | Verdict | Why |
|---|---|---|
| Inngest function | Rejected | It runs inside the hoa deployment (`OBSERVABILITY.md:63-64`), the thing being watched. When hoa is down the watchman is down too. It would also need Sentry and GitHub tokens in the production env |
| Scheduled cloud agent (Claude routine) | Rejected for detection | It pays for LLM tokens on every tick even when nothing is wrong, and a model is the wrong tool for "is `ok` true". Kept for phase 2-3 triage, called **from** the Action |
| Actions workflow in the **public** repo | Rejected | Issues and run logs are public, and stack traces carry ids, paths and partial messages. `scrubEvent` reduces PII but was never built for public disclosure |
| **Actions in a private ops repo** | **Chosen** | Independent of Vercel and Inngest, deterministic, and private by default. Escalations reach the owner as ordinary GitHub notifications, so no new channel is needed. The deploy-triggered `smoke.yml` stays where it is |

Private-repo Actions minutes are metered: the free plan includes a monthly
allowance. A 15-min tick of about 1 runner-minute is around 2,900 min/month,
which is over the allowance. **So the tick runs every 30 min (around 1,450
min/month) and probes only.** The heavy jobs (weekly self-test, phase 3 fix
runs) are triggered separately. ADR-004's 80% escalation rule applies
(`docs/decisions/004-zero-cost-tier.md:68-76`).

## 5. What it may fix vs must escalate

**May autofix (phase 3 only), all of these at once:**
class `code-defect`; the diff touches only `apps/**` or `packages/**`
(not under `migrations/`, `.github/`, `packages/db/`, auth/RLS/storage-policy
code, or any path in the `outbound-or-money` list); at most 3 files and 60
changed lines; no `package.json`/lockfile changes; no env var needed; and it
ships with a **new regression test that fails on the pre-fix tree and passes
after**. The loop proves this by running the test alone before applying the
fix. Removing or skipping existing tests, or lowering an assertion, is an
automatic reject: a diff that removes `it(`/`expect(` lines or adds
`.skip`/`.only` is refused.

**Must escalate:** everything else. Specifically: anything that needs a migration
(owner-applied, `docs/NEXT.md:28-30`), env or provider changes, data repair,
security, outbound/money paths, regressions (the owner chooses fix-forward or
revert), and **rollbacks**. Vercel instant rollback is not autonomous: rolling
code back across three projects while a migration stays applied can create a
schema/code mismatch worse than the bug.

## 6. Safety rails

Each rail holds because of **what the loop doesn't have**, not because of what
it is told:

1. **No production DB credential.** The ops repo holds no
   `SUPABASE_SERVICE_ROLE_KEY`, no anon key and no DB URL. Fix runs execute the
   integration suite against a loopback stack, and `assertLoopbackOrDie`
   (`tests/integration/setup/env.ts:37`) aborts anything else.
2. **No send capability.** No Resend, Gmail OAuth, VAPID or Twilio secrets. Even
   a mistaken code path cannot mail a resident. Unit and integration runs set
   `AI_API_KEY=local` as the existing suites do.
3. **No deploy capability.** No Vercel token. The loop's only write to the
   public repo is pushing a `claude/autofix/<fingerprint>` branch and opening a
   PR, using a fine-grained token scoped to `contents:write` plus
   `pull_requests:write` on that repo, with no admin and no workflow scope.
4. **Same gates as a human.** Pushing to `claude/**` triggers `ci.yml`
   (typecheck, typecheck:integration, build, test:unit, test:integration). The
   fix run also executes them locally before pushing. *Prerequisite:* add the
   production branch to `ci.yml`'s `pull_request.branches` (today it's `main`
   only, lines 8-10) and make all five checks required by branch protection.
   Phase 3 does not start until a deliberately failing PR is confirmed blocked.
5. **Never merges in phases 1-3.** Every PR waits for the owner. Auto-merge
   (phase 4) is a separate decision, not part of this spec.
6. **Kill switch.** Repo variable `LOOP_ENABLED=false` makes every job exit 0
   on its first step.
7. **No PII in public places.** PR bodies contain the fingerprint, class,
   file:line and the test name. No event payloads, messages or user ids
   (matches the memory rule "no PII in script output").

## 7. Cost controls

- Detection (S1-S6, triage) is deterministic and costs $0 in tokens.
- An LLM is invoked only for a **new** fingerprint, at most once per fingerprint
  per 24h.
- Hard caps, held in ops-repo variables: `MAX_AGENT_RUNS_PER_DAY=3`,
  `MAX_TURNS=40` per fix run, a 30-min job timeout, and a monthly API spend
  ceiling enforced as a provider-side key limit (a limit we only check
  ourselves is a limit the loop can talk itself past).
- The fix run uses the Claude Code GitHub Action with the repo's existing
  `CLAUDE.md`, so the documented footguns (rtk's tsc filter, `pnpm lint`) are in
  context. The verification commands are the trusted list from `CLAUDE.md`
  "Commands you can actually trust".

## 8. Phased rollout

| Phase | Scope | Exit criterion |
|---|---|---|
| **0: prerequisites** | Owner sets Sentry DSNs and runs the `OBSERVABILITY.md` verification. Create the ops repo and a read-only Sentry token | `sentry-test` issue visible with a readable stack |
| **1: read-only** | S1, S2, S4, S5, S6 plus triage. One ops-repo issue per fingerprint, labelled by class, with evidence links (Sentry URL, run URL). Weekly detector self-test. A daily digest issue comment summarises the open fingerprints. **No LLM, no branches, no PRs** | 14 days with zero false `detector-blind`, and every real incident in that window has an issue |
| **2: diagnose** | Adds S3 (missed crons) and an LLM-written diagnosis comment on new `code-defect`/`regression` issues: suspected file:line and commit range. Still no code changes | Owner rates 10 diagnoses; at least 7 are useful |
| **3: propose fixes** | For `code-defect` within the §5 allowlist: branch, failing test, fix, all five gates, PR. Never merges | Prerequisite rail 4 proven; the first 10 PRs are reviewed, and the reject rate drives whether it continues |
| **4: (not specified)** | Auto-merge for a narrower class | Needs its own spec and an explicit owner decision |

## 9. Open risks

- **Thin signal.** With no users, S1 stays near-empty until A's synthetic flows
  run against production. Phase 1's real value is S4/S5/S6 and the self-test.
- **Inngest API access** (S3) is unverified. A spike happens before phase 2.
- **Free-tier quotas** (Sentry events, Actions minutes) are monitored under
  ADR-004. A noisy error loop could exhaust Sentry's free quota and blind S1;
  the self-test would catch that.
