// Download the CI screenshots for a deploy, for the release-note email.
//
//   pnpm exec tsx scripts/release-notes/fetch-shots.ts --sha <deployed sha> --out <dir>
//       [--wait-minutes 25]
//
// Finds the .github/workflows/ui-shots.yml run for the deployed SHA, or for
// the nearest of up to 20 ancestors from which only docs changed (a deploy
// is often a docs-only commit on top of the tested one), waits up to
// --wait-minutes for one still running, and downloads its `ui-shots-<sha>`
// artifact into <dir>. Those PNGs come from CI's seeded demo data on a
// throwaway local Supabase — never production.
//
// Never fails the email: every problem is logged and the script exits 0
// with found=false, and render.ts then says "Screenshots unavailable".
// Writes found / sha / run_id to $GITHUB_OUTPUT when set.
//
// Env: GH_TOKEN (actions:read; gh reads it, this script never prints it),
// REPO or GITHUB_REPOSITORY (owner/repo). Logs SHAs and run ids only.

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from './lib/build'
import {
  MAX_ANCESTORS,
  eligibleAncestors,
  pickShotsSource,
  type Ancestor,
  type ShotsRun,
  type ShotsSource,
} from './lib/ui-shots'

const WORKFLOW = 'ui-shots.yml'
const POLL_MS = 30_000

const log = (line: string) => console.log(`fetch-shots: ${line}`)

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
}

function ghJson<T>(endpoint: string): T {
  return JSON.parse(run('gh', ['api', endpoint])) as T
}

function ancestorsOf(sha: string): Ancestor[] {
  const shas = run('git', ['rev-list', `--max-count=${MAX_ANCESTORS + 1}`, sha]).split('\n').filter(Boolean)
  return shas.map((c, i) => ({
    sha: c,
    changedSince: i === 0 ? [] : run('git', ['diff', '--name-only', c, sha]).split('\n').filter(Boolean),
  }))
}

function latestRun(repo: string, sha: string): ShotsRun | null {
  const res = ghJson<{ workflow_runs: { id: number; status: string; conclusion: string | null; head_sha: string }[] }>(
    `repos/${repo}/actions/workflows/${WORKFLOW}/runs?head_sha=${sha}&per_page=5`,
  )
  const r = res.workflow_runs.find((w) => w.head_sha === sha)
  if (!r) return null
  let hasArtifact = false
  if (r.status === 'completed') {
    const arts = ghJson<{ artifacts: { name: string; expired: boolean }[] }>(
      `repos/${repo}/actions/runs/${r.id}/artifacts?name=ui-shots-${sha}&per_page=5`,
    )
    hasArtifact = arts.artifacts.some((a) => a.name === `ui-shots-${sha}` && !a.expired)
  }
  return { id: r.id, status: r.status, conclusion: r.conclusion, hasArtifact }
}

/** Walks the eligible commits nearest first, querying runs only as far as needed. */
function walk(repo: string, eligible: readonly string[], skipPending: boolean): ShotsSource {
  const runs = new Map<string, ShotsRun | null>()
  for (const sha of eligible) {
    runs.set(sha, latestRun(repo, sha))
    const pick = pickShotsSource([sha], runs, { skipPending })
    if (pick.kind !== 'none') return pick
  }
  return { kind: 'none' }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const shaArg = typeof args.sha === 'string' ? args.sha : ''
  const out = typeof args.out === 'string' ? path.resolve(args.out) : ''
  const waitMinutes = Number(typeof args['wait-minutes'] === 'string' ? args['wait-minutes'] : 25)
  const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || ''
  const output = (k: string, v: string) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  }
  output('found', 'false')
  if (!/^[0-9a-f]{40}$/.test(shaArg) || !out || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    log('needs --sha <40-char sha>, --out <dir> and REPO=owner/repo; no screenshots')
    return
  }

  const eligible = eligibleAncestors(ancestorsOf(shaArg))
  log(`candidates (deployed + docs-only ancestors): ${eligible.map((s) => s.slice(0, 12)).join(', ')}`)

  const deadline = Date.now() + Math.max(0, waitMinutes) * 60_000
  let pick = walk(repo, eligible, false)
  while (pick.kind === 'wait') {
    if (Date.now() >= deadline) {
      log(`run ${pick.runId} for ${pick.sha.slice(0, 12)} still running after ${waitMinutes} min; looking further back`)
      pick = walk(repo, eligible, true)
      break
    }
    log(`waiting for run ${pick.runId} (${pick.sha.slice(0, 12)})`)
    await new Promise((r) => setTimeout(r, POLL_MS))
    const again = latestRun(repo, pick.sha)
    if (again && again.status === 'completed') pick = walk(repo, eligible, Date.now() >= deadline)
  }

  if (pick.kind !== 'ready') {
    log('no UI shots run with screenshots for this deploy')
    return
  }
  mkdirSync(out, { recursive: true })
  run('gh', ['run', 'download', String(pick.runId), '--repo', repo, '--name', `ui-shots-${pick.sha}`, '--dir', out])
  log(`downloaded ui-shots-${pick.sha.slice(0, 12)} from run ${pick.runId}`)
  output('found', 'true')
  output('sha', pick.sha)
  output('run_id', String(pick.runId))
}

main().catch((err: unknown) => {
  // Never block the email. gh's stderr can echo a URL but never the token.
  log(`failed (${err instanceof Error ? err.message.split('\n')[0] : 'unknown error'}); no screenshots`)
  process.exit(0)
})
