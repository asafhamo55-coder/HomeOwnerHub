#!/usr/bin/env bash
#
# scripts/devops.sh — local devops pipeline.
#
# Runs the same checks CI runs, plus a remote smoke test of the live
# Vercel deploys. Use before pushing, or to validate a deployed change
# end-to-end without waiting for GitHub Actions.
#
# Usage:
#   ./scripts/devops.sh              # full pipeline: verify, push, smoke
#   ./scripts/devops.sh verify       # just typecheck + build, no push
#   ./scripts/devops.sh push         # verify + push only
#   ./scripts/devops.sh smoke        # smoke remote endpoints only
#   ./scripts/devops.sh status       # last commit + remote deploy status
#
# Exit codes:
#   0 — everything green
#   1 — verify failed
#   2 — push failed
#   3 — smoke failed
#   4 — bad arguments
#
# Env overrides:
#   HOA_URL, EVICTION_URL, PM_URL — override smoke test targets
#   SKIP_BUILD=1 — skip the build step in verify (typecheck only)
#   NO_COLOR=1 — disable ANSI colors

set -euo pipefail

# ────────────────────────────────────────────────────────────────────
# Config

# www, not the apex. `homeownerledger.com` (no www) still resolves to an old
# Network Solutions host (74.91.138.139) serving a *.hostingplatform.com
# certificate that expired 2026-07-03 — only the www CNAME points at Vercel.
# The previous default here, home-owner-hub-hoa.vercel.app, no longer
# resolves at all, and the project-scoped *.vercel.app URL sits behind
# Vercel SSO protection (302 to vercel.com/sso-api), so neither can be
# probed anonymously.
HOA_URL="${HOA_URL:-https://www.homeownerledger.com}"
EVICTION_URL="${EVICTION_URL:-https://homeowner-hub-eviction.vercel.app}"
PM_URL="${PM_URL:-https://home-owner-hub-pm.vercel.app}"

# Colors
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET='\033[0m'
  C_BOLD='\033[1m'
  C_GREEN='\033[32m'
  C_RED='\033[31m'
  C_YELLOW='\033[33m'
  C_BLUE='\033[34m'
  C_DIM='\033[2m'
else
  C_RESET=''; C_BOLD=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_BLUE=''; C_DIM=''
fi

log() { printf '%b[devops]%b %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()  { printf '%b[devops]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_GREEN" "$*" "$C_RESET"; }
warn(){ printf '%b[devops]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_YELLOW" "$*" "$C_RESET"; }
err() { printf '%b[devops]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_RED" "$*" "$C_RESET"; }

# ────────────────────────────────────────────────────────────────────
# Steps

run_verify() {
  log "Step 1/3 — verify (typecheck + build)"

  if ! command -v pnpm >/dev/null 2>&1; then
    err "pnpm not found. Install: npm install -g pnpm@10.33.0"
    return 1
  fi

  log "  pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile >/dev/null

  log "  pnpm turbo run typecheck"
  if ! pnpm turbo run typecheck; then
    err "typecheck failed"
    return 1
  fi

  if [ "${SKIP_BUILD:-}" = "1" ]; then
    warn "  skipping build (SKIP_BUILD=1)"
  else
    log "  pnpm turbo run build"
    if ! pnpm turbo run build; then
      err "build failed"
      return 1
    fi
  fi

  ok "verify ok"
}

run_push() {
  log "Step 2/3 — push"

  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  log "  current branch: $branch"

  if [ -n "$(git status --porcelain)" ]; then
    warn "  working tree has uncommitted changes — commit them before push"
    git status --short
    return 2
  fi

  log "  git push origin $branch"
  if ! git push origin "$branch"; then
    err "push failed"
    return 2
  fi
  ok "push ok"
}

probe_one() {
  local label="$1" url="$2"
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -sSL --max-time 30 -o "$tmp" -w "%{http_code}" "$url/api/health" || echo "000")
  if [ "$code" != "200" ]; then
    err "  $label: HTTP $code"
    cat "$tmp"
    echo
    rm -f "$tmp"
    return 3
  fi
  local app version dbok
  app=$(jq -r '.app' "$tmp")
  version=$(jq -r '.version' "$tmp")
  dbok=$(jq -r '.probes.db.ok' "$tmp")
  ok "  $label · app=$app · version=$version · db=$dbok"
  rm -f "$tmp"
}

run_smoke() {
  log "Step 3/3 — smoke (remote health probes)"

  if ! command -v jq >/dev/null 2>&1; then
    err "jq not found. Install: brew install jq"
    return 3
  fi

  local rc=0
  probe_one "HOA       " "$HOA_URL" || rc=3
  probe_one "Eviction  " "$EVICTION_URL" || rc=3
  probe_one "PM        " "$PM_URL" || rc=3
  if [ $rc -ne 0 ]; then
    err "smoke failed"
    return $rc
  fi
  ok "smoke ok"
}

run_status() {
  log "Repo status"
  local branch sha
  branch=$(git rev-parse --abbrev-ref HEAD)
  sha=$(git rev-parse --short HEAD)
  printf '  branch: %s\n  HEAD:   %s\n  remote:\n' "$branch" "$sha"
  git log --oneline -3 origin/"$branch" 2>/dev/null || echo '    (no upstream)'
  echo
  log "Remote health (live deploys)"
  run_smoke || true
}

# ────────────────────────────────────────────────────────────────────
# Entrypoint

case "${1:-all}" in
  all)
    run_verify
    run_push
    log "Waiting 60s for Vercel deploy to propagate..."
    sleep 60
    run_smoke
    ok "All green."
    ;;
  verify)
    run_verify
    ;;
  push)
    run_verify
    run_push
    ;;
  smoke)
    run_smoke
    ;;
  status)
    run_status
    ;;
  *)
    err "Unknown command: $1"
    cat <<USAGE
Usage:
  $0 [verify|push|smoke|status|all]

Commands:
  all      Run verify, push, wait, then smoke (default)
  verify   Just typecheck + build
  push     Verify + git push
  smoke    Hit /api/health on the 3 production apps
  status   Show repo state + run smoke

Env overrides:
  HOA_URL, EVICTION_URL, PM_URL — change smoke targets
  SKIP_BUILD=1                  — skip build in verify
USAGE
    exit 4
    ;;
esac
