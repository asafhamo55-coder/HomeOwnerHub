/**
 * BL-139 — Florida director certification tracker (no migration).
 *
 * THE RULE. Fla. Stat. § 720.3033(1), as held in
 * scripts/fixtures/state-law/flsenate-ch720-2026.html:
 *  - (1)(a): "Within 90 days after being elected or appointed to the board,
 *    each director must submit a certificate of having satisfactorily
 *    completed the educational curriculum administered by a
 *    department-approved education provider."
 *  - (1)(a)2: "The certificate of completion is valid for up to 4 years."
 *    (1)(a)3: the new-director education must be completed "at least every
 *    4 years".
 *  - (1)(a)5: continuing education every year on top of that — at least 4
 *    hours (fewer than 2,500 parcels) or 8 hours (2,500 parcels or more).
 *  - (1)(b): "A director who does not timely file the educational
 *    certificate is suspended from the board until he or she complies with
 *    the requirement. The board may temporarily fill the vacancy during the
 *    period of suspension."
 *  - (1)(c): "The association shall retain each director's educational
 *    certificate for inspection by the members for 5 years after the
 *    director's election. However, the failure to have the written
 *    certification or educational certificate on file does not affect the
 *    validity of any board action."
 * The current text has no written-affidavit alternative in (1)(a): only the
 * educational certificate satisfies it. "Written certification" survives
 * only in (1)(c)'s validity clause, so this tracker records the
 * certificate's completion date and nothing else counts.
 *
 * Florida associations only (by governing-law state, else address state,
 * the same rule as the BL-131 deadlines). Any other state: nothing.
 *
 * STORAGE. No migration: associations.compliance_settings[DIRECTOR_CERTS_KEY]
 * is a map keyed by the director's user id (org_members.user_id). Each value
 * is HMAC-signed with the server-only secret (same chain and same reason as
 * ./deadlines.ts): any org member could PATCH compliance_settings before
 * 0063, so a value whose signature doesn't verify reads as "not recorded".
 * Every write keeps the other keys and the other directors.
 *
 * Which association: an org's tracker lives on its first Florida
 * association by name (`directorCertAssociation`). Every reader and the
 * write action pick it the same way.
 *
 * Pure and dependency-free (node:crypto and ./deadlines only): packages/jobs
 * imports this file by relative path, so no `@/` alias.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { complianceState, daysUntil, formatDueOn } from './deadlines'

export const DIRECTOR_CERTS_KEY = 'director_certifications'
const SIGNATURE_DOMAIN = 'director-cert:v1'

/** § 720.3033(1)(a): certificate due within this many days of election or appointment. */
export const DIRECTOR_CERT_DAYS = 90
/** § 720.3033(1)(a)2–3: the certificate is valid for up to 4 years. */
export const DIRECTOR_CERT_VALID_YEARS = 4
/** § 720.3033(1)(c): keep the certificate 5 years after the director's election. */
export const DIRECTOR_CERT_RETAIN_YEARS = 5
/** Card and digest show a director from this many days out, and once overdue. */
export const DIRECTOR_CERT_ALERT_DAYS = 30

export const DIRECTOR_CERT_CITATION = 'Fla. Stat. § 720.3033(1)'
export const DIRECTOR_CERT_FIXTURE = 'scripts/fixtures/state-law/flsenate-ch720-2026.html'
/** The statute on the Florida Senate site (the fixture's source, chapter 720 as of 2026). */
export const DIRECTOR_CERT_OFFICIAL_URL = 'https://www.flsenate.gov/Laws/Statutes/2026/720.3033'
export const DIRECTOR_CERT_OFFICIAL_LABEL = 'Fla. Stat. § 720.3033 (Florida Senate)'

// ─── Day math ───────────────────────────────────────────────────────

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = YMD.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function ymdOf(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return ymdOf(new Date(Date.UTC(y!, m! - 1, d! + n)))
}

/** Same month and day `n` years on; Feb 29 falls back to Feb 28. */
export function addYears(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y! + n, m! - 1, d!))
  if (dt.getUTCMonth() !== m! - 1) return ymdOf(new Date(Date.UTC(y! + n, m!, 0)))
  return ymdOf(dt)
}

/** § 720.3033(1)(a): the last day to submit the certificate — 90 days after election. */
export function certificateDueOn(electedOn: string): string {
  return addDays(electedOn, DIRECTOR_CERT_DAYS)
}

/** § 720.3033(1)(a)2–3: when a certificate stops being valid. */
export function certificateRenewBy(certifiedOn: string): string {
  return addYears(certifiedOn, DIRECTOR_CERT_VALID_YEARS)
}

/** § 720.3033(1)(c): keep the certificate on file until at least this date. */
export function certificateRetainUntil(electedOn: string): string {
  return addYears(electedOn, DIRECTOR_CERT_RETAIN_YEARS)
}

// ─── Records: sign / read / merge ───────────────────────────────────

export interface DirectorCert {
  /** YYYY-MM-DD the director was elected or appointed. */
  electedOn: string
  /** YYYY-MM-DD on the education certificate, or null if none yet. */
  certifiedOn: string | null
  /** Where the certificate is filed: an https link or an in-app /documents path. */
  documentUrl: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface StoredDirectorCert {
  elected_on: string
  certified_on: string | null
  document_url: string | null
  updated_at: string
  updated_by: string | null
  sig: string
}

/** An https URL or an in-app /documents path, at most 500 characters. Anything else is refused. */
export function isAllowedDocumentUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 500 || /\s/.test(v)) return false
  if (v.startsWith('/documents')) return !v.startsWith('//')
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

function payload(associationId: string, userId: string, c: DirectorCert): string {
  return JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    userId,
    c.electedOn,
    c.certifiedOn,
    c.documentUrl,
    c.updatedAt,
    c.updatedBy,
  ])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signDirectorCert(
  associationId: string,
  userId: string,
  cert: DirectorCert,
  secret: string,
): StoredDirectorCert {
  if (!isYmd(cert.electedOn)) throw new RangeError('electedOn must be YYYY-MM-DD')
  if (cert.certifiedOn !== null && !isYmd(cert.certifiedOn)) throw new RangeError('certifiedOn must be YYYY-MM-DD')
  if (cert.documentUrl !== null && !isAllowedDocumentUrl(cert.documentUrl)) throw new RangeError('documentUrl not allowed')
  return {
    elected_on: cert.electedOn,
    certified_on: cert.certifiedOn,
    document_url: cert.documentUrl,
    updated_at: cert.updatedAt,
    updated_by: cert.updatedBy,
    sig: hmac(secret, payload(associationId, userId, cert)),
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

/**
 * The verified records for one association, by user id. A value that is
 * malformed or whose signature doesn't verify is left out: that director
 * reads as "not recorded".
 */
export function readDirectorCerts(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): Map<string, DirectorCert> {
  const out = new Map<string, DirectorCert>()
  const all = asObject(asObject(complianceSettings)?.[DIRECTOR_CERTS_KEY])
  if (!all || !secret) return out
  for (const [userId, raw] of Object.entries(all)) {
    const v = asObject(raw)
    if (!v) continue
    if (
      !isYmd(v.elected_on) ||
      !(v.certified_on === null || isYmd(v.certified_on)) ||
      !(v.document_url === null || isAllowedDocumentUrl(v.document_url)) ||
      typeof v.updated_at !== 'string' ||
      !nullableString(v.updated_by) ||
      typeof v.sig !== 'string'
    ) {
      continue
    }
    const cert: DirectorCert = {
      electedOn: v.elected_on,
      certifiedOn: v.certified_on as string | null,
      documentUrl: v.document_url as string | null,
      updatedAt: v.updated_at,
      updatedBy: v.updated_by,
    }
    const expected = Buffer.from(hmac(secret, payload(associationId, userId, cert)), 'hex')
    const actual = Buffer.from(v.sig, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) continue
    out.set(userId, cert)
  }
  return out
}

/** compliance_settings with this director's record set; every other key and director kept. */
export function withDirectorCert(
  complianceSettings: unknown,
  userId: string,
  stored: StoredDirectorCert,
): Record<string, unknown> {
  const settings = asObject(complianceSettings) ?? {}
  const certs = asObject(settings[DIRECTOR_CERTS_KEY]) ?? {}
  return { ...settings, [DIRECTOR_CERTS_KEY]: { ...certs, [userId]: stored } }
}

// ─── Which association ──────────────────────────────────────────────

export interface DirectorCertAssociationInput {
  id: string
  name: string
  state: string | null
  governingLawState: string | null
  complianceSettings: unknown
}

/** The org's first Florida association by name, or null (no tracker: nothing is shown). */
export function directorCertAssociation<T extends DirectorCertAssociationInput>(associations: readonly T[]): T | null {
  const fl = associations.filter((a) => complianceState(a.governingLawState, a.state) === 'FL')
  if (fl.length === 0) return null
  return [...fl].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0]!
}

// ─── Status ─────────────────────────────────────────────────────────

export type DirectorCertTone =
  | 'not_recorded'
  | 'pending'
  | 'due_soon'
  | 'overdue'
  | 'certified'
  | 'renewal_soon'
  | 'expired'

export interface DirectorCertStatus {
  tone: DirectorCertTone
  /** Days to the deadline that matters now (certificate due, or renewal); negative once past. null when not recorded. */
  daysLeft: number | null
  /** The date that matters now, YYYY-MM-DD, or null. */
  dueOn: string | null
  /** True when it belongs on the dashboard card and in the digest. */
  alert: boolean
  label: string
  /** § 720.3033(1)(c): keep the certificate until this date. null when not recorded. */
  retainUntil: string | null
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`
}

const ALERT_TONES: ReadonlySet<DirectorCertTone> = new Set(['due_soon', 'overdue', 'renewal_soon', 'expired'])

/** Where one director stands on `todayYmd`. */
export function directorCertStatus(cert: DirectorCert | null | undefined, todayYmd: string): DirectorCertStatus {
  if (!cert) {
    return { tone: 'not_recorded', daysLeft: null, dueOn: null, alert: false, label: 'Election date not recorded', retainUntil: null }
  }
  const retainUntil = certificateRetainUntil(cert.electedOn)
  const done = (tone: DirectorCertTone, daysLeft: number, dueOn: string, label: string): DirectorCertStatus => ({
    tone,
    daysLeft,
    dueOn,
    alert: ALERT_TONES.has(tone),
    label,
    retainUntil,
  })
  if (cert.certifiedOn) {
    const renewBy = certificateRenewBy(cert.certifiedOn)
    const left = daysUntil(todayYmd, renewBy)
    if (left < 0) return done('expired', left, renewBy, `Certificate expired ${formatDueOn(renewBy)} — complete the course again`)
    if (left <= DIRECTOR_CERT_ALERT_DAYS) {
      return done('renewal_soon', left, renewBy, left === 0 ? `Certificate expires today (${formatDueOn(renewBy)})` : `Certificate expires in ${days(left)} (${formatDueOn(renewBy)})`)
    }
    return done('certified', left, renewBy, `Certified ${formatDueOn(cert.certifiedOn)} · valid to ${formatDueOn(renewBy)}`)
  }
  const dueOn = certificateDueOn(cert.electedOn)
  const left = daysUntil(todayYmd, dueOn)
  if (left < 0) return done('overdue', left, dueOn, `Certificate overdue since ${formatDueOn(dueOn)} — suspended until filed`)
  const when = left === 0 ? `Certificate due today (${formatDueOn(dueOn)})` : `Certificate due in ${days(left)} (${formatDueOn(dueOn)})`
  return done(left <= DIRECTOR_CERT_ALERT_DAYS ? 'due_soon' : 'pending', left, dueOn, when)
}

// ─── What the board sees ────────────────────────────────────────────

export interface DirectorCertMember {
  userId: string
  /** The board member's own name; the board already sees it on Members. */
  name: string | null
}

export interface DirectorCertRow {
  userId: string
  name: string | null
  cert: DirectorCert | null
  status: DirectorCertStatus
}

/** One row per current board/admin member, in the order given. */
export function directorCertRows(
  members: readonly DirectorCertMember[],
  certs: ReadonlyMap<string, DirectorCert>,
  todayYmd: string,
): DirectorCertRow[] {
  return members.map((m) => {
    const cert = certs.get(m.userId) ?? null
    return { userId: m.userId, name: m.name, cert, status: directorCertStatus(cert, todayYmd) }
  })
}

/** The rows that belong on the dashboard card and in the digest: overdue or expired first, then soonest. */
export function directorCertAlerts(rows: readonly DirectorCertRow[]): DirectorCertRow[] {
  return rows
    .filter((r) => r.status.alert)
    .sort((a, b) => (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0) || a.userId.localeCompare(b.userId))
}

/** One digest line: "Jane Doe: certificate due in 12 days (Nov 2, 2026). Fla. Stat. § 720.3033(1)." */
export function directorCertDigestLine(row: DirectorCertRow): string {
  const who = row.name?.trim() || 'A board member'
  const label = row.status.label.charAt(0).toLowerCase() + row.status.label.slice(1)
  return `${who}: ${label}. ${DIRECTOR_CERT_CITATION}.`
}

/** What is at stake, for the card and the digest. */
export function directorCertConsequence(tone: DirectorCertTone): string {
  if (tone === 'overdue') {
    return 'A director who does not timely file the educational certificate is suspended from the board until he or she complies; the board may temporarily fill the vacancy (§ 720.3033(1)(b)).'
  }
  if (tone === 'expired' || tone === 'renewal_soon') {
    return 'The certificate is valid for up to 4 years, and the new-director education must be completed at least every 4 years (§ 720.3033(1)(a)2–3).'
  }
  return 'Within 90 days after being elected or appointed, each director must submit a certificate of completing the department-approved education; a director who misses it is suspended until he or she complies (§ 720.3033(1)(a), (b)).'
}

/**
 * A row flattened to plain strings for client components (which must not
 * import this module's values: it pulls in node:crypto).
 */
export interface DirectorCertView {
  userId: string
  name: string | null
  tone: DirectorCertTone
  label: string
  electedOn: string | null
  certifiedOn: string | null
  documentUrl: string | null
  /** "Oct 1, 2026", or null. */
  electedLabel: string | null
  /** § 720.3033(1)(c): "Oct 1, 2031", or null. */
  retainLabel: string | null
}

export function directorCertView(row: DirectorCertRow): DirectorCertView {
  return {
    userId: row.userId,
    name: row.name,
    tone: row.status.tone,
    label: row.status.label,
    electedOn: row.cert?.electedOn ?? null,
    certifiedOn: row.cert?.certifiedOn ?? null,
    documentUrl: row.cert?.documentUrl ?? null,
    electedLabel: row.cert ? formatDueOn(row.cert.electedOn) : null,
    retainLabel: row.status.retainUntil ? formatDueOn(row.status.retainUntil) : null,
  }
}
