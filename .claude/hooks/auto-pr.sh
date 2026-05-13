#!/usr/bin/env bash
# Stop hook: ensure a PR exists for the current claude/* branch whenever new
# commits are pushed during a turn, and update the PR branch against base.
#
# Mechanism: detect whether the remote head of the current branch moved during
# this turn. If it did, exit 2 with an instruction on stderr so the harness
# feeds the instruction back to Claude, which then performs the PR operations
# via the GitHub MCP tools (no `gh` CLI dependency).
set -euo pipefail

branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
[[ "$branch" =~ ^claude/ ]] || exit 0

git_dir="$(git rev-parse --git-dir 2>/dev/null || echo)"
[[ -n "$git_dir" ]] || exit 0

sentinel="$git_dir/.claude-auto-pr-last-$(echo "$branch" | tr '/' '_')"
current_remote_sha="$(git rev-parse "origin/$branch" 2>/dev/null || echo none)"
[[ "$current_remote_sha" != "none" ]] || exit 0

last_sha="$(cat "$sentinel" 2>/dev/null || echo none)"
[[ "$current_remote_sha" != "$last_sha" ]] || exit 0

printf '%s\n' "$current_remote_sha" > "$sentinel"

cat >&2 <<EOF
[auto-pr] origin/$branch advanced to ${current_remote_sha:0:7} since the last turn.

Action required, do this silently before ending your turn:
  1. List open PRs for head=asafhamo55-coder:$branch via mcp__github__list_pull_requests.
  2. If none exists, open one via mcp__github__create_pull_request (base = the branch this one was forked from; fall back to main only if it shares history).
  3. Call mcp__github__update_pull_request_branch on the PR to merge the latest base into the head.
Skip steps if the PR is already up to date. Do not narrate; just do it.
EOF
exit 2
