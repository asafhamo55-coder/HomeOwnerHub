/**
 * BL-111: consent is tied to the phone number.
 *
 * The BL-110 grant (./sms-consent.ts) writes an audit_log row
 * `sms_consent_granted` whose metadata.phone_sha256 lists the SHA-256 of
 * every E.164 number the resident saw when they agreed. A text may only go
 * to a number whose hash is in the resident's LATEST UNREVOKED grant for
 * that org: if their number changed since, the old agreement does not
 * cover the new one and they must agree again.
 *
 * "Latest unrevoked": the resident's grant/revoke rows for the org are
 * folded oldest → newest; a grant replaces the set, a revoke clears it.
 * So a portal "Stop texts" or an inbound STOP (both write
 * `sms_consent_revoked`) empties the set until the next grant.
 *
 * Pre-BL-110 rows (sms_opt_in = true with no grant row) have an empty set:
 * conservatively treated as needing consent. See
 * docs/decisions/2026-10-20-sms-consent-per-number.md.
 *
 * Reads only. Logs nothing. Hashes are never logged either (a US phone
 * hash is brute-forceable, so it is treated as the number itself).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { SMS_CONSENT_GRANTED, SMS_CONSENT_REVOKED, normalizeUsPhone, sha256Hex } from './sms-consent'

type Client = SupabaseClient<Database>

export const SMS_CONSENT_ENTITY = 'resident_communication_preferences'

export interface ConsentAuditRow {
  id?: string
  org_id?: string | null
  user_id: string | null
  action: string
  metadata: unknown
  created_at: string | null
}

/** user id → SHA-256s of the numbers their latest unrevoked grant covers. */
export type SmsConsentMap = ReadonlyMap<string, ReadonlySet<string>>

function phoneHashesOf(metadata: unknown): string[] {
  const list = (metadata as { phone_sha256?: unknown } | null)?.phone_sha256
  if (!Array.isArray(list)) return []
  return list.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h))
}

/**
 * Fold grant / revoke rows (any order) into each user's current consented
 * numbers. A user whose latest event is a revoke is absent.
 */
export function foldConsentRows(rows: readonly ConsentAuditRow[]): Map<string, Set<string>> {
  const sorted = [...rows].sort((a, b) => {
    const t = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    return t !== 0 ? t : String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
  const out = new Map<string, Set<string>>()
  for (const r of sorted) {
    if (!r.user_id) continue
    if (r.action === SMS_CONSENT_GRANTED) out.set(r.user_id, new Set(phoneHashesOf(r.metadata)))
    else if (r.action === SMS_CONSENT_REVOKED) out.delete(r.user_id)
  }
  for (const [user, set] of out) if (set.size === 0) out.delete(user)
  return out
}

/** The hash a consent row would hold for this raw phone, or null when not textable. */
export function phoneConsentHash(raw: string | null | undefined): string | null {
  const e164 = normalizeUsPhone(raw)
  return e164 ? sha256Hex(e164) : null
}

/** True only when the number normalises and its hash is in the set. */
export function phoneIsConsented(consented: ReadonlySet<string> | undefined, raw: string | null | undefined): boolean {
  if (!consented || consented.size === 0) return false
  const h = phoneConsentHash(raw)
  return h !== null && consented.has(h)
}

const PAGE = 1000

/**
 * Every grant/revoke row for the org, paged, in one pass — one read per
 * send however many recipients (no N+1). Board RLS (0063
 * audit_log_select) or the service role can read these; a resident cannot.
 */
export async function loadSmsConsentMap(
  db: Client,
  orgId: string,
): Promise<{ ok: true; map: Map<string, Set<string>> } | { ok: false }> {
  const rows: ConsentAuditRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('audit_log')
      .select('id, user_id, action, metadata, created_at')
      .eq('org_id', orgId)
      .eq('entity_type', SMS_CONSENT_ENTITY)
      .in('action', [SMS_CONSENT_GRANTED, SMS_CONSENT_REVOKED])
      .not('user_id', 'is', null)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { ok: false }
    const page = (data ?? []) as ConsentAuditRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { ok: true, map: foldConsentRows(rows) }
}

/** One resident's consented numbers in one org (the single-recipient paths). */
export async function loadUserSmsConsent(
  db: Client,
  orgId: string,
  userId: string,
): Promise<{ ok: true; phones: Set<string> } | { ok: false }> {
  const rows: ConsentAuditRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('audit_log')
      .select('id, user_id, action, metadata, created_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('entity_type', SMS_CONSENT_ENTITY)
      .in('action', [SMS_CONSENT_GRANTED, SMS_CONSENT_REVOKED])
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { ok: false }
    const page = (data ?? []) as ConsentAuditRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { ok: true, phones: foldConsentRows(rows).get(userId) ?? new Set() }
}

/**
 * The account panel's view: which of the resident's current numbers lack
 * consent. `no_record` — texts are on but no grant covers anything (a
 * pre-BL-110 row); `number_changed` — a grant exists but not for every
 * number texts would now go to.
 */
export type ConsentGap = 'none' | 'number_changed' | 'no_record'

export function consentGap(e164Phones: readonly string[], consented: ReadonlySet<string>): ConsentGap {
  if (e164Phones.length === 0) return 'none'
  const missing = e164Phones.some((p) => !consented.has(sha256Hex(p)))
  if (!missing) return 'none'
  return consented.size === 0 ? 'no_record' : 'number_changed'
}
