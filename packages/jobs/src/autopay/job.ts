import { createAdminClient, M8_APPLIED } from '@homeowner-portal/db'
import { inngest } from '../client'
import { createAutopayStore } from './store'
import { runAutopay, type AutopayDeps } from './run'

/**
 * BL-036 autopay. ONE daily function (Inngest Hobby budget, design doc
 * section 7): it fans out inside itself, never one invocation per enrollment.
 * A no-op while M8_APPLIED is false: returns before any read.
 */
export function createAutopayJob(deps: AutopayDeps) {
  return inngest.createFunction(
    { id: 'autopay-daily', name: 'Autopay: notices and daily run (BL-036)' },
    { cron: 'TZ=UTC 0 13 * * *' },
    async () => {
      if (!M8_APPLIED) return { skipped: 'm8_off' as const }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return runAutopay(createAutopayStore(createAdminClient() as any), deps, { m8Applied: M8_APPLIED })
    },
  )
}
