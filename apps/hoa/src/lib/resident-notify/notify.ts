// BL-082 — the one entry point board actions call after a decision or a
// reply is saved.
//
// NOT a 'use server' file: it takes an already-authenticated board client
// and must never be callable from a browser. Only server actions that have
// passed requireBoardOrAdmin import it (lib/board-review.ts,
// lib/tickets.ts).
//
// The send runs in `after()`: the board's save has already succeeded and
// returned before anything is sent, and the runner never throws, so a
// provider hiccup can neither slow nor undo the board's action. Whether
// anything goes out at all is decided inside the runner by the
// association's signed setting — OFF unless the board turned it on.

import { after } from 'next/server'
import { residentNotifyDeps } from './deps'
import { runResidentNotification, type ResidentNotifyEvent } from './run'
import { supabaseResidentNotifyStore } from './store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta ?? {}),
}

/** Queue the resident notice for after the response. Never throws. */
export function notifyResidentAfterResponse(db: Db, event: ResidentNotifyEvent): void {
  try {
    after(async () => {
      await runResidentNotification(supabaseResidentNotifyStore(db), residentNotifyDeps, event, logger)
    })
  } catch (err) {
    // after() outside a request scope (it should never be): skip, by name only.
    console.error('[resident-notify] could not schedule', {
      event: event.kind,
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}
