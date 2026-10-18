#!/usr/bin/env bash
# scripts/ci/fetch-ui-shots.sh — download the screenshots CI took for a
# commit, so they can be reviewed (or used in release notes) without running
# Supabase or a browser locally. The shots come from
# .github/workflows/ui-shots.yml, which uploads per run:
#   ui-shots-<sha>     .ui-shots/*.png (375/1440, light/dark) + logs
#   guide-shots-<sha>  apps/hoa/public/guide/shots/*.webp + manifest.json
#                      (the full regenerated set, not only what changed)
#
# Usage:
#   scripts/ci/fetch-ui-shots.sh [<sha>] [<out-dir>]
#     <sha>      commit (full or short; short needs a local git checkout).
#                Default: the newest successful-or-failed run on
#                $UI_SHOTS_BRANCH (default claude/quality-oracle).
#     <out-dir>  default .ui-shots/ci/<sha12>  (gitignored)
#
# Env assumptions (explicit, nothing else is read):
#   gh            GitHub CLI, authenticated (`gh auth status`) with read
#                 access to the repo's Actions.
#   GH_REPO       optional owner/repo; default: the repo of the current dir.
#   UI_SHOTS_BRANCH  optional branch for the no-sha default.
# Never prints tokens; gh handles auth. Only downloads — starts nothing.
set -euo pipefail

command -v gh >/dev/null || { echo "fetch-ui-shots: gh CLI not found (brew install gh)" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "fetch-ui-shots: gh is not authenticated (gh auth login)" >&2; exit 2; }

WORKFLOW=ui-shots.yml
BRANCH=${UI_SHOTS_BRANCH:-claude/quality-oracle}
SHA=${1:-}
OUT=${2:-}

if [ -n "$SHA" ] && [ ${#SHA} -lt 40 ]; then
  SHA=$(git rev-parse --verify --quiet "${SHA}^{commit}" 2>/dev/null) ||
    { echo "fetch-ui-shots: cannot expand short sha '$1' (no local commit); pass the full 40-char sha" >&2; exit 2; }
fi

if [ -n "$SHA" ]; then filter=(--commit "$SHA"); else filter=(--branch "$BRANCH"); fi

# Completed runs only: an in-progress run has no artifacts yet.
run=$(gh run list --workflow "$WORKFLOW" "${filter[@]}" --status completed --limit 1 \
  --json databaseId,headSha,conclusion --jq '.[0] // empty | "\(.databaseId) \(.headSha) \(.conclusion)"')
if [ -z "$run" ]; then
  echo "fetch-ui-shots: no completed $WORKFLOW run for ${SHA:-branch $BRANCH}" >&2
  pending=$(gh run list --workflow "$WORKFLOW" "${filter[@]}" --limit 1 --json status --jq '.[0].status // empty' || true)
  [ -n "$pending" ] && echo "  latest run status: $pending — try again when it completes" >&2
  exit 1
fi
read -r RUN_ID RUN_SHA CONCLUSION <<<"$run"
OUT=${OUT:-.ui-shots/ci/${RUN_SHA:0:12}}
mkdir -p "$OUT"

echo "run $RUN_ID (sha ${RUN_SHA:0:12}, $CONCLUSION) → $OUT"
# Artifacts are uploaded even when the job fails (overflow), so a failed
# run is still worth fetching. Missing ones (expired after 14 days, or a
# step that never ran) are reported, not fatal.
for name in "ui-shots-$RUN_SHA" "guide-shots-$RUN_SHA"; do
  if gh run download "$RUN_ID" --name "$name" --dir "$OUT/${name%%-"$RUN_SHA"}"; then
    n=$(find "$OUT/${name%%-"$RUN_SHA"}" -type f \( -name '*.png' -o -name '*.webp' \) | wc -l | tr -d ' ')
    echo "  $name: $n image(s)"
  else
    echo "  $name: not available on run $RUN_ID" >&2
  fi
done
[ "$CONCLUSION" = success ] || echo "note: run concluded '$CONCLUSION' — see the ui-overflow log in $OUT/ui-shots/logs/" >&2
