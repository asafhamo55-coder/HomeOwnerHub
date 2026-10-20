/**
 * BL-111: inbound STOP / START / HELP from residents' phones.
 *
 * Vonage posts every text a resident sends to our number to
 * /api/webhooks/vonage/inbound (behind SMS_INBOUND_ENABLED). This module
 * is that route's logic, testable with fakes:
 *
 *   - verifyVonageSignedWebhook: Vonage "signed webhooks" — an
 *     `Authorization: Bearer <JWT>` signed HS256 with the account's
 *     signature secret, whose `payload_hash` claim is the SHA-256 of the
 *     exact body. Unsigned or mismatched requests are refused.
 *   - classifyKeyword: carrier-standard keywords. STOP-family stops, START
 *     restarts, HELP is answered by Vonage's own keyword config (we send
 *     nothing).
 *   - applyStop / applyStart: map the sender (E.164 → SHA-256) to
 *     residents through the consent ledger. Consent rows are the only
 *     place a number is recorded against a resident in a comparable form,
 *     and (BL-111) a text only ever goes to a number with a consent row,
 *     so every number we could have texted is findable here.
 *
 * Writes use the service role (the caller passes it): the 2026-10-20 SMS
 * consent trigger exempts the service role, and audit_log inserts are
 * board/admin-only under RLS. Idempotent: the preference update is a set,
 * and each audit row carries the provider's message id and is skipped if
 * one for the same resident, action and message already exists.
 *
 * Logs nothing; the route logs ids and counts. Never the number or its hash.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { checkWrite } from '@/lib/api/db'
import { SMS_CONSENT_GRANTED, SMS_CONSENT_REVOKED, sha256Hex } from './sms-consent'
import { SMS_CONSENT_ENTITY, loadUserSmsConsent, phoneConsentHash } from './sms-consent-ledger'

type Db = SupabaseClient<Database>

// ─── keywords ───────────────────────────────────────────────────────

export const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'] as const
export const START_KEYWORDS = ['START', 'UNSTOP'] as const
export const HELP_KEYWORDS = ['HELP', 'INFO'] as const

export type InboundKeyword = 'stop' | 'start' | 'help'

/**
 * STOP-family matches when it is the first word ("Stop please", "stop!"),
 * so a reasonable opt-out is honoured. START and HELP must be the whole
 * message: re-subscribing someone on a chance word would be wrong.
 */
export function classifyKeyword(text: string | null | undefined): InboundKeyword | null {
  if (!text) return null
  const words = text
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z]/g, ''))
    .filter(Boolean)
  if (words.length === 0) return null
  if ((STOP_KEYWORDS as readonly string[]).includes(words[0])) return 'stop'
  if (words.length !== 1) return null
  if ((START_KEYWORDS as readonly string[]).includes(words[0])) return 'start'
  if ((HELP_KEYWORDS as readonly string[]).includes(words[0])) return 'help'
  return null
}

// ─── signature ──────────────────────────────────────────────────────

/** A signed request older than this is refused (replay window). */
export const MAX_JWT_AGE_SECONDS = 24 * 60 * 60
const MAX_FUTURE_SKEW_SECONDS = 5 * 60

function b64urlDecode(part: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_signature' | 'invalid_signature' | 'payload_mismatch' | 'expired' }

/**
 * Verify Vonage's signed-webhook JWT (HS256 over header.payload with the
 * signature secret) and that its payload_hash is the SHA-256 of `rawBody`.
 * When `apiKey` is given, the token's api_key claim must equal it.
 */
export function verifyVonageSignedWebhook(args: {
  authorization: string | null
  rawBody: string
  secret: string
  nowSeconds: number
  apiKey?: string | null
}): SignatureCheck {
  const m = /^Bearer\s+([^\s]+)$/i.exec(args.authorization?.trim() ?? '')
  if (!m) return { ok: false, reason: 'missing_signature' }
  const parts = m[1].split('.')
  if (parts.length !== 3) return { ok: false, reason: 'invalid_signature' }
  const [h, p, sig] = parts

  let header: { alg?: unknown }
  let payload: { iat?: unknown; payload_hash?: unknown; api_key?: unknown }
  try {
    header = JSON.parse(b64urlDecode(h)?.toString('utf8') ?? 'null') ?? {}
    payload = JSON.parse(b64urlDecode(p)?.toString('utf8') ?? 'null') ?? {}
  } catch {
    return { ok: false, reason: 'invalid_signature' }
  }
  if (header.alg !== 'HS256') return { ok: false, reason: 'invalid_signature' }

  const expected = createHmac('sha256', args.secret).update(`${h}.${p}`).digest()
  const given = b64urlDecode(sig)
  if (!given || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  if (typeof payload.iat !== 'number') return { ok: false, reason: 'invalid_signature' }
  const age = args.nowSeconds - payload.iat
  if (age > MAX_JWT_AGE_SECONDS || age < -MAX_FUTURE_SKEW_SECONDS) return { ok: false, reason: 'expired' }
  if (args.apiKey && payload.api_key !== args.apiKey) return { ok: false, reason: 'invalid_signature' }

  if (typeof payload.payload_hash !== 'string') return { ok: false, reason: 'payload_mismatch' }
  const bodyHash = sha256Hex(args.rawBody)
  const claimed = payload.payload_hash.toLowerCase()
  if (claimed.length !== bodyHash.length || !timingSafeEqual(Buffer.from(claimed), Buffer.from(bodyHash))) {
    return { ok: false, reason: 'payload_mismatch' }
  }
  return { ok: true }
}

// ─── applying a keyword ─────────────────────────────────────────────

type GrantRow = { id: string; org_id: string | null; user_id: string | null; metadata: unknown; created_at: string | null }

export interface KeywordOutcome {
  /** Residents (org × user) whose consent rows name this number. */
  matched: number
  /** Of those, how many had their sms_opt_in changed by this message. */
  changed: number
}

/** Every consent grant, in any org, that names this number. Oldest first. */
async function grantsForNumber(db: Db, phoneHash: string, ctx: { messageId: string }): Promise<GrantRow[]> {
  const { data, error } = await db
    .from('audit_log')
    .select('id, org_id, user_id, metadata, created_at')
    .eq('action', SMS_CONSENT_GRANTED)
    .eq('entity_type', SMS_CONSENT_ENTITY)
    .contains('metadata', { phone_sha256: [phoneHash] })
    .order('created_at')
    .order('id')
    .limit(500)
  checkWrite({ error }, 'webhooks.vonage_inbound.grant_lookup', ctx)
  return ((data ?? []) as GrantRow[]).filter((r) => r.org_id && r.user_id)
}

/** One entry per (org, user), keeping the latest grant naming the number. */
function residentsOf(grants: GrantRow[]): Map<string, GrantRow> {
  const out = new Map<string, GrantRow>()
  for (const g of grants) out.set(`${g.org_id}:${g.user_id}`, g)
  return out
}

async function auditExists(
  db: Db,
  orgId: string,
  userId: string,
  action: string,
  messageId: string,
  ctx: Record<string, string>,
): Promise<boolean> {
  const { data, error } = await db
    .from('audit_log')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('action', action)
    .contains('metadata', { message_id: messageId })
    .limit(1)
  checkWrite({ error }, 'webhooks.vonage_inbound.audit_dedupe', ctx)
  return ((data ?? []) as unknown[]).length > 0
}

/**
 * L-2: the resident's newest consent event in this org (grant or revoke),
 * or null. Ties on created_at break by id, like the ledger fold.
 */
async function latestConsentEvent(
  db: Db,
  orgId: string,
  userId: string,
  ctx: Record<string, string>,
): Promise<{ action: string; metadata: unknown; created_at: string | null } | null> {
  const { data, error } = await db
    .from('audit_log')
    .select('id, action, metadata, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('entity_type', SMS_CONSENT_ENTITY)
    .in('action', [SMS_CONSENT_GRANTED, SMS_CONSENT_REVOKED])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  checkWrite({ error }, 'webhooks.vonage_inbound.start_latest', ctx)
  return ((data ?? []) as Array<{ action: string; metadata: unknown; created_at: string | null }>)[0] ?? null
}

/**
 * L-2: a revoke the resident made themselves in the portal, after the
 * grant START would restore, is their latest word: a text from the number
 * can't override it (a START from a phone they no longer control, or one
 * they later turned off on purpose). Only a fresh portal opt-in re-enables.
 */
export function isNewerPortalRevoke(
  latest: { action: string; metadata: unknown; created_at: string | null } | null,
  grantCreatedAt: string | null,
): boolean {
  if (!latest || latest.action !== SMS_CONSENT_REVOKED) return false
  if ((latest.metadata as { method?: unknown } | null)?.method !== 'portal') return false
  if (!latest.created_at || !grantCreatedAt) return true // can't order them: keep texts off
  return Date.parse(latest.created_at) > Date.parse(grantCreatedAt)
}

/**
 * STOP: texts off for every resident whose consent names this number.
 * The opt-out is written first — stopping must never wait on evidence —
 * then a `sms_consent_revoked` row (which also empties the ledger, so the
 * number needs a fresh agreement or START before it is texted again).
 */
export async function applyStop(
  db: Db,
  args: { fromRaw: string; messageId: string; keyword: string; now: Date },
): Promise<KeywordOutcome> {
  const hash = phoneConsentHash(args.fromRaw)
  if (!hash) return { matched: 0, changed: 0 }
  const base = { messageId: args.messageId }
  const residents = residentsOf(await grantsForNumber(db, hash, base))
  const at = args.now.toISOString()
  let changed = 0
  for (const g of residents.values()) {
    const orgId = g.org_id!
    const userId = g.user_id!
    const ctx = { ...base, orgId, userId }
    const { data, error } = await db
      .from('resident_communication_preferences')
      .update({ sms_opt_in: false, updated_at: at })
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .eq('sms_opt_in', true)
      .select('id')
    checkWrite({ error }, 'webhooks.vonage_inbound.stop_update', ctx)
    const rows = (data ?? []) as Array<{ id: string }>
    if (rows.length > 0) changed += 1

    if (await auditExists(db, orgId, userId, SMS_CONSENT_REVOKED, args.messageId, ctx)) continue
    const { error: auditError } = await db.from('audit_log').insert({
      action: SMS_CONSENT_REVOKED,
      org_id: orgId,
      user_id: userId,
      entity_type: SMS_CONSENT_ENTITY,
      entity_id: rows[0]?.id ?? null,
      metadata: { method: 'sms_keyword', keyword: args.keyword, message_id: args.messageId, revoked_at: at },
    })
    checkWrite({ error: auditError }, 'webhooks.vonage_inbound.stop_audit', ctx)
  }
  return { matched: residents.size, changed }
}

/**
 * START: texts back on, but only for a resident with a prior consent row
 * naming this number — START never creates consent from nothing. The
 * evidence row is written first (no text without a consent record): a new
 * `sms_consent_granted` carrying the prior grant's disclosure, the
 * resident's currently covered numbers plus this one, and a pointer to the
 * grant it restores. Then sms_opt_in is set. A resident with no preference
 * row in that org is left alone, and so is one whose latest consent event
 * is a portal revoke newer than that grant (L-2).
 */
export async function applyStart(
  db: Db,
  args: { fromRaw: string; messageId: string; keyword: string; now: Date },
): Promise<KeywordOutcome> {
  const hash = phoneConsentHash(args.fromRaw)
  if (!hash) return { matched: 0, changed: 0 }
  const base = { messageId: args.messageId }
  const residents = residentsOf(await grantsForNumber(db, hash, base))
  const at = args.now.toISOString()
  let changed = 0
  for (const g of residents.values()) {
    const orgId = g.org_id!
    const userId = g.user_id!
    const ctx = { ...base, orgId, userId }

    const { data: prefRow, error: prefError } = await db
      .from('resident_communication_preferences')
      .select('id, sms_opt_in')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
    checkWrite({ error: prefError }, 'webhooks.vonage_inbound.start_read', ctx)
    const pref = prefRow as { id: string; sms_opt_in: boolean } | null
    if (!pref) continue

    // L-2: a later portal revoke wins over an inbound START.
    if (isNewerPortalRevoke(await latestConsentEvent(db, orgId, userId, ctx), g.created_at)) continue

    if (!(await auditExists(db, orgId, userId, SMS_CONSENT_GRANTED, args.messageId, ctx))) {
      const current = await loadUserSmsConsent(db, orgId, userId)
      if (!current.ok) checkWrite({ error: { code: 'consent_read' } }, 'webhooks.vonage_inbound.start_ledger', ctx)
      const covered = new Set(current.ok ? current.phones : [])
      covered.add(hash)
      const prior = (g.metadata ?? {}) as { disclosure_version?: unknown; disclosure_sha256?: unknown }
      const { error: auditError } = await db.from('audit_log').insert({
        action: SMS_CONSENT_GRANTED,
        org_id: orgId,
        user_id: userId,
        entity_type: SMS_CONSENT_ENTITY,
        entity_id: pref.id,
        metadata: {
          disclosure_version: typeof prior.disclosure_version === 'string' ? prior.disclosure_version : null,
          disclosure_sha256: typeof prior.disclosure_sha256 === 'string' ? prior.disclosure_sha256 : null,
          phone_sha256: [...covered].sort(),
          method: 'sms_keyword',
          keyword: args.keyword,
          message_id: args.messageId,
          restores_grant_id: g.id,
          consented_at: at,
        },
      })
      checkWrite({ error: auditError }, 'webhooks.vonage_inbound.start_audit', ctx)
    }

    if (pref.sms_opt_in === true) continue
    const { error } = await db
      .from('resident_communication_preferences')
      .update({ sms_opt_in: true, updated_at: at })
      .eq('id', pref.id)
      .eq('organization_id', orgId)
      .eq('user_id', userId)
    checkWrite({ error }, 'webhooks.vonage_inbound.start_update', ctx)
    changed += 1
  }
  return { matched: residents.size, changed }
}
