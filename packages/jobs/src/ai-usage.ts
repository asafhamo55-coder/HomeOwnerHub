import { AsyncLocalStorage } from 'node:async_hooks'
import {
  addAiCallObserver,
  recordPlatformAiUsage,
  type PlatformAiUsageLabel,
} from '@homeowner-portal/ai/guard'

/**
 * BL-112 — platform-level metering for model calls that no user's bucket
 * pays for (background jobs, machine webhooks).
 *
 * `meterJobAi(label, fn)` runs `fn` in an async scope; every guarded chat
 * call made inside it (packages/ai guard → `addAiCallObserver`) bumps the
 * scope's counter, and when `fn` settles — success or failure — that many
 * `ai.usage.<label>` rows go to audit_log (recordPlatformAiUsage). The
 * daily ai-spend-alert prices them. Jobs are deliberately NOT capped per
 * org: the rows carry the org id when there is one, but no per-org meter
 * reads these labels.
 *
 * Wrap the work INSIDE an Inngest `step.run`, so a memoized replay (which
 * does not re-run the callback) does not count again.
 *
 * Embedding calls are not counted here: embedTexts writes its own
 * `ai.usage.embed` rows wherever it runs.
 */

interface Scope {
  calls: number
}

const scopes = new AsyncLocalStorage<Scope>()

addAiCallObserver((kind) => {
  if (kind !== 'chat') return
  const scope = scopes.getStore()
  if (scope) scope.calls += 1
})

export async function meterJobAi<T>(
  label: Extract<PlatformAiUsageLabel, `job.${string}`>,
  fn: () => Promise<T>,
  opts: { orgId?: string | null } = {},
): Promise<T> {
  const scope: Scope = { calls: 0 }
  try {
    return await scopes.run(scope, fn)
  } finally {
    await recordPlatformAiUsage({ label, calls: scope.calls, orgId: opts.orgId ?? null })
  }
}
