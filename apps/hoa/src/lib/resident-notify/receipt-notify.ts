// BL-114 — the entry points for payment receipts.
//
// NOT a 'use server' file: both take an already-authenticated board client
// and must never be callable from a browser. Only server actions that have
// passed requireBoardOrAdminForAction import them (lib/assessments.ts,
// lib/bank-rec.ts, ./receipt-actions.ts).
//
// queuePaymentReceiptAfterResponse: after the board records a payment. Runs
// in `after()`, so the recorded payment has already been saved and returned
// before anything is sent; the runner never throws. Whether anything goes
// out at all is decided inside the runner by the association's signed
// setting — OFF unless the board turned it on.
//
// sendPaymentReceiptNow: the board's explicit "Send receipt" click. Awaited,
// so the board is told what happened; it does not read the setting.

import { after } from 'next/server'
import { residentNotifyDeps } from './deps'
import { runPaymentReceipt, type PaymentReceiptResult } from './receipt-run'
import { supabasePaymentReceiptStore } from './receipt-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta ?? {}),
}

/** Queue the automatic receipt for after the response. Never throws. */
export function queuePaymentReceiptAfterResponse(db: Db, input: { paymentId: string; associationId: string }): void {
  try {
    after(async () => {
      await runPaymentReceipt(
        supabasePaymentReceiptStore(db),
        residentNotifyDeps,
        { ...input, trigger: 'auto' },
        logger,
      )
    })
  } catch (err) {
    // after() outside a request scope (it should never be): skip, by name only.
    console.error('[payment-receipt] could not schedule', { error: err instanceof Error ? err.name : 'unknown' })
  }
}

/** The board's explicit send. Never throws. */
export function sendPaymentReceiptNow(
  db: Db,
  input: { paymentId: string; associationId: string },
): Promise<PaymentReceiptResult> {
  return runPaymentReceipt(supabasePaymentReceiptStore(db), residentNotifyDeps, { ...input, trigger: 'manual' }, logger)
}
