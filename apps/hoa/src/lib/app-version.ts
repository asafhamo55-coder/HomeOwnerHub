// BL-071: which version of the product is running.
//
// One source for the commit sha shown in the app chrome AND reported by
// GET /api/health's `version` — both call `appCommitSha()`, so they cannot
// drift (route.test.ts asserts it). The build time is injected by
// next.config.ts as NEXT_PUBLIC_BUILD_TIME (Vercel provides no commit
// date), so the label's date is the deploy's build day.
//
// Read on the server only: the chrome renders the label in server
// components and passes it down as a prop, so no client bundle depends on
// a runtime env var.

const TIME_ZONE = 'America/New_York'
const LOCAL = 'local'

export interface AppVersion {
  /** Full commit sha, or "local" off Vercel. */
  sha: string
  /** First 7 chars of the sha, or "local". */
  shortSha: string
  /** Human label, e.g. "v2026.10.17 · c56061f". */
  label: string
  /** Tooltip text carrying the full sha (and build time when known). */
  title: string
}

const dayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function buildDay(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = Object.fromEntries(dayParts.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}.${parts.month}.${parts.day}`
}

/** Pure: sha + ISO build time → display version. Missing pieces degrade, never throw. */
export function formatAppVersion(sha: string | undefined, builtAt: string | undefined): AppVersion {
  const full = sha && sha.trim() ? sha.trim() : LOCAL
  const shortSha = full === LOCAL ? LOCAL : full.slice(0, 7)
  const day = buildDay(builtAt)
  const label = day ? `v${day} · ${shortSha}` : shortSha
  const title = day ? `Commit ${full}, built ${builtAt}` : `Commit ${full}`
  return { sha: full, shortSha, label, title }
}

/** The deployed commit sha — the same value /api/health reports as `version`. */
export function appCommitSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || LOCAL
}

/** ISO timestamp stamped at build time by next.config.ts. */
export function appBuildTime(): string | undefined {
  return process.env.NEXT_PUBLIC_BUILD_TIME || undefined
}

export function appVersion(): AppVersion {
  return formatAppVersion(appCommitSha(), appBuildTime())
}
