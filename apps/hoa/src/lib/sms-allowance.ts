// BL-104 / decision §4 — the monthly SMS allowance, read from the org's own
// send records. The rule (allowance per plan, 80% warning, 100% block) is
// pure, in packages/billing/src/sms-allowance.ts; this file only counts.
//
//   used    = this calendar month's (UTC) communication_recipients rows with
//             channel 'sms' and a sent_at (only a delivered-to-provider
//             text gets one), × SMS_SEGMENTS_PER_TEXT. Every SMS path in
//             the app (broadcasts, scheduled sends, event alerts, resident
//             notices) writes one of these rows.
//   doors   = hoa_properties rows (the count checkout and band sync use).
//
// Before PRICING_V2, and for any org not on 'essentials' / 'complete', it
// returns null WITHOUT a read: nobody is limited and nothing changes.
//
// Fail open: a failed read never stops a text (logged with ids and codes).
// Not a 'use server' module: nothing here is callable from a browser.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import {
  PRICING_V2,
  SMS_SEGMENTS_PER_TEXT,
  smsAllowanceApplies,
  smsAllowanceStatus,
  type SmsAllowanceStatus,
} from '@homeowner-portal/billing'
import { logRouteFailure } from '@/lib/api/log'

type Db = SupabaseClient<Database>

/** [start, end) of the UTC calendar month containing `now`, as ISO strings. */
export function utcMonthRange(now: number): { start: string; end: string } {
  const d = new Date(now)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * This month's allowance for one org, or null when it has none (flag off,
 * or not a new-plan org). Throws on a failed read; callers decide.
 */
export async function readSmsAllowance(
  db: Db,
  orgId: string,
  opts: { now?: number; pricingV2?: boolean } = {},
): Promise<SmsAllowanceStatus | null> {
  if (!(opts.pricingV2 ?? PRICING_V2)) return null
  const { data: org, error: orgErr } = await db.from('orgs').select('plan').eq('id', orgId).maybeSingle()
  if (orgErr) throw Object.assign(new Error('sms_allowance_org_read'), { code: orgErr.code })
  const plan = (org as { plan: string | null } | null)?.plan ?? null
  if (!smsAllowanceApplies(plan, true)) return null

  const { start, end } = utcMonthRange(opts.now ?? Date.now())
  const [homes, texts] = await Promise.all([
    db.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    db
      .from('communication_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('channel', 'sms')
      .gte('sent_at', start)
      .lt('sent_at', end),
  ])
  if (homes.error) throw Object.assign(new Error('sms_allowance_homes_read'), { code: homes.error.code })
  if (texts.error) throw Object.assign(new Error('sms_allowance_texts_read'), { code: texts.error.code })
  return smsAllowanceStatus(plan, homes.count ?? 0, texts.count ?? 0)
}

export interface SmsAllowanceGate {
  /** Reserve one text. false = the allowance is used up: don't send it. */
  take(): boolean
}

/**
 * The communications send hook (lib/communications/deliver.ts): null when
 * the org has no allowance or the read failed (texts go out as before).
 * Otherwise a counter seeded with what is left this month; each text takes
 * SMS_SEGMENTS_PER_TEXT, synchronously, so concurrent sends in one delivery
 * cannot overshoot by more than one text.
 */
export async function smsAllowanceGate(
  db: Db,
  orgId: string,
  opts: { now?: number; pricingV2?: boolean } = {},
): Promise<SmsAllowanceGate | null> {
  if (!(opts.pricingV2 ?? PRICING_V2)) return null
  let status: SmsAllowanceStatus | null
  try {
    status = await readSmsAllowance(db, orgId, opts)
  } catch (err) {
    logRouteFailure('sms.allowance.read', err, { orgId })
    return null
  }
  if (!status) return null
  let remaining = status.remainingSegments
  return {
    take() {
      if (remaining <= 0) return false
      remaining -= SMS_SEGMENTS_PER_TEXT
      return true
    },
  }
}
