import { afterEach, describe, expect, it, vi } from 'vitest'
import { guardAiClient, setAiUsageRecorder, type PlatformAiUsage } from '@homeowner-portal/ai'
import { meterJobAi } from './ai-usage'

// BL-112: model calls made inside a job's metering scope become
// `ai.usage.job.<name>` rows (via the injectable recorder — no database).

function client() {
  return guardAiClient({ chat: { completions: { create: vi.fn(async () => ({})) } } })
}

afterEach(() => setAiUsageRecorder(null))

describe('meterJobAi', () => {
  it('records one row per guarded chat call made inside the scope, with the org id', async () => {
    const rec = vi.fn(async (_u: PlatformAiUsage) => {})
    setAiUsageRecorder(rec)
    const c = client()
    await meterJobAi(
      'job.plaid_sync',
      async () => {
        await c.chat.completions.create()
        await c.chat.completions.create()
      },
      { orgId: 'org-1' },
    )
    expect(rec).toHaveBeenCalledWith({ label: 'job.plaid_sync', calls: 2, orgId: 'org-1' })
  })

  it('does not count calls made outside the scope, and still records when the work throws', async () => {
    const rec = vi.fn(async (_u: PlatformAiUsage) => {})
    setAiUsageRecorder(rec)
    const c = client()
    await c.chat.completions.create() // outside: a user route's call, already in its bucket
    await expect(
      meterJobAi('job.plaid_webhook', async () => {
        await c.chat.completions.create()
        throw new Error('later step failed')
      }),
    ).rejects.toThrow('later step failed')
    expect(rec).toHaveBeenCalledTimes(1)
    expect(rec).toHaveBeenCalledWith({ label: 'job.plaid_webhook', calls: 1, orgId: null })
  })
})
