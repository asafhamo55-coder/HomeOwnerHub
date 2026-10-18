#!/usr/bin/env bash
# scripts/ci/stage-guide-shots.sh — used by .github/workflows/ui-shots.yml
# (job guide-pr). Copies ONLY the named (stale / missing) guide shots from a
# full `pnpm ui:shots --guide` run into the committed shots dir and merges
# just their manifest entries, so a refresh PR touches the screens that
# actually changed — not every webp the Linux runner re-encodes slightly
# differently from the last capture.
#
# Usage: scripts/ci/stage-guide-shots.sh <regenerated-shots-dir> <shot-name>...
#
# Env assumptions: run from the repo root of a checkout of the same commit
# the shots were taken at; needs bash, jq (preinstalled on ubuntu-latest).
# Writes only under apps/hoa/public/guide/shots/. Prints shot names and
# counts — never page content.
set -euo pipefail

SRC=${1:?usage: stage-guide-shots.sh <regenerated-shots-dir> <shot-name>...}
shift
DEST=apps/hoa/public/guide/shots
[ -d "$DEST" ] || { echo "stage-guide-shots: run from the repo root ($DEST not found)" >&2; exit 2; }
[ -f "$SRC/manifest.json" ] || { echo "stage-guide-shots: $SRC/manifest.json not found" >&2; exit 2; }
[ -f "$DEST/manifest.json" ] || echo '{}' > "$DEST/manifest.json"

staged=()
for name in "$@"; do
  [[ "$name" =~ ^guide-[A-Za-z0-9-]+$ ]] || { echo "stage-guide-shots: skipping odd name" >&2; continue; }
  if ! jq -e --arg n "$name" 'has($n)' "$SRC/manifest.json" >/dev/null; then
    echo "not captured: $name (left as committed)"
    continue
  fi
  shopt -s nullglob
  files=("$SRC/$name"--*.webp)
  shopt -u nullglob
  if [ ${#files[@]} -eq 0 ]; then
    echo "no webp for: $name (left as committed)"
    continue
  fi
  cp "${files[@]}" "$DEST/"
  staged+=("$name")
done

if [ ${#staged[@]} -eq 0 ]; then
  echo "stage-guide-shots: nothing to stage"
  exit 0
fi

names_json=$(printf '%s\n' "${staged[@]}" | jq -R . | jq -s .)
# Committed manifest, with the staged names' entries taken from the new run.
# Top-level keys sorted like ui-shots' writer; each entry's own field order
# is kept (jq -S would re-sort those too and churn every entry).
jq --indent 2 --argjson names "$names_json" \
  '(.[0] + (.[1] | with_entries(select(.key as $k | $names | index($k))))) | to_entries | sort_by(.key) | from_entries' \
  -s "$DEST/manifest.json" "$SRC/manifest.json" > "$DEST/manifest.json.tmp"
mv "$DEST/manifest.json.tmp" "$DEST/manifest.json"
echo "stage-guide-shots: staged ${#staged[@]} shot(s): ${staged[*]}"
