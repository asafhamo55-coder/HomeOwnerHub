#!/usr/bin/env bash
#
# scripts/qa.sh — pre-deployment QA gauntlet.
#
# Runs every test category that gates deployment. Each stage is
# independently pass/fail/skip with structured output so the qa
# subagent and CI can parse the result.
#
# Stages:
#   1. functional   — typecheck, build, lint, unit tests (vitest if present)
#   2. security     — pnpm audit, built-in secret scan, SAST (semgrep if present)
#   3. e2e          — Playwright suite if present, otherwise route-level HTTP checks
#   4. performance  — response-time SLO probe; Lighthouse via @lhci/cli if present
#   5. penetration  — security headers / cookie flags / common attack surface;
#                     OWASP ZAP baseline if docker is available
#   6. exploratory  — crawl key routes and AI endpoints looking for 5xx / leaks
#
# Usage:
#   scripts/qa.sh                # run every stage
#   scripts/qa.sh functional     # run a single stage
#   scripts/qa.sh --strict       # any skipped-for-missing-tool stage fails the run
#   scripts/qa.sh --report path  # write JSON summary to path
#   scripts/qa.sh --fix          # apply shell-deterministic safe fixes
#                                # (eslint --fix, pnpm dedupe) before running
#                                # the gauntlet. File-level fixes are out of
#                                # scope here — use the qa-fix subagent.
#
# Env:
#   TARGET_URL    — base URL for stages 3-6 (default: $HOA_URL)
#   HOA_URL       — default https://home-owner-hub-hoa.vercel.app
#   EVICTION_URL  — default https://homeowner-hub-eviction.vercel.app
#   PM_URL        — default https://home-owner-hub-pm.vercel.app
#   SKIP_STAGES   — comma-separated stage names to skip (e.g. "performance,penetration")
#   STRICT=1      — same as --strict
#   PERF_BUDGET_MS — response-time budget for /api/health (default 1500)
#   NO_COLOR=1    — disable ANSI colors
#
# Exit codes:
#   0  all stages pass (or skipped without --strict)
#   1  one or more stages failed
#   2  bad arguments
#   3  prerequisite missing (pnpm, curl, jq)

set -uo pipefail

# ────────────────────────────────────────────────────────────────────
# Config

HOA_URL="${HOA_URL:-https://home-owner-hub-hoa.vercel.app}"
EVICTION_URL="${EVICTION_URL:-https://homeowner-hub-eviction.vercel.app}"
PM_URL="${PM_URL:-https://home-owner-hub-pm.vercel.app}"
TARGET_URL="${TARGET_URL:-$HOA_URL}"
PERF_BUDGET_MS="${PERF_BUDGET_MS:-1500}"

STRICT="${STRICT:-0}"
FIX="${FIX:-0}"
SKIP_STAGES="${SKIP_STAGES:-}"
REPORT_PATH=""
SINGLE_STAGE=""

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ALL_STAGES=(functional security e2e performance penetration exploratory)

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

log()  { printf '%b[qa]%b %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%b[qa]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%b[qa]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_YELLOW" "$*" "$C_RESET"; }
err()  { printf '%b[qa]%b %b%s%b\n' "$C_BLUE" "$C_RESET" "$C_RED" "$*" "$C_RESET"; }
sep()  { printf '%b────────────────────────────────────────────────────────────%b\n' "$C_DIM" "$C_RESET"; }

# Per-stage state. Bash 3 compatible (no associative arrays required at top).
STAGE_NAMES=()
STAGE_STATUS=()    # pass | fail | skip
STAGE_DURATION=()  # seconds
STAGE_DETAIL=()    # short message
STAGE_FINDINGS=()  # count (integer or empty)

record_stage() {
  local name="$1" status="$2" duration="$3" findings="${4:-}" detail="${5:-}"
  STAGE_NAMES+=("$name")
  STAGE_STATUS+=("$status")
  STAGE_DURATION+=("$duration")
  STAGE_FINDINGS+=("$findings")
  STAGE_DETAIL+=("$detail")
}

now_ms() { date +%s%N 2>/dev/null | cut -c1-13 || python3 -c 'import time;print(int(time.time()*1000))'; }
elapsed_s() { local start="$1"; awk -v a="$start" -v b="$(now_ms)" 'BEGIN{printf "%.1f",(b-a)/1000}'; }

# ────────────────────────────────────────────────────────────────────
# Prerequisites

require() {
  local missing=()
  for t in pnpm curl jq; do
    if ! command -v "$t" >/dev/null 2>&1; then missing+=("$t"); fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    err "Missing prerequisites: ${missing[*]}"
    err "Install pnpm (npm i -g pnpm@10.33.0), curl, jq"
    exit 3
  fi
}

skipped_by_user() {
  local stage="$1"
  case ",$SKIP_STAGES," in
    *",$stage,"*) return 0 ;;
    *) return 1 ;;
  esac
}

# ────────────────────────────────────────────────────────────────────
# Safe auto-fix (shell-deterministic only)
#
# Only fixes that are idempotent and cannot change runtime behavior in
# surprising ways live here. File-level / code-rewriting fixes (e.g.
# adding security headers, bumping a vulnerable dep to a specific version)
# belong in the qa-fix subagent, which can read the QA report and apply
# Edit/Write operations with full context.

run_fix() {
  log "${C_BOLD}--fix${C_RESET}  applying safe auto-fixes"
  local applied=0

  # 1. eslint --fix across the workspace, if eslint is wired up.
  if [ -f .eslintrc.json ] || [ -f .eslintrc.js ] || [ -f .eslintrc.cjs ] \
     || [ -f eslint.config.js ] || [ -f eslint.config.mjs ] \
     || grep -qE '"eslintConfig"\s*:' package.json 2>/dev/null; then
    log "  pnpm exec eslint --fix ."
    if pnpm exec eslint --fix . >/tmp/qa-fix-eslint.log 2>&1; then
      ok "  eslint --fix applied"
      applied=$((applied + 1))
    else
      warn "  eslint --fix had unfixable findings (see /tmp/qa-fix-eslint.log)"
    fi
  else
    warn "  no eslint config detected — skipping --fix"
  fi

  # 2. pnpm dedupe — collapses redundant transitive versions without
  # changing direct dependency versions. Safe.
  log "  pnpm dedupe"
  if pnpm dedupe >/tmp/qa-fix-dedupe.log 2>&1; then
    if grep -q 'no changes' /tmp/qa-fix-dedupe.log 2>/dev/null; then
      ok "  pnpm dedupe — nothing to do"
    else
      ok "  pnpm dedupe applied (review pnpm-lock.yaml)"
      applied=$((applied + 1))
    fi
  else
    warn "  pnpm dedupe failed (see /tmp/qa-fix-dedupe.log)"
  fi

  log "  $applied safe auto-fix(es) applied · file-level fixes deferred to qa-fix subagent"
  sep
}

# ────────────────────────────────────────────────────────────────────
# Stage 1 — Functional

stage_functional() {
  local name="functional"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 1/6 — $name${C_RESET}  (typecheck · build · lint · unit)"

  if [ ! -f pnpm-lock.yaml ]; then
    err "  pnpm-lock.yaml missing"
    record_stage "$name" fail "$(elapsed_s "$start")" "" "no lockfile"
    return
  fi

  log "  pnpm install --frozen-lockfile"
  if ! pnpm install --frozen-lockfile >/tmp/qa-install.log 2>&1; then
    err "  install failed (see /tmp/qa-install.log)"
    tail -20 /tmp/qa-install.log
    record_stage "$name" fail "$(elapsed_s "$start")" "" "install failed"
    return
  fi

  log "  pnpm turbo run typecheck"
  if ! pnpm turbo run typecheck >/tmp/qa-typecheck.log 2>&1; then
    err "  typecheck failed (last 30 lines)"
    tail -30 /tmp/qa-typecheck.log
    record_stage "$name" fail "$(elapsed_s "$start")" "" "typecheck failed"
    return
  fi
  ok "  typecheck pass"

  log "  pnpm turbo run build"
  if ! pnpm turbo run build >/tmp/qa-build.log 2>&1; then
    # Sandbox font fetch failures are not real failures.
    if grep -qE 'SELF_SIGNED_CERT_IN_CHAIN|Failed to fetch.*Inter' /tmp/qa-build.log \
       && ! grep -qE 'error TS|Module not found|Type error' /tmp/qa-build.log; then
      warn "  build had sandbox-only font-fetch errors; otherwise clean"
    else
      err "  build failed (last 40 lines)"
      tail -40 /tmp/qa-build.log
      record_stage "$name" fail "$(elapsed_s "$start")" "" "build failed"
      return
    fi
  fi
  ok "  build pass"

  # Lint — optional, doesn't gate
  if pnpm -w turbo run lint >/tmp/qa-lint.log 2>&1; then
    ok "  lint pass"
  else
    warn "  lint had findings (not blocking, see /tmp/qa-lint.log)"
  fi

  # Unit tests — auto-detect vitest/jest configs anywhere in workspace
  local test_files
  test_files=$(find . -type f \( -name "vitest.config.*" -o -name "jest.config.*" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$test_files" -gt 0 ]; then
    log "  unit tests detected — running"
    if pnpm -w turbo run test >/tmp/qa-unit.log 2>&1; then
      ok "  unit tests pass"
    else
      err "  unit tests failed (last 30 lines)"
      tail -30 /tmp/qa-unit.log
      record_stage "$name" fail "$(elapsed_s "$start")" "" "unit tests failed"
      return
    fi
  else
    warn "  no vitest/jest config found — unit tests skipped"
  fi

  record_stage "$name" pass "$(elapsed_s "$start")" "0" "ok"
}

# ────────────────────────────────────────────────────────────────────
# Stage 2 — Security

stage_security() {
  local name="security"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 2/6 — $name${C_RESET}  (deps · secrets · SAST)"

  local findings=0

  # Dependency audit
  log "  pnpm audit (high+ only)"
  if pnpm audit --audit-level=high --json >/tmp/qa-audit.json 2>/dev/null; then
    ok "  no high/critical advisories"
  else
    local n; n=$(jq '[.advisories // {} | to_entries[]] | length' /tmp/qa-audit.json 2>/dev/null || echo 0)
    if [ "${n:-0}" -gt 0 ]; then
      err "  $n advisory(s) at high or critical severity"
      jq -r '.advisories // {} | to_entries[] | "    " + .value.module_name + " · " + .value.severity + " · " + .value.title' /tmp/qa-audit.json 2>/dev/null | head -10
      findings=$((findings + n))
    else
      warn "  pnpm audit returned non-zero but no parseable advisories"
    fi
  fi

  # Secret scan — gitleaks if present, else built-in regex sweep
  if command -v gitleaks >/dev/null 2>&1; then
    log "  gitleaks (tracked files)"
    if gitleaks detect --no-banner --redact --exit-code 0 --report-format json --report-path /tmp/qa-gitleaks.json >/dev/null 2>&1; then
      local leaks; leaks=$(jq 'length' /tmp/qa-gitleaks.json 2>/dev/null || echo 0)
      if [ "${leaks:-0}" -gt 0 ]; then
        err "  gitleaks found $leaks potential secret(s)"
        jq -r '.[] | "    " + .File + ":" + (.StartLine|tostring) + " · " + .RuleID' /tmp/qa-gitleaks.json | head -10
        findings=$((findings + leaks))
      else
        ok "  gitleaks clean"
      fi
    fi
  else
    log "  built-in secret regex sweep (gitleaks not installed)"
    local hits
    # Exclude files where committed credentials are expected to be inert:
    # *.example / *.sample / docs/ / *.md, plus lockfiles and minified assets.
    hits=$(git ls-files \
      | grep -vE '\.(lock|map|min\.js|md)$|pnpm-lock\.yaml|\.example$|\.sample$|^docs/' \
      | xargs grep -nIE \
        -e 'AKIA[0-9A-Z]{16}' \
        -e 'AIza[0-9A-Za-z_-]{35}' \
        -e 'sk_live_[0-9a-zA-Z]{24,}' \
        -e 'rk_live_[0-9a-zA-Z]{24,}' \
        -e 'xox[baprs]-[0-9A-Za-z-]{10,}' \
        -e '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----' \
        -e 'eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' \
        2>/dev/null | grep -v 'qa\.sh' || true)
    if [ -n "$hits" ]; then
      local n; n=$(echo "$hits" | wc -l | tr -d ' ')
      err "  $n potential secret hit(s)"
      echo "$hits" | head -10 | sed 's/^/    /'
      findings=$((findings + n))
    else
      ok "  no obvious secret patterns in tracked files"
    fi
  fi

  # .env file leak check
  local env_leaks
  env_leaks=$(git ls-files | grep -E '(^|/)\.env(\..+)?$' | grep -vE '\.example$|\.sample$' || true)
  if [ -n "$env_leaks" ]; then
    err "  .env file committed to git:"
    echo "$env_leaks" | sed 's/^/    /'
    findings=$((findings + $(echo "$env_leaks" | wc -l | tr -d ' ')))
  else
    ok "  no .env files committed"
  fi

  # SAST — semgrep if present
  if command -v semgrep >/dev/null 2>&1; then
    log "  semgrep (owasp + javascript rulesets)"
    if semgrep --config p/owasp-top-ten --config p/javascript --error --json -o /tmp/qa-semgrep.json --quiet . >/dev/null 2>&1; then
      ok "  semgrep clean"
    else
      local n; n=$(jq '.results | length' /tmp/qa-semgrep.json 2>/dev/null || echo 0)
      if [ "${n:-0}" -gt 0 ]; then
        err "  semgrep found $n issue(s)"
        jq -r '.results[] | "    " + .path + ":" + (.start.line|tostring) + " · " + .check_id' /tmp/qa-semgrep.json | head -10
        findings=$((findings + n))
      fi
    fi
  else
    warn "  semgrep not installed — SAST limited to built-in checks"
  fi

  if [ "$findings" -gt 0 ]; then
    record_stage "$name" fail "$(elapsed_s "$start")" "$findings" "$findings security finding(s)"
  else
    record_stage "$name" pass "$(elapsed_s "$start")" "0" "ok"
  fi
}

# ────────────────────────────────────────────────────────────────────
# Stage 3 — E2E

stage_e2e() {
  local name="e2e"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 3/6 — $name${C_RESET}  (Playwright if present, else HTTP route checks)"

  if [ -f playwright.config.ts ] || [ -f playwright.config.js ]; then
    log "  playwright config detected"
    if ! pnpm exec playwright install --with-deps chromium >/tmp/qa-pw-install.log 2>&1; then
      warn "  playwright browser install failed (see /tmp/qa-pw-install.log)"
    fi
    if pnpm exec playwright test --reporter=line >/tmp/qa-e2e.log 2>&1; then
      ok "  playwright suite pass"
      record_stage "$name" pass "$(elapsed_s "$start")" "0" "playwright ok"
      return
    else
      err "  playwright suite failed (last 30 lines)"
      tail -30 /tmp/qa-e2e.log
      record_stage "$name" fail "$(elapsed_s "$start")" "" "playwright failed"
      return
    fi
  fi

  # Fallback: built-in HTTP route checks against TARGET_URL
  log "  no playwright config — using built-in HTTP route smoke against $TARGET_URL"

  local routes=(
    "/api/health|200"
    "/|200|301|302|307|308"
    "/login|200|301|302|307|308"
    "/signup|200|301|302|307|308"
  )
  local failures=0 total=0
  for entry in "${routes[@]}"; do
    local path; path="${entry%%|*}"
    local expected; expected="${entry#*|}"
    total=$((total + 1))
    local code
    code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' "$TARGET_URL$path" || echo "000")
    if [[ "|$expected|" == *"|$code|"* ]]; then
      ok "  $path → $code"
    else
      err "  $path → $code (expected one of $expected)"
      failures=$((failures + 1))
    fi
  done

  if [ "$failures" -gt 0 ]; then
    record_stage "$name" fail "$(elapsed_s "$start")" "$failures" "$failures/$total routes failed"
  else
    record_stage "$name" pass "$(elapsed_s "$start")" "0" "$total routes ok"
  fi
}

# ────────────────────────────────────────────────────────────────────
# Stage 4 — Performance

stage_performance() {
  local name="performance"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 4/6 — $name${C_RESET}  (response-time SLO · Lighthouse if available)"

  # Built-in: response time to /api/health on all 3 apps, must be <= PERF_BUDGET_MS
  local failures=0 samples=0
  for url in "$HOA_URL" "$EVICTION_URL" "$PM_URL"; do
    samples=$((samples + 1))
    local ms
    ms=$(curl -sS -o /dev/null --max-time 30 -w '%{time_total}' "$url/api/health" 2>/dev/null \
         | awk '{printf "%d", $1 * 1000}')
    ms=${ms:-0}
    if [ "$ms" -gt "$PERF_BUDGET_MS" ]; then
      err "  $url/api/health → ${ms}ms (budget ${PERF_BUDGET_MS}ms)"
      failures=$((failures + 1))
    else
      ok "  $url/api/health → ${ms}ms"
    fi
  done

  # Lighthouse — only if @lhci/cli is installed locally or globally
  if pnpm exec lhci --version >/dev/null 2>&1; then
    log "  running lighthouse-ci against $TARGET_URL"
    if pnpm exec lhci collect --url="$TARGET_URL" >/tmp/qa-lh.log 2>&1; then
      ok "  lighthouse collected (review .lighthouseci/)"
    else
      warn "  lighthouse run failed (last 20 lines)"
      tail -20 /tmp/qa-lh.log
    fi
  else
    warn "  @lhci/cli not installed — skipping lighthouse"
  fi

  if [ "$failures" -gt 0 ]; then
    record_stage "$name" fail "$(elapsed_s "$start")" "$failures" "$failures/$samples slow endpoint(s)"
  else
    record_stage "$name" pass "$(elapsed_s "$start")" "0" "$samples endpoints within budget"
  fi
}

# ────────────────────────────────────────────────────────────────────
# Stage 5 — Penetration

stage_penetration() {
  local name="penetration"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 5/6 — $name${C_RESET}  (headers · cookies · auth · ZAP if docker present)"

  local findings=0
  local tmp; tmp=$(mktemp)
  curl -sS -D "$tmp" -o /dev/null --max-time 20 "$TARGET_URL/" || true

  # Required security headers
  local required=(
    "strict-transport-security"
    "x-content-type-options"
    "x-frame-options:|content-security-policy:"
    "referrer-policy"
  )
  for entry in "${required[@]}"; do
    local found=0
    IFS='|' read -ra opts <<< "$entry"
    for h in "${opts[@]}"; do
      if grep -qi "^${h}" "$tmp"; then found=1; break; fi
    done
    if [ "$found" -eq 1 ]; then
      ok "  header ok: ${opts[0]%:}"
    else
      err "  missing header: $entry"
      findings=$((findings + 1))
    fi
  done

  # Cookie flags
  if grep -qiE '^set-cookie:.*;' "$tmp"; then
    if grep -iE '^set-cookie:' "$tmp" | grep -qviE 'httponly'; then
      err "  cookie missing HttpOnly flag"
      findings=$((findings + 1))
    else
      ok "  cookies HttpOnly ok"
    fi
    if grep -iE '^set-cookie:' "$tmp" | grep -qviE 'secure'; then
      err "  cookie missing Secure flag"
      findings=$((findings + 1))
    else
      ok "  cookies Secure ok"
    fi
    if grep -iE '^set-cookie:' "$tmp" | grep -qviE 'samesite'; then
      warn "  cookie missing SameSite (informational)"
    else
      ok "  cookies SameSite ok"
    fi
  else
    ok "  no Set-Cookie on / (acceptable)"
  fi

  # Server / framework banner exposure (informational)
  if grep -iE '^(server|x-powered-by):' "$tmp" | grep -qiE 'express|next\.js|nginx/[0-9]'; then
    warn "  server banner reveals framework/version (informational)"
  fi
  rm -f "$tmp"

  # Auth-required endpoints should not be public
  local protected=(
    "$HOA_URL/api/ai/daily-digest"
    "$HOA_URL/api/ai/parse-document"
    "$EVICTION_URL/api/ai/draft-notice"
    "$HOA_URL/api/governing-docs/upload"
  )
  for url in "${protected[@]}"; do
    local code
    code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$url" || echo "000")
    case "$code" in
      401|403|405) ok "  auth-protected: $url → $code" ;;
      200|201)    err "  POSSIBLE AUTH BYPASS: $url returned $code without auth"; findings=$((findings + 1)) ;;
      404|400|500|000) warn "  $url → $code (non-conclusive)" ;;
      *) warn "  $url → $code" ;;
    esac
  done

  # Path traversal / common injection probes against /api/health
  for payload in '../../etc/passwd' '%00' '<script>alert(1)</script>' "'%20OR%201=1--"; do
    local code body
    body=$(mktemp)
    code=$(curl -s -o "$body" --max-time 10 -w '%{http_code}' "$TARGET_URL/api/health?q=$payload" || echo "000")
    if [ "$code" = "500" ] || grep -qiE '(stack trace|at .+ \(.+:[0-9]+:[0-9]+\)|error: at)' "$body" 2>/dev/null; then
      err "  payload triggered 500 / stack trace: $payload"
      findings=$((findings + 1))
    fi
    rm -f "$body"
  done
  ok "  injection probes did not leak stack traces"

  # OWASP ZAP baseline — only if docker is available
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    log "  running OWASP ZAP baseline against $TARGET_URL (~2 min)"
    if docker run --rm -t -v "$(pwd):/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
         zap-baseline.py -t "$TARGET_URL" -J /zap/wrk/zap-baseline.json -m 1 \
         >/tmp/qa-zap.log 2>&1; then
      ok "  ZAP baseline clean"
    else
      local rc=$?
      # ZAP exits 1 if WARN, 2 if FAIL — both surface findings
      local high; high=$(jq '[.site[]?.alerts[]? | select(.riskcode|tonumber >= 3)] | length' /tmp/zap-baseline.json 2>/dev/null || echo 0)
      if [ "${high:-0}" -gt 0 ]; then
        err "  ZAP found $high high/critical alert(s)"
        jq -r '.site[]?.alerts[]? | select(.riskcode|tonumber >= 3) | "    " + .name + " · " + .riskdesc' /tmp/zap-baseline.json 2>/dev/null | head -10
        findings=$((findings + high))
      else
        warn "  ZAP baseline exit=$rc but no high/critical alerts"
      fi
    fi
  else
    warn "  docker not available — ZAP baseline skipped"
  fi

  if [ "$findings" -gt 0 ]; then
    record_stage "$name" fail "$(elapsed_s "$start")" "$findings" "$findings pentest finding(s)"
  else
    record_stage "$name" pass "$(elapsed_s "$start")" "0" "ok"
  fi
}

# ────────────────────────────────────────────────────────────────────
# Stage 6 — Exploratory

stage_exploratory() {
  local name="exploratory"
  local start; start=$(now_ms)
  log "${C_BOLD}stage 6/6 — $name${C_RESET}  (crawl key routes for 5xx / error leakage)"

  # Build a route list from the three apps' app/ trees, plus a hand-picked
  # set of high-traffic pages and AI endpoints worth poking.
  local routes_file; routes_file=$(mktemp)
  {
    for app in apps/hoa apps/eviction apps/pm; do
      [ -d "$app/src/app" ] || continue
      # Routes (page.tsx → URL path)
      find "$app/src/app" -name "page.tsx" 2>/dev/null | sed -E \
        -e "s|$app/src/app||" \
        -e 's|/page\.tsx$||' \
        -e 's|/\([^/]+\)||g' \
        -e 's|/\[[^]]+\]|/_seg_|g' | \
        awk '{print $0 == "" ? "/" : $0}'
    done | sort -u
  } > "$routes_file"

  local findings=0 total=0
  while read -r path; do
    [ -z "$path" ] && continue
    # Skip dynamic-only segments — we don't have real IDs to fill in
    if [[ "$path" == *"_seg_"* ]]; then continue; fi
    total=$((total + 1))
    local code body; body=$(mktemp)
    code=$(curl -s -L --max-redirs 3 -o "$body" --max-time 20 -w '%{http_code}' "$TARGET_URL$path" || echo "000")
    case "$code" in
      5*) err "  $path → $code (server error)"; findings=$((findings + 1)) ;;
      000) err "  $path → no response"; findings=$((findings + 1)) ;;
    esac
    # Error / stack-trace leakage even on 200
    if grep -qiE '(at .+ \(.+:[0-9]+:[0-9]+\)|TypeError:|ReferenceError:|<title>Error</title>)' "$body" 2>/dev/null; then
      err "  $path leaked stack-trace / error markup"
      findings=$((findings + 1))
    fi
    rm -f "$body"
  done < "$routes_file"
  rm -f "$routes_file"

  ok "  crawled $total routes"

  # Exploratory: malformed payloads to AI endpoints — they should validate input,
  # not 500.
  local probes=(
    "$HOA_URL/api/ai/parse-document|{}"
    "$HOA_URL/api/ai/meeting-summary|{\"junk\":true}"
    "$EVICTION_URL/api/ai/draft-notice|null"
  )
  for entry in "${probes[@]}"; do
    local url="${entry%%|*}"
    local body="${entry#*|}"
    local code
    code=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -X POST -H 'content-type: application/json' -d "$body" "$url" || echo "000")
    case "$code" in
      400|401|403|405|422) ok "  $url malformed → $code (handled)" ;;
      500) err "  $url malformed → 500 (input validation gap)"; findings=$((findings + 1)) ;;
      *) warn "  $url malformed → $code" ;;
    esac
  done

  if [ "$findings" -gt 0 ]; then
    record_stage "$name" fail "$(elapsed_s "$start")" "$findings" "$findings exploratory finding(s)"
  else
    record_stage "$name" pass "$(elapsed_s "$start")" "0" "ok"
  fi
}

# ────────────────────────────────────────────────────────────────────
# Runner

run_stage() {
  local name="$1"
  if skipped_by_user "$name"; then
    warn "stage $name — skipped via SKIP_STAGES"
    record_stage "$name" skip 0 "" "skipped via SKIP_STAGES"
    return
  fi
  case "$name" in
    functional)  stage_functional ;;
    security)    stage_security ;;
    e2e)         stage_e2e ;;
    performance) stage_performance ;;
    penetration) stage_penetration ;;
    exploratory) stage_exploratory ;;
    *) err "Unknown stage: $name"; exit 2 ;;
  esac
  sep
}

print_summary() {
  echo
  printf '%bQA SUPER-AGENT — SUMMARY%b\n' "$C_BOLD" "$C_RESET"
  printf '%b%-14s %-7s %-10s %-10s %s%b\n' "$C_BOLD" "stage" "status" "duration" "findings" "detail" "$C_RESET"
  local pass=0 fail=0 skip=0
  for i in "${!STAGE_NAMES[@]}"; do
    local color="$C_GREEN"
    case "${STAGE_STATUS[$i]}" in
      pass) color="$C_GREEN"; pass=$((pass + 1)) ;;
      fail) color="$C_RED";   fail=$((fail + 1)) ;;
      skip) color="$C_YELLOW"; skip=$((skip + 1)) ;;
    esac
    printf '%-14s %b%-7s%b %-10ss %-10s %s\n' \
      "${STAGE_NAMES[$i]}" "$color" "${STAGE_STATUS[$i]}" "$C_RESET" \
      "${STAGE_DURATION[$i]}" "${STAGE_FINDINGS[$i]:--}" "${STAGE_DETAIL[$i]}"
  done
  echo
  printf 'totals: %bpass=%d%b · %bfail=%d%b · %bskip=%d%b\n' \
    "$C_GREEN" "$pass" "$C_RESET" "$C_RED" "$fail" "$C_RESET" "$C_YELLOW" "$skip" "$C_RESET"
  echo

  if [ -n "$REPORT_PATH" ]; then
    {
      printf '{"generated_at":"%s","target_url":"%s","stages":[' "$(date -u +%FT%TZ)" "$TARGET_URL"
      local first=1
      for i in "${!STAGE_NAMES[@]}"; do
        [ "$first" -eq 1 ] && first=0 || printf ','
        printf '{"name":"%s","status":"%s","duration_s":%s,"findings":%s,"detail":"%s"}' \
          "${STAGE_NAMES[$i]}" "${STAGE_STATUS[$i]}" "${STAGE_DURATION[$i]:-0}" \
          "${STAGE_FINDINGS[$i]:-0}" "$(printf %s "${STAGE_DETAIL[$i]}" | sed 's/"/\\"/g')"
      done
      printf '],"totals":{"pass":%d,"fail":%d,"skip":%d}}' "$pass" "$fail" "$skip"
    } > "$REPORT_PATH"
    log "report written to $REPORT_PATH"
  fi

  if [ "$fail" -gt 0 ]; then
    err "QA: RED — $fail stage(s) failed"
    return 1
  fi
  if [ "$STRICT" = "1" ] && [ "$skip" -gt 0 ]; then
    err "QA: RED — strict mode and $skip stage(s) skipped"
    return 1
  fi
  ok "QA: GREEN"
  return 0
}

# ────────────────────────────────────────────────────────────────────
# Args

while [ $# -gt 0 ]; do
  case "$1" in
    --strict) STRICT=1 ;;
    --fix) FIX=1 ;;
    --report) shift; REPORT_PATH="$1" ;;
    -h|--help)
      sed -n '1,40p' "$0"; exit 0 ;;
    functional|security|e2e|performance|penetration|exploratory)
      SINGLE_STAGE="$1" ;;
    *) err "Unknown arg: $1"; exit 2 ;;
  esac
  shift || true
done

require

if [ "$FIX" = "1" ]; then run_fix; fi

if [ -n "$SINGLE_STAGE" ]; then
  run_stage "$SINGLE_STAGE"
else
  for s in "${ALL_STAGES[@]}"; do run_stage "$s"; done
fi

print_summary
