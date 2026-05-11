# DevOps

Three layers run the deploy pipeline, each with a different trigger.

## Layer 1 — GitHub Actions (automatic on push)

`.github/workflows/ci.yml` runs on every push to `main` or any `claude/**`
branch and on every PR to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm turbo run typecheck`
3. `pnpm turbo run build` (with inert placeholder env vars)

If CI fails, the GitHub commit / PR shows a red ✗.

`.github/workflows/smoke.yml` runs on Vercel's `deployment_status: success`
event for the Production environment, or on manual dispatch:

1. Identifies the deploy URL Vercel reported
2. Curls `/api/health` on each of HOA, Eviction, PM
3. Asserts `ok: true` in the JSON body
4. Writes a summary into the GitHub Actions run

A failing smoke test does NOT roll back Vercel automatically (Vercel
doesn't expose that primitive). What it does: turn the run red and post
visible failure messages, so you know to manually trigger a rollback or
revert.

## Layer 2 — Local script (run before push)

```bash
./scripts/devops.sh           # full pipeline: verify, push, wait, smoke
./scripts/devops.sh verify    # just typecheck + build
./scripts/devops.sh push      # verify + push
./scripts/devops.sh smoke     # health check the 3 live apps
./scripts/devops.sh status    # repo + remote health snapshot
```

Requires `pnpm`, `git`, `curl`, `jq` — `brew install jq` if missing.

The script's exit codes are stable for chaining:
- `0` everything green
- `1` verify failed
- `2` push failed
- `3` smoke failed
- `4` bad arguments

You can put `./scripts/devops.sh` in a git pre-push hook if you want it
to run automatically on every push. Example
`.git/hooks/pre-push`:

```bash
#!/usr/bin/env bash
exec ./scripts/devops.sh verify
```

## Layer 3 — Claude Code subagent (automatic after code changes)

`.claude/agents/devops.md` defines a Claude Code subagent named `devops`.
When the main Claude session ships a code change, it invokes the agent:

```
Agent({ subagent_type: "devops", description: "post-commit deploy check",
        prompt: "Run the standard pipeline after commit <SHA>." })
```

The subagent runs typecheck, build, push, and reports pass/fail in a
canonical format the main session can parse.

The subagent does NOT modify code. It validates and deploys; it never
remediates. If it reports red, the main session reads the failing log
and decides what to fix.

### Subagent sandbox limitations

The Claude Code Web sandbox blocks outbound HTTPS to `*.vercel.app`
(host allowlist). So the subagent can't directly smoke-test live deploys.
It reports the commit SHA that pushed and tells you to run
`./scripts/devops.sh smoke` locally to verify.

## /api/health endpoint shape

Each app exposes `GET /api/health` (no auth required). Sample response:

```json
{
  "ok": true,
  "app": "hoa",
  "timestamp": "2026-05-11T18:47:00.000Z",
  "version": "abc1234",
  "branch": "claude/phase1-...",
  "supabase_url": "https://xwdjsxfskvreguyvryhc.supabase.co",
  "probes": {
    "db": { "ok": true },
    "ai": { "ok": true }
  },
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true,
    "AI_API_KEY": true,
    "...": "..."
  }
}
```

The `env` block reports presence of each env var by **name only**, never
the value. The endpoint is safe to keep public.

Status codes:
- `200` if `ok: true` (DB reachable + required env vars present)
- `503` if `ok: false`

Middleware excludes `/api/health` from auth so smoke tests work without
a session cookie.

## How to extend

### Adding a new probe to the health endpoint

Add an async `probeFoo()` function in each app's `route.ts`, await it in
`GET()`, include in the `probes` object. Update `ok` if it should gate.

### Adding a new smoke check

Edit `.github/workflows/smoke.yml`'s `Probe <app>` steps. The pattern is:

```yaml
- name: Probe <name>
  run: |
    set -e
    curl -fsSL --max-time 30 "$URL/api/health" > /tmp/result.json
    OK=$(jq -r '.ok' /tmp/result.json)
    if [ "$OK" != "true" ]; then
      cat /tmp/result.json
      exit 1
    fi
```

### Wiring smoke into PR previews

By default Vercel sends `deployment_status` for both Production and
Preview environments. The current workflow filters to Production. To
also smoke Preview deploys, drop the `environment == 'Production'`
condition in `smoke.yml`'s `if:`.

### Auto-rollback on smoke fail

Not implemented yet. The cleanest pattern is a separate workflow that
listens for the failing smoke and calls Vercel's rollback API with a
short-lived token. Tracked in `docs/parking-lot.md`.

## What the pipeline does NOT cover

- E2E tests (Playwright planned per spec §10; not built yet)
- Vercel deploy is its own thing (Vercel's git integration, not our CI)
- Schema migrations (manually applied via SQL editor; not automated)
- Secrets rotation (manual)

These land in later iterations as the operation matures.
