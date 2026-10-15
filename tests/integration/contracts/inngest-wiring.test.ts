/**
 * The wiring contract.
 *
 * Two failure modes have each shipped to production here:
 *   - a job defined and exported but never registered in serve(), so its
 *     cron silently does not exist (recurringJeJob, plaidSyncJob)
 *   - an inngest.send() event name with no registered listener
 *
 * Both are invisible at runtime: no error, no log, just nothing
 * happening. This test reads the source so it cannot be fooled by a
 * mock, and it is cheap enough to run forever.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../..')

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
}

/** Jobs re-exported from packages/jobs — the public job surface. */
function exportedJobNames(): string[] {
  const src = read('packages/jobs/src/index.ts')
  return [...src.matchAll(/export\s*\{\s*(\w+Job)\s*\}/g)].map((m) => m[1]).sort()
}

/** Jobs listed in the serve() functions array. */
function registeredJobNames(): string[] {
  const src = read('apps/hoa/src/app/api/inngest/route.ts')
  const block = src.match(/functions:\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error('inngest route: could not find the functions: [...] array')
  return [...block[1].matchAll(/(\w+Job)/g)].map((m) => m[1]).sort()
}

/** Every inngest.send({ name: '...' }) across the repo. */
function sentEventNames(): string[] {
  const out = execFileSync(
    'grep',
    ['-rhoE', "name:\\s*'[a-z]+/[a-z.]+'", '--include=*.ts', '--include=*.tsx', 'apps', 'packages'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

/** Every { event: '...' } trigger in packages/jobs. */
function listenedEventNames(): string[] {
  const out = execFileSync(
    'grep',
    ['-rhoE', "event:\\s*'[a-z]+/[a-z.]+'", '--include=*.ts', 'packages/jobs/src'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

describe('inngest wiring contract', () => {
  it('every exported job is registered in serve()', () => {
    const exported = exportedJobNames()
    const registered = registeredJobNames()
    expect(exported.length).toBeGreaterThan(0)
    const unregistered = exported.filter((j) => !registered.includes(j))
    expect(
      unregistered,
      `exported but never registered — their crons do not exist on the platform: ${unregistered.join(', ')}`,
    ).toEqual([])
  })

  it('every sent event has a registered listener', () => {
    const sent = sentEventNames()
    const listened = listenedEventNames()
    expect(sent.length).toBeGreaterThan(0)
    const orphaned = sent.filter((e) => !listened.includes(e))
    expect(orphaned, `sent with no listener: ${orphaned.join(', ')}`).toEqual([])
  })
})
