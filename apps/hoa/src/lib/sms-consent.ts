/**
 * BL-110: a resident's own agreement to receive text messages.
 *
 * Texts reach a resident only when resident_communication_preferences
 * .sms_opt_in is true (./communications/preferences.ts). Until BL-110
 * nothing wrote that column, so no resident could ever be texted. This
 * module is the one writer, and it only ever acts for the signed-in
 * resident themselves — a board member can never turn texts on for
 * someone else (the action takes no user id; see ./sms-consent-actions.ts).
 *
 * Consent follows US texting expectations (TCPA / CTIA): an unchecked box
 * the resident ticks, a disclosure naming the association and the program,
 * "message frequency varies", "Msg & data rates may apply", STOP / HELP,
 * and a link to the privacy policy. The exact disclosure text is versioned
 * and hashed; the grant writes an audit_log row holding the version, the
 * SHA-256 of the text the resident saw, SHA-256s of the numbers shown, and
 * the time. Opting out is one click, applies at once, and is never blocked
 * by the audit write.
 *
 * No Next imports (testable with fakes). Nothing here logs row values;
 * console lines carry ids and error codes only.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
// Runtime-only use inside loadTextMessagesState; the ledger imports this
// module's constants, so neither touches the other at load time.
import { consentGap, loadUserSmsConsent, type ConsentGap } from './sms-consent-ledger'

type Client = SupabaseClient<Database>

/** Bump whenever SMS_DISCLOSURE's wording changes. */
export const SMS_DISCLOSURE_VERSION = '2026-10-20.1'

export const PRIVACY_POLICY_URL = 'https://www.homeownerledger.com/privacy#text-messages'

export const SMS_CONSENT_GRANTED = 'sms_consent_granted'
export const SMS_CONSENT_REVOKED = 'sms_consent_revoked'

/**
 * The words the resident agrees to. Pure and deterministic, so the server
 * can rebuild exactly what the page showed and hash it.
 */
export function smsDisclosure(orgName: string): string {
  const name = orgName.trim() || 'your association'
  return [
    `By checking this box, I agree to receive text messages from ${name}, sent through HomeownerHub, at the mobile number shown above.`,
    'Texts cover association business: urgent notices, reminders about dues and meetings, and announcements from the board.',
    'Message frequency varies. Msg & data rates may apply.',
    'Reply STOP to stop at any time, or HELP for help. You can also turn texts off on this page.',
    'Agreeing is not a condition of anything else.',
    `Privacy policy: ${PRIVACY_POLICY_URL}`,
  ].join(' ')
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function disclosureHash(orgName: string): string {
  return sha256Hex(smsDisclosure(orgName))
}

/** US numbers to E.164 (+1XXXXXXXXXX); anything else is not textable. */
export function normalizeUsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** (404) 555-1234 for display. */
export function formatUsPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(-10)
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** One stable fingerprint of the set of numbers shown (order-free). */
export function phonesFingerprint(phones: readonly string[]): string {
  return sha256Hex([...new Set(phones)].sort().join(','))
}

export interface SmsPreference {
  optIn: boolean
  /** The row's updated_at — when the choice was last changed. */
  updatedAt: string | null
  /** A row exists but belongs to another community (one row per user). */
  otherOrg: boolean
}

/** The signed-in resident's own row (RLS: own row or board). */
export async function loadMySmsPreference(
  client: Client,
  orgId: string,
  userId: string,
): Promise<{ ok: true; pref: SmsPreference } | { ok: false }> {
  const { data, error } = await client
    .from('resident_communication_preferences')
    .select('organization_id, sms_opt_in, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { ok: false }
  const row = data as { organization_id: string; sms_opt_in: boolean; updated_at: string } | null
  if (!row) return { ok: true, pref: { optIn: false, updatedAt: null, otherOrg: false } }
  if (row.organization_id !== orgId) return { ok: true, pref: { optIn: false, updatedAt: null, otherOrg: true } }
  return { ok: true, pref: { optIn: row.sms_opt_in === true, updatedAt: row.updated_at, otherOrg: false } }
}

/**
 * The numbers a text to this resident would go to: the phone on their
 * current ownership(s) and active tenancy(ies) in this org — the same
 * rows the send path reads. Normalised, de-duplicated, sorted.
 */
export async function loadMyTextPhones(
  client: Client,
  orgId: string,
  userId: string,
): Promise<{ ok: true; phones: string[] } | { ok: false }> {
  const [own, ten] = await Promise.all([
    client
      .from('ownerships')
      .select('owner_phone')
      .eq('organization_id', orgId)
      .eq('owner_user_id', userId)
      .is('valid_to', null),
    client
      .from('tenancies')
      .select('tenant_phone')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', userId)
      .eq('status', 'active'),
  ])
  if (own.error || ten.error) return { ok: false }
  const raw = [
    ...((own.data ?? []) as Array<{ owner_phone: string | null }>).map((r) => r.owner_phone),
    ...((ten.data ?? []) as Array<{ tenant_phone: string | null }>).map((r) => r.tenant_phone),
  ]
  const phones = [...new Set(raw.map(normalizeUsPhone).filter((p): p is string => p !== null))].sort()
  return { ok: true, phones }
}

/** What the account page's Text messages panel renders. */
export interface TextMessagesState {
  optIn: boolean
  /** When the current choice was made (ISO), if ever. */
  since: string | null
  /** Display-formatted numbers texts go to. */
  phones: string[]
  disclosure: string
  disclosureVersion: string
  disclosureSha256: string
  phonesFingerprint: string
  privacyUrl: string
  otherOrg: boolean
  /**
   * BL-111: texts are on but some number they would go to is not covered
   * by the resident's latest agreement — 'number_changed' (the number
   * changed since they agreed) or 'no_record' (texts were on before
   * BL-110 recorded agreements). Those numbers are not texted until the
   * resident agrees again. 'none' when texts are off or fully covered.
   */
  consentGap: ConsentGap | 'unknown'
}

/**
 * Everything the panel needs, read for one resident. `client` is the
 * resident's RLS-bound client, or the confined service-role client while
 * an admin views as them (every read here filters on user and org).
 */
export async function loadTextMessagesState(
  client: Client,
  org: { id: string; name: string },
  userId: string,
  /**
   * Reads this resident's consent rows in audit_log, which a resident's
   * own client cannot (0063: board/admin only) — the service-role client,
   * filtered here on org and user. Omitted: consentGap is 'unknown'.
   */
  consentReader?: Client,
): Promise<TextMessagesState | 'failed'> {
  const [pref, phones] = await Promise.all([
    loadMySmsPreference(client, org.id, userId),
    loadMyTextPhones(client, org.id, userId),
  ])
  if (!pref.ok || !phones.ok) return 'failed'
  let gap: ConsentGap | 'unknown' = 'unknown'
  if (!pref.pref.optIn || phones.phones.length === 0) gap = 'none'
  else if (consentReader) {
    const consent = await loadUserSmsConsent(consentReader, org.id, userId)
    if (consent.ok) gap = consentGap(phones.phones, consent.phones)
  }
  const disclosure = smsDisclosure(org.name)
  return {
    optIn: pref.pref.optIn,
    since: pref.pref.updatedAt,
    phones: phones.phones.map(formatUsPhone),
    disclosure,
    disclosureVersion: SMS_DISCLOSURE_VERSION,
    disclosureSha256: sha256Hex(disclosure),
    phonesFingerprint: phonesFingerprint(phones.phones),
    privacyUrl: PRIVACY_POLICY_URL,
    otherOrg: pref.pref.otherOrg,
    consentGap: gap,
  }
}

export type SmsConsentAuditMetadata = {
  disclosure_version: string
  disclosure_sha256: string
  /** SHA-256 of each E.164 number shown — never the number itself. */
  phone_sha256: string[]
  method: 'portal'
  consented_at: string
}

export function smsConsentAuditRow(args: {
  action: typeof SMS_CONSENT_GRANTED | typeof SMS_CONSENT_REVOKED
  orgId: string
  userId: string
  prefRowId: string | null
  metadata: SmsConsentAuditMetadata | { method: 'portal'; revoked_at: string }
}) {
  return {
    action: args.action,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: 'resident_communication_preferences',
    entity_id: args.prefRowId,
    metadata: args.metadata,
  }
}

export type SetSmsResult =
  | { ok: true }
  | { ok: false; error: 'read_failed' | 'write_failed' | 'audit_failed' | 'other_org' }

/**
 * Write the resident's own sms_opt_in.
 *
 * `own`  — the resident's RLS-bound client (the preference row is theirs).
 * `audit` — service role, only for the audit_log insert (its RLS lets
 *           board/admin insert, never a resident).
 *
 * Grant: flip the row, then record the evidence; if the evidence can't be
 * recorded, flip it back and fail — no text without a consent record.
 * Revoke: flip the row and stop; the audit row is best effort, so a
 * failing audit write can never keep someone subscribed.
 */
export async function setSmsOptIn(
  own: Client,
  audit: Client,
  args: {
    orgId: string
    userId: string
    optIn: boolean
    now: Date
    /** Required when optIn: the evidence for the grant. */
    evidence?: { disclosureVersion: string; disclosureSha256: string; phones: readonly string[] }
  },
): Promise<SetSmsResult> {
  const at = args.now.toISOString()
  const existing = await own
    .from('resident_communication_preferences')
    .select('id, organization_id')
    .eq('user_id', args.userId)
    .maybeSingle()
  if (existing.error) return { ok: false, error: 'read_failed' }
  const row = existing.data as { id: string; organization_id: string } | null
  // One row per user (0018's unique index). Turning texts ON never moves
  // a row kept for another community; turning them OFF clears it wherever
  // it is — stopping is always safe.
  if (row && args.optIn && row.organization_id !== args.orgId) return { ok: false, error: 'other_org' }

  let rowId: string | null = row?.id ?? null
  if (row) {
    const { error } = await own
      .from('resident_communication_preferences')
      .update({ sms_opt_in: args.optIn, updated_at: at })
      .eq('id', row.id)
      .eq('user_id', args.userId)
    if (error) return { ok: false, error: 'write_failed' }
  } else {
    const { data, error } = await own
      .from('resident_communication_preferences')
      .insert({ organization_id: args.orgId, user_id: args.userId, sms_opt_in: args.optIn, updated_at: at })
      .select('id')
      .single()
    if (error) return { ok: false, error: 'write_failed' }
    rowId = (data as { id: string } | null)?.id ?? null
  }

  if (!args.optIn) {
    const { error } = await audit.from('audit_log').insert(
      smsConsentAuditRow({
        action: SMS_CONSENT_REVOKED,
        orgId: row?.organization_id ?? args.orgId,
        userId: args.userId,
        prefRowId: rowId,
        metadata: { method: 'portal', revoked_at: at },
      }),
    )
    if (error) {
      console.error('[sms-consent] revoke audit insert failed', { orgId: args.orgId, userId: args.userId, code: error.code ?? null })
    }
    return { ok: true }
  }

  const ev = args.evidence
  const { error } = ev
    ? await audit.from('audit_log').insert(
        smsConsentAuditRow({
          action: SMS_CONSENT_GRANTED,
          orgId: args.orgId,
          userId: args.userId,
          prefRowId: rowId,
          metadata: {
            disclosure_version: ev.disclosureVersion,
            disclosure_sha256: ev.disclosureSha256,
            phone_sha256: [...ev.phones].map(sha256Hex),
            method: 'portal',
            consented_at: at,
          },
        }),
      )
    : { error: { code: 'no_evidence' } }
  if (error) {
    console.error('[sms-consent] grant audit insert failed', { orgId: args.orgId, userId: args.userId, code: error.code ?? null })
    // No evidence, no texts: undo the grant.
    const undo = await own
      .from('resident_communication_preferences')
      .update({ sms_opt_in: false, updated_at: at })
      .eq('user_id', args.userId)
    if (undo.error) {
      console.error('[sms-consent] grant rollback failed', { orgId: args.orgId, userId: args.userId, code: undo.error.code ?? null })
    }
    return { ok: false, error: 'audit_failed' }
  }
  return { ok: true }
}
