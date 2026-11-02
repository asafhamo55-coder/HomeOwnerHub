/**
 * Real wiring for the online-payment ports. SERVER ONLY, not a 'use server'
 * module. Nothing here runs unless M8_APPLIED is true (callers check first).
 */

import { createAdminClient } from '@homeowner-portal/db'
import { residentNotifyDeps } from '@/lib/resident-notify/deps'
import { runPaymentReceipt } from '@/lib/resident-notify/receipt-run'
import { supabasePaymentReceiptStore } from '@/lib/resident-notify/receipt-store'
import { supabaseAttemptStore, supabaseWebhookStore, type Db } from './attempt-store'
import { getLivePort } from './stripe-port-live'
import type { WebhookDeps } from './webhook-handlers'

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta ?? {}),
}

export function adminDb(): Db {
  return createAdminClient() as unknown as Db
}

export function productionAttemptDeps() {
  const stripe = getLivePort()
  if (!stripe) return null
  return { store: supabaseAttemptStore(adminDb()), stripe }
}

/**
 * The deps for registerOnlinePaymentHandlers. The receipt goes through the
 * existing BL-114 runner: it sends only when the association turned receipts
 * on, and every recipient passes the outbound guard.
 */
export function productionWebhookDeps(): WebhookDeps {
  const db = adminDb()
  return {
    store: supabaseWebhookStore(db),
    async afterPosted({ associationId, paymentIds }) {
      const first = paymentIds[0]
      if (!first) return
      await runPaymentReceipt(
        supabasePaymentReceiptStore(db),
        residentNotifyDeps,
        { paymentId: first, associationId, trigger: 'auto' },
        logger,
      )
    },
  }
}
