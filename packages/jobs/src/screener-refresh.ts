import { inngest } from './client'

/**
 * Weekly EPS-screener refresh.
 *
 * Fires Mondays at 06:00 ET. Earnings are quarterly, so weekly is ample to
 * pick up newly-reported quarters and refreshed estimates. The screener's
 * ingest logic lives in the Next app (apps/screener), and this jobs package
 * can't import across that boundary, so the cron POSTs the app's idempotent
 * /api/ingest endpoint with an empty body → "refresh every active ticker."
 * The manual "Refresh now" button hits the same path.
 *
 * Config:
 *   SCREENER_APP_URL  — base URL of the deployed screener app (required).
 *   CRON_SECRET       — optional shared secret; sent as a Bearer token when set
 *                       and enforced by the route.
 *
 * No-ops gracefully when SCREENER_APP_URL is unset so non-screener deploys of
 * the jobs package don't error.
 */
export const screenerRefreshJob = inngest.createFunction(
  { id: 'screener-refresh', name: 'Equity Screener Weekly Refresh' },
  { cron: 'TZ=America/New_York 0 6 * * 1' },
  async ({ logger }) => {
    const base = process.env.SCREENER_APP_URL
    if (!base) {
      logger.warn('SCREENER_APP_URL not set — skipping screener refresh')
      return { skipped: true as const }
    }

    const secret = process.env.CRON_SECRET
    const res = await fetch(`${base.replace(/\/$/, '')}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: '{}',
    })

    const json = (await res.json().catch(() => ({}))) as {
      refreshed?: number
      error?: string
    }
    if (!res.ok) {
      throw new Error(`screener ingest failed (${res.status}): ${json.error ?? 'unknown error'}`)
    }

    logger.info(`screener refresh complete: ${json.refreshed ?? 0} ticker(s)`)
    return { refreshed: json.refreshed ?? 0 }
  },
)
