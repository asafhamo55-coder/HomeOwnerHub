---
name: api-audit-fix
description: Audit an HTTP API repo with a team of 4 teammates (tests/flakiness, route handlers, shared store state, API consistency) who explore independently, challenge each other and converge on a deduplicated, prioritized PROBLEMS.md — then run a workflow that fixes every route handler under src/routes/ in parallel and adversarially verifies each fix against this skill's route conventions. Use when the user asks to audit and fix an API's routes, error envelopes, validation or pagination, or invokes /api-audit-fix.
argument-hint: "[audit-only | fix-only] [repo path]"
---

# API audit → fix

Two stages, run in order. Invoking this skill is the user's opt-in to both the
teammates and the Workflow call below. `audit-only` stops after stage 1;
`fix-only` skips to stage 2 using the existing PROBLEMS.md.

Skill folder (call it `SKILL_DIR`): the directory holding this file.
`SKILL_DIR/route-conventions.md` is the standard every fix is verified against.
`SKILL_DIR/fix-routes.workflow.js` is the stage-2 workflow.

## Stage 0 — scout (you, inline, a few tool calls)

1. Repo root: the argument if given, else the current git root.
2. Confirm the targets exist; adapt, don't invent:
   - routes dir: `src/routes/` (else find the folder of HTTP handlers and say so),
   - store: `src/store.ts` (else the module holding shared mutable state),
   - test command (package.json `test` script or equivalent).
   If there are no route handlers at all, stop and tell the user this skill does not fit the repo.
3. List every route file (relative paths). Create `.audit/` in the repo root
   (add it to `.git/info/exclude`, never to the tracked `.gitignore`).

## Stage 1 — the audit team

### 1a. Explore independently
In ONE message, spawn 4 background teammates with the Agent tool
(`subagent_type: general-purpose`), descriptions `audit:tests`, `audit:routes`,
`audit:store`, `audit:consistency`. Each prompt must contain: the repo root,
its lane below, the list of route files, `SKILL_DIR/route-conventions.md` to
read first, and these rules:

- Read-only on source: no edits outside `.audit/`. Do not look at other lanes' files yet.
- Write findings ONLY to `.audit/lane-<lane>.md` (own file — no shared writes, no races).
- One finding per block, exactly this shape:
  ```
  ### <lane>-<n>: <one-line title>
  - severity: P0 | P1 | P2 | P3   (P0 data loss/security/crash, P1 wrong behavior clients see, P2 drift/inconsistency, P3 hygiene)
  - location: path:line[, path:line…]
  - evidence: the code or command output that proves it (quote it)
  - impact: who/what breaks, concretely
  - fix: the smallest change that resolves it
  ```
- Every finding needs evidence a reader can re-check. No evidence → don't file it.

Lanes:
1. **tests** — run the suite several times (at least 5; also with randomized order / in parallel if the runner supports it). Find flaky tests and the ROOT cause of each (shared state between tests, ordering, timers, real network/ports, unawaited promises, leaked handles). Cite the run that failed.
2. **routes** — every file in the routes dir, against route-conventions.md: error-envelope drift, input validation (missing, inconsistent, after side effects), pagination drift (param names, defaults, caps, response meta). Note which file is closest to the conventions — the reference implementation.
3. **store** — the shared-state module: module-level mutable state, races between concurrent requests, missing reset between tests, leaked references (callers mutating returned objects), unbounded growth, id generation.
4. **consistency** — the API as a whole: naming, casing, status codes, HTTP verbs, response shapes, headers, versioning, how docs/types match the behavior.

Wait for all 4 completion notifications. Never predict their results.

### 1b. Challenge each other
Send each teammate (SendMessage, by its agent id) the paths of the OTHER three
lane files with: "Challenge these. For each finding append to
`.audit/challenge-<your lane>.md` one line: `<id>: CONFIRM | DISPUTE <reason + evidence> | DUPLICATE-OF <id> | REPRIORITIZE <P#> <reason>`.
Also add any finding the others missed that falls in your expertise, in the
finding format. Re-check evidence yourself; default to DISPUTE when you can't
reproduce." Wait for all four.

### 1c. Converge into PROBLEMS.md
Spawn one fresh `general-purpose` agent (the converger) with all 8 `.audit/`
files. It writes `PROBLEMS.md` at the repo root:

- **Drop** a finding disputed with evidence by ≥2 teammates and confirmed by none; when contested 1–1, re-check the code itself and decide, noting why.
- **Merge** duplicates into one entry listing every location.
- **Prioritize** by severity, then by blast radius (number of routes/clients affected).
- Number entries `P-001…` in priority order, each in the finding format plus
  `- lanes:`, `- route files:` (paths under the routes dir this touches, or `none`), `- status: open`.
- Start the file with `## Route conventions (this repo)`: the envelope, validation and pagination shape the fixes must converge on, taken from route-conventions.md and adjusted to the reference implementation the routes lane found. Note any deliberate deviation from route-conventions.md and why.
- End with `## Dropped findings` (id, one-line reason) so nothing vanishes silently.

Read PROBLEMS.md yourself and give the user: counts by priority, the top 5, how many findings were dropped or merged. With `audit-only`, stop here.

## Stage 2 — fix workflow

Call the Workflow tool with `scriptPath: SKILL_DIR/fix-routes.workflow.js` and args:
```json
{ "repo": "<abs repo root>", "routesDir": "src/routes", "problems": "<abs>/PROBLEMS.md",
  "conventions": "<abs SKILL_DIR>/route-conventions.md", "routeFiles": ["src/routes/a.ts", "…"],
  "testCommand": "npm test" }
```
It plans which problems belong to which route file, fixes every file in parallel
(one agent per file, editing only that file), has 3 skeptics per file try to
refute the fix against the conventions and the assigned problems, repairs once
when refuted, then runs the test suite once at the end.

If the Workflow tool is not available in this session (some cloud/routine
sessions), run the same steps by hand with the Agent tool: one planning agent,
the foundation agent if needed, then one fixer per route file in a single
message, then 3 skeptic agents per file (lenses: conventions, problems,
regressions; default refuted when unsure, pass needs ≥2 of 3), one repair round
for refuted files, and one final test-suite agent. Same prompts and rules as
`fix-routes.workflow.js`.

When it finishes, report from its result — never from expectation:
- per file: fixed / repaired-then-fixed / NOT verified (with the skeptics' reasons),
- problems marked resolved vs still open (update each `status:` in PROBLEMS.md to `fixed` or `open — <reason>` accordingly),
- problems outside the routes dir (tests, store) that this stage does not fix — list them,
- the final test run's real output summary. Do not commit unless the user asks.
