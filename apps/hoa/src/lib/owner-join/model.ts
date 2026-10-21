/**
 * BL-143: accept-to-join and self-claim for unlinked owners (migration 0069
 * part 3; M5_APPLIED).
 *
 * Pure module: no Next, no Supabase, no `@/` imports — client components,
 * unit tests and tests/integration load it directly.
 *
 * An account with no home (an owner already in the HOA whose home was never
 * linked, or an account in no HOA at all, SEC-N4) asks to join a home by its
 * street address + ZIP, or by a one-time code the board issued for it. The
 * database (owner_join_claim) does the matching and answers the same way
 * whether or not an address matched, so the app never learns — and never
 * says — whether an address exists. The board decides in /approvals.
 */

export const JOIN_REQUESTS_TABLE = 'owner_join_requests'
export const JOIN_CODES_TABLE = 'owner_join_codes'

/** Claims per account per rolling 24 hours (owner_join_claim enforces it). */
export const JOIN_DAILY_LIMIT = 5
/** How long a board-issued code works (the table allows at most 90 days). */
export const JOIN_CODE_DAYS = 30
/** Letters and digits with no look-alikes (no 0/O, 1/I): 32 symbols, 5 bits each. */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
/** 10 symbols = 50 bits; with 5 tries a day, guessing is hopeless. */
export const JOIN_CODE_LENGTH = 10

export const JOIN_NOT_LIVE =
  'Asking to join isn’t switched on yet. Ask your board to invite you, or to link your account to your home.'

// ─── normalisation (mirrors 0069's owner_join_norm_* functions) ────────

const STREET_WORDS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  boulevard: 'blvd',
  circle: 'cir',
  place: 'pl',
  terrace: 'ter',
  parkway: 'pkwy',
  highway: 'hwy',
  trail: 'trl',
  cove: 'cv',
  square: 'sq',
  point: 'pt',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
}

/** "12 Oak Street." → "12 oak st". Same rule as owner_join_norm_address. */
export function normaliseAddress(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '')
    .map((w) => STREET_WORDS[w] ?? w)
    .join(' ')
}

/** "Apt #4B" → "4b". Same rule as owner_join_norm_unit. */
export function normaliseUnit(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/\b(apartment|apt|unit|suite|ste|number|no)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** "30301-1234" → "30301". Same rule as owner_join_norm_zip. */
export function normaliseZip(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^0-9]/g, '').slice(0, 5)
}

/** "abcde-fghjk" → "ABCDEFGHJK". Same rule as owner_join_claim's p_code. */
export function normaliseCode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** A code from random bytes (one byte per symbol), shown as "ABCDE-FGHJK". */
export function formatJoinCode(bytes: ArrayLike<number>): string {
  if (bytes.length < JOIN_CODE_LENGTH) throw new Error('formatJoinCode: not enough random bytes')
  let out = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length]
  return `${out.slice(0, 5)}-${out.slice(5)}`
}

// ─── the claim form ──────────────────────────────────────────────────

export interface ClaimInput {
  method: 'address' | 'code'
  address?: string
  postalCode?: string
  unit?: string
  code?: string
}

export type Claim =
  | { kind: 'address'; address: string; postalCode: string; unit: string }
  | { kind: 'code'; code: string }

export type ClaimParse = { ok: true; claim: Claim } | { ok: false; fieldErrors: Record<string, string> }

/** What owner_join_claim would accept; the database checks it again. */
export function parseClaim(input: ClaimInput | null | undefined): ClaimParse {
  if (!input || (input.method !== 'address' && input.method !== 'code')) {
    return { ok: false, fieldErrors: { method: 'Choose how you want to ask.' } }
  }
  if (input.method === 'code') {
    const code = normaliseCode(input.code)
    if (code.length !== JOIN_CODE_LENGTH) {
      return { ok: false, fieldErrors: { code: 'Enter the 10-character code from your board, like ABCDE-FGHJK.' } }
    }
    return { ok: true, claim: { kind: 'code', code } }
  }
  const fieldErrors: Record<string, string> = {}
  const address = (input.address ?? '').trim()
  const unit = (input.unit ?? '').trim()
  if (normaliseAddress(address) === '') fieldErrors.address = 'Enter your street address, like 12 Oak Street.'
  else if (address.length > 200) fieldErrors.address = 'That address is too long.'
  if (normaliseZip(input.postalCode).length !== 5) fieldErrors.postalCode = 'Enter your 5-digit ZIP code.'
  if (unit.length > 40) fieldErrors.unit = 'That unit is too long.'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, claim: { kind: 'address', address, postalCode: normaliseZip(input.postalCode), unit } }
}

// ─── what the database answered ──────────────────────────────────────

export type ClaimOutcome = 'sent' | 'invalid_code' | 'invalid' | 'rate_limited'

export function readClaimOutcome(v: unknown): ClaimOutcome | null {
  return v === 'sent' || v === 'invalid_code' || v === 'invalid' || v === 'rate_limited' ? v : null
}

/**
 * The one message for a sent claim. Deliberately the same whether or not
 * the address matched a home: it never says the address was found.
 */
export const CLAIM_SENT =
  'Thanks — if that matches a home your association manages here, the board will review your request. You’ll see your home here once they approve it. Nothing else is shared with anyone.'

export const CLAIM_MESSAGES: Record<Exclude<ClaimOutcome, 'sent'>, string> = {
  invalid_code: 'That code didn’t work. It may have expired or been used already. Check it, or ask your board for a new one.',
  invalid: 'Check the details and try again.',
  rate_limited: `You can ask ${JOIN_DAILY_LIMIT} times a day. Try again tomorrow, or ask your board for a join code.`,
}

export interface JoinStatus {
  attemptsToday: number
  dailyLimit: number
  lastAttemptAt: string | null
}

export function readJoinStatus(v: unknown): JoinStatus | null {
  const row = Array.isArray(v) ? v[0] : v
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const attempts = Number(r.attempts_today)
  const limit = Number(r.daily_limit)
  if (!Number.isFinite(attempts) || !Number.isFinite(limit)) return null
  return {
    attemptsToday: attempts,
    dailyLimit: limit,
    lastAttemptAt: typeof r.last_attempt_at === 'string' ? r.last_attempt_at : null,
  }
}

// ─── the board's side (/approvals) ───────────────────────────────────

export type JoinDecideOutcome = 'approved' | 'rejected' | 'already_decided'

export function readDecideOutcome(v: unknown): JoinDecideOutcome | null {
  return v === 'approved' || v === 'rejected' || v === 'already_decided' ? v : null
}

export const JOIN_REQUEST_COLUMNS = 'id, unit_id, requester_name, requester_email, method, created_at'

export interface JoinRequestRow {
  id: string
  unit_id: string
  requester_name: string | null
  requester_email: string | null
  method: string
  created_at: string
}

export interface JoinUnitRow {
  id: string
  address_line1: string | null
  unit_number: string | null
  city: string | null
}

export interface JoinOwnershipRow {
  unit_id: string
  owner_email: string | null
  owner_user_id: string | null
}

/** "12 Oak St, Unit 4B, Atlanta"; null when the home isn't known. */
export function homeLabel(u: JoinUnitRow | undefined): string | null {
  if (!u || !u.address_line1) return null
  return [u.address_line1, u.unit_number ? `Unit ${u.unit_number}` : null, u.city].filter(Boolean).join(', ')
}

/**
 * Does the asker's sign-in email match an owner on file for the home?
 * 'match' — an open ownership on the home has that email;
 * 'other' — the home has owners on file, none with that email;
 * 'none'  — no owner on file at all.
 */
export type OwnerEmailCheck = 'match' | 'other' | 'none'

export function ownerEmailCheck(email: string | null, owners: readonly JoinOwnershipRow[]): OwnerEmailCheck {
  if (owners.length === 0) return 'none'
  const e = (email ?? '').trim().toLowerCase()
  if (e && owners.some((o) => (o.owner_email ?? '').trim().toLowerCase() === e)) return 'match'
  return 'other'
}

export const OWNER_EMAIL_NOTE: Record<OwnerEmailCheck, string> = {
  match: 'Their sign-in email matches the owner email on file for this home.',
  other: 'Their sign-in email is not the owner email on file for this home. Check with the owner before approving.',
  none: 'No owner is on file for this home yet. Check your records before approving.',
}

export interface JoinCard {
  requestId: string
  home: string | null
  who: string
  method: 'address' | 'code'
  emailCheck: OwnerEmailCheck
}

export function joinCard(
  r: JoinRequestRow,
  unit: JoinUnitRow | undefined,
  owners: readonly JoinOwnershipRow[],
): JoinCard {
  const name = (r.requester_name ?? '').trim()
  const email = (r.requester_email ?? '').trim()
  return {
    requestId: r.id,
    home: homeLabel(unit),
    who: name && email ? `${name} (${email})` : name || email || 'An account with no name or email',
    method: r.method === 'code' ? 'code' : 'address',
    emailCheck: ownerEmailCheck(r.requester_email, owners.filter((o) => o.unit_id === r.unit_id)),
  }
}

export const JOIN_METHOD_LABEL: Record<JoinCard['method'], string> = {
  address: 'Asked by address',
  code: 'Used a join code from the board',
}
