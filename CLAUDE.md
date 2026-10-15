<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- Hand-written. Keep below the rtk-instructions marker so `rtk init` cannot overwrite it. -->

# Known footguns in this repo

Three ways to get a confident, wrong answer. Each has been hit at least once by
someone following the instructions above in good faith.

## 1 & 2. Two typecheck invocations silently check nothing

```bash
pnpm typecheck               # ✅ turbo across all 11 packages
rtk pnpm -r typecheck        # ✅ per-package `tsc --noEmit` — equally trustworthy
rtk pnpm typecheck           # ❌ runs `tsc --help`, always "passes"
pnpm --filter hoa typecheck  # ❌ filter dropped for tsc, checks nothing
```

The discriminator is **not** the `rtk` prefix — rtk passes `-r` through fine.
It is whether the invocation reaches per-package `tsc --noEmit` **and** whether
its failures are ones rtk's output filter can see.

**The actual root cause is rtk's tsc output parser.** It only recognises
diagnostics carrying a `file(line,col):` prefix and prints
`TypeScript: No errors found` for anything else — including real compiler
failures. Two non-mutating repros:

```bash
rtk tsc --noEmit /tmp/definitely-not-here.ts
# "TypeScript: No errors found"   (exit 2)
rtk proxy pnpm exec tsc --noEmit /tmp/definitely-not-here.ts
# error TS6053: File '/tmp/definitely-not-here.ts' not found.
```

So config-not-found (TS5058), no-inputs (TS18003) and compiler crashes all read
as a pass **even when tsc genuinely ran**. Errors it *can* locate are reported
correctly, so the filter looks reliable right up until it isn't.

The bare-form `--help` behaviour is just how this manifests at the repo root:
there's no `tsconfig.json` there, only `tsconfig.base.json`, so bare `tsc`
prints help — which the parser then declares clean.

**The exit code is honest even when the text is not.** These failures exit
nonzero, so `cmd && next` still short-circuits correctly. It is a *reader* —
human or model — trusting the summary line who gets misled.

**The tell.** A real run prints turbo's `Tasks: N successful` or per-package
`<pkg> typecheck$ tsc --noEmit`. If all you see is `TypeScript: No errors found`,
you ran a broken form and know nothing about your types.

Positive proof the working forms work, rather than just looking right:
`rtk pnpm -r typecheck` caught six `TS2339`/`TS2353` errors in `packages/jobs`
when a regen wiped `gmail_state` (see §3), and separately caught a
`TS2307: Cannot find module` in a half-written module. A command running
`tsc --help` cannot emit either.

**Related, now resolved:** until recently, no `tsconfig.json` in this repo
included `tests/integration/`, so every "typecheck clean" claim about those
files only proved their type-only `Database` import didn't break
`packages/db`'s own compile — a real type error inside an integration test
sat there invisibly, caught by nothing. `tsconfig.integration.json` plus
`pnpm typecheck:integration` (wired into CI, see §5) now actually compiles
those files. The lesson still generalizes: a green summary proves only what
the invocation actually looked at, nothing more.

## 3. `pnpm gen:types` silently reverts unapplied migrations

`supabase gen types` reads the **live** database, so any migration that is
committed but not yet applied to prod is invisible to it. Regenerating wipes
whatever hand-written types someone added in anticipation of that migration.

It fails in the **consuming** package — `packages/jobs`, `apps/hoa` — nowhere
near `packages/db`, which makes it read like someone else's breakage.

Before regenerating, confirm every migration in `migrations/` is actually
applied. Afterwards, diff the result rather than assuming: compare **columns**,
not table names. A table-level comparison cannot detect deleted columns inside
an existing table, and will hand you a false pass.

## 4. `pnpm lint` has never worked here, and says the wrong thing

The Bash hook rewrites `pnpm lint` to rtk's own root ESLint invocation, which
reports:

```
[warn] Linter process terminated abnormally (possibly out of memory)   exit 254
```

That is not out of memory. `rtk pnpm lint` tells the truth: all four apps run
`next lint`, no ESLint config exists, so each drops into next's interactive
"How would you like to configure ESLint?" prompt and dies. Tasks: 0 successful,
4 total.

Nobody has ever successfully linted this repo. Do not read `pnpm lint` output.

## 5. CI now runs tests, but lint is still unconfigured

`.github/workflows/ci.yml` runs `pnpm turbo run typecheck`,
`pnpm typecheck:integration`, `pnpm turbo run build`, `pnpm test:unit`, and
(after starting Supabase and replaying the schema) `pnpm test:integration`.
Both suites — unit and integration — now gate merges.

Lint is the one thing CI still does not run. See §4: `next lint` has no
ESLint config in any app and drops into an interactive prompt, so it was
never wired in. That has not changed.

(This section previously said "CI runs neither tests nor lint." That was
true before both suites were wired in; it no longer is for tests.)

## Commands you can actually trust

Verified by deliberately forcing each one to fail and confirming it reported
the failure:

```
pnpm typecheck          rtk pnpm -r typecheck
pnpm test:unit          rtk pnpm vitest run
rtk pnpm build          rtk pnpm lint   (truthfully reports that lint is unconfigured)
pnpm typecheck:integration
```

Distrust anything routing through rtk's tsc filter.
