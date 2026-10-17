/**
 * One integration run (or one `db:local:reset`) at a time against the
 * ONE local Supabase stack, and no host sleep while it runs.
 *
 * Why this exists — two causes of "1-3 different tests fail on every full
 * run, each file passes alone", both found with evidence:
 *
 * 1. HOST SLEEP. This Mac idle-sleeps after 1 minute (pmset `sleep 1`)
 *    and keeps working only in ~45s DarkWake windows. A test in flight when
 *    the host sleeps resumes ~15 minutes later and fails as "Test timed out
 *    in 30000ms" with a reported duration equal to the sleep gap: 901s,
 *    394s and 940s failures matched the pmset log's sleep intervals to
 *    within 3 seconds. `caffeinate -i -w <pid>` holds an idle-sleep
 *    assertion for exactly the life of the test process.
 *
 * 2. CONCURRENT RUNS. Every worktree on this machine shares one local
 *    stack (127.0.0.1:54321/54322). Each file's truncateAll() runs
 *    `TRUNCATE orgs CASCADE; DELETE FROM auth.users`, so a second run
 *    deletes the first run's fixtures mid-test: FK violations in makeOrg,
 *    missing users, deadlocks, and a 1009s hang. Two overlapping full runs
 *    reproduced 40+ failures; a solo run on the same DB was clean.
 *    A Postgres session advisory lock serializes them. It lives in the
 *    database itself, so it covers every worktree and clone, and it is
 *    released by the server the moment the holding connection closes —
 *    a crashed run cannot leave a stale lock behind, unlike a lockfile.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Arbitrary, fixed. Shared by test:integration and db:local:reset. */
export const SUITE_LOCK_KEY = 727_274_001

/** A full run takes ~65s; this is generous queueing, not a hang budget. */
const DEFAULT_WAIT_SECONDS = 900

function appName(label: string): string {
  // No paths beyond the worktree's own directory name: no PII in logs.
  return `hoh-${label} pid=${process.pid} dir=${basename(process.cwd())}`.slice(0, 63)
}

async function describeHolder(dbUrl: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'psql',
      [
        dbUrl,
        '-X',
        '-tA',
        '-c',
        `select a.application_name || ' (held ' || date_trunc('second', now() - a.state_change) || ')'
           from pg_locks l join pg_stat_activity a using (pid)
          where l.locktype = 'advisory' and l.granted and l.classid = 0 and l.objid = ${SUITE_LOCK_KEY}`,
      ],
      { timeout: 10_000 },
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Blocks until this process holds the suite lock, then returns a release
 * function. The lock is held by a dedicated psql session whose stdin we
 * keep open; closing stdin (or this process dying) ends the session.
 */
export async function acquireSuiteLock(
  dbUrl: string,
  label: string,
  waitSeconds = DEFAULT_WAIT_SECONDS,
): Promise<() => Promise<void>> {
  const holder = await describeHolder(dbUrl)
  if (holder) {
    console.log(`[suite-lock] local DB is in use by ${holder}; waiting up to ${waitSeconds}s for it to finish`)
  }

  const child: ChildProcess = spawn('psql', [dbUrl, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGAPPNAME: appName(label) },
  })

  await new Promise<void>((resolveLock, rejectLock) => {
    let out = ''
    let err = ''
    const onExit = (code: number | null) =>
      rejectLock(
        new Error(
          `[suite-lock] could not acquire the local-DB lock within ${waitSeconds}s (psql exit ${code}). ` +
            `Another integration run or db:local:reset is still using 127.0.0.1:54322` +
            (holder ? ` (${holder})` : '') +
            `. Two runs against one DB delete each other's fixtures; wait for it rather than running in parallel. ${err.trim()}`,
        ),
      )
    child.once('exit', onExit)
    child.once('error', rejectLock)
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()))
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
      if (out.includes('__SUITE_LOCKED__')) {
        child.off('exit', onExit)
        resolveLock()
      }
    })
    child.stdin?.write(
      `SET lock_timeout = '${waitSeconds}s';\n` +
        `SELECT pg_advisory_lock(${SUITE_LOCK_KEY});\n` +
        `\\echo __SUITE_LOCKED__\n`,
    )
  })

  return async () => {
    if (child.exitCode !== null) return
    await new Promise<void>((done) => {
      child.once('exit', () => done())
      child.stdin?.end()
      setTimeout(() => {
        child.kill()
        done()
      }, 5_000).unref()
    })
  }
}

/**
 * macOS only: keep the host from idle-sleeping while this process lives.
 * `-w <pid>` makes caffeinate exit on its own when we do, even on a crash.
 * Lid-close (clamshell) sleep cannot be prevented this way; that one
 * still needs the lid open or external power + display.
 */
export function preventIdleSleep(): () => void {
  if (process.platform !== 'darwin') return () => {}
  try {
    const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' })
    c.on('error', () => {}) // caffeinate missing: run anyway
    c.unref()
    return () => {
      if (c.exitCode === null) c.kill()
    }
  } catch {
    return () => {}
  }
}
