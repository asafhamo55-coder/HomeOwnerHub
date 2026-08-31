/**
 * Web Push delivery for notifications.
 *
 * Separate from ticket-notifications.ts because the sending mechanics —
 * VAPID config, per-endpoint failure handling, pruning dead subscriptions —
 * have nothing to do with tickets and the next notification kind will reuse
 * them unchanged.
 *
 * Delivery is best-effort by design. The `notifications` row is the record
 * that a person was told; this only decides whether their phone also buzzes.
 * Every failure here is logged and swallowed, because a push provider
 * outage must not fail the job that already wrote the durable rows.
 */

import webpush from 'web-push'
import { isDeadSubscription } from './ticket-notifications'

interface Logger {
  warn: (msg: string) => void
  info?: (msg: string) => void
}

interface PushContent {
  title: string
  body: string
  link: string
  tag: string
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configured: boolean | null = null

/**
 * VAPID identifies this server to the push service. Without the private key
 * there is nothing to sign with, so we skip pushing entirely rather than
 * throwing — the feature ships before the key is set, and in-app
 * notifications must keep working meanwhile.
 */
function ensureConfigured(logger: Logger): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@homeownerledger.com'
  if (!publicKey || !privateKey) {
    logger.warn('web-push: VAPID keys not set; skipping push (in-app notifications unaffected)')
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

/**
 * Push `content` to every device registered to `userIds`.
 *
 * Returns how many endpoints accepted it. A user with no subscription is
 * not a failure — they simply never enabled it, or are on an iPhone that
 * has not added the app to the Home Screen, which is the only way Apple
 * delivers Web Push.
 */
export async function sendPushToUsers(
  db: { from: (table: string) => any },
  organizationId: string,
  userIds: string[],
  content: PushContent,
  logger: Logger,
): Promise<number> {
  if (userIds.length === 0) return 0
  if (!ensureConfigured(logger)) return 0

  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('organization_id', organizationId)
    .in('user_id', userIds)

  // Migration 0053 may not be applied yet; that is a no-op, not an error.
  if (error) {
    logger.warn(`web-push: subscription lookup failed: ${error.message}`)
    return 0
  }

  const subs = (data ?? []) as SubscriptionRow[]
  if (subs.length === 0) return 0

  const payload = JSON.stringify(content)
  const dead: string[] = []
  let delivered = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        delivered += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (isDeadSubscription(status)) {
          dead.push(sub.id)
          return
        }
        // Endpoint URLs are device identifiers — log the status, never the
        // endpoint or the payload.
        logger.warn(`web-push: send failed with status ${status ?? 'unknown'}`)
      }
    }),
  )

  // Prune in one statement. Left in place these retry forever against
  // devices that no longer exist.
  if (dead.length > 0) {
    await db.from('push_subscriptions').delete().in('id', dead)
    logger.warn(`web-push: pruned ${dead.length} dead subscription(s)`)
  }

  return delivered
}
