/**
 * BL-143: the signed-in account's own claim count (owner_join_my_status),
 * for the "Ask to join" page. Says nothing about any home or request.
 *
 * Not a server action. Flag off: null without touching the database.
 */

import { M5_APPLIED } from '@homeowner-portal/db/m5'
import type { JoinDb } from './board'
import { readJoinStatus, type JoinStatus } from './model'

export async function loadMyJoinStatus(db: JoinDb, live: boolean = M5_APPLIED): Promise<JoinStatus | null> {
  if (!live) return null
  const { data, error } = (await db.rpc('owner_join_my_status')) as { data: unknown; error: { code?: string } | null }
  if (error) {
    console.error('[owner-join] status read failed', { code: error.code ?? null })
    return null
  }
  return readJoinStatus(data)
}
