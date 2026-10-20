// PR-10 — owners and residents update their own contact details from
// /resident/account. Pure module: no Next, no Supabase, no `@/` imports,
// so unit tests and tests/integration load it directly.
//
// WHY A REQUEST, NOT A DIRECT WRITE. property_residents, ownerships,
// tenancies and hoa_properties are board/admin-write only under RLS
// (0041, 0063), and the portal never uses the service role to get round
// that. What a resident CAN write with their own client is a ticket
// (tickets_insert, 0063: submitted_by = them, status open, unit in their
// own units). So a change is sent as a ticket with a fixed subject and a
// readable, re-parseable body; it lands in the board's /approvals as
// "Contact updates", and the board's approval applies it with the
// board's own client (lib/properties/lot.ts applySelfContact).
//
// WHOSE ROWS. A request names no row ids. The rows it changes are the
// ones that are the submitter's on the ticket's home: property_residents
// rows on their sign-in email, ownerships/tenancies linked to their
// account (or unlinked on that email), and the property's owner fields
// when they name that email. Never a row linked to another account.
//
// THE EMAIL HOLD. A resident's portal access can rest on the email on
// file (auth_resident_unit_ids: property_residents.email = sign-in
// email). Changing that email would lock them out, so an email change is
// applied only when their access is ALSO held by a linked ownership or
// lease; otherwise it is held, the board is told why, and the resident
// is told before they ask (`emailLocked`).

export const CONTACT_SUBJECT = 'Contact details update'
export const CONTACT_CATEGORY = 'general'

export type ContactField = 'phone' | 'email' | 'mailing'
export const CONTACT_FIELDS: readonly ContactField[] = ['phone', 'email', 'mailing']

export const FIELD_LABEL: Record<ContactField, string> = {
  phone: 'Phone',
  email: 'Email for notices',
  mailing: 'Mailing address',
}

/** null = none on file (mailing: same as the home). */
export interface ContactValues {
  phone: string | null
  email: string | null
  mailing: string | null
}

export const EMAIL_MAX = 200
export const MAILING_MAX = 300

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// ─── validation ─────────────────────────────────────────────────────

export type PhoneCheck = { ok: true; value: string | null } | { ok: false; error: string }

/** A US number, stored as "(555) 123-4567". Empty = no phone. */
export function normalizePhone(raw: string): PhoneCheck {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (/[a-z]/i.test(t)) return { ok: false, error: 'Enter a 10-digit US phone number, like (555) 123-4567.' }
  let d = digits(t)
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return { ok: false, error: 'Enter a 10-digit US phone number, like (555) 123-4567.' }
  return { ok: true, value: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` }
}

export function normalizeEmail(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = raw.trim().toLowerCase()
  if (!t) return { ok: true, value: null }
  if (t.length > EMAIL_MAX) return { ok: false, error: `Keep the email under ${EMAIL_MAX} characters.` }
  if (!EMAIL.test(t)) return { ok: false, error: 'Enter a valid email, like name@example.com.' }
  return { ok: true, value: t }
}

export function normalizeMailing(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (/[\r\n]/.test(raw.trim())) return { ok: false, error: 'Put the mailing address on one line, with commas.' }
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return { ok: true, value: null }
  if (t.length > MAILING_MAX) return { ok: false, error: `Keep the mailing address under ${MAILING_MAX} characters.` }
  return { ok: true, value: t }
}

export type ContactFormCheck =
  | { ok: true; values: ContactValues }
  | { ok: false; fieldErrors: Partial<Record<ContactField, string>> }

/** The form, checked field by field — the dialog and the server action say the same thing. */
export function checkContactForm(
  raw: { phone?: unknown; email?: unknown; mailing?: unknown },
  opts: { requireEmail?: boolean } = {},
): ContactFormCheck {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const phone = normalizePhone(s(raw.phone))
  const email = normalizeEmail(s(raw.email))
  const mailing = normalizeMailing(s(raw.mailing))
  const fieldErrors: Partial<Record<ContactField, string>> = {}
  if (!phone.ok) fieldErrors.phone = phone.error
  if (!email.ok) fieldErrors.email = email.error
  else if (opts.requireEmail && email.value === null) fieldErrors.email = 'Keep an email on file so the board’s notices reach you.'
  if (!mailing.ok) fieldErrors.mailing = mailing.error
  if (!phone.ok || !email.ok || !mailing.ok || fieldErrors.email) return { ok: false, fieldErrors }
  return { ok: true, values: { phone: phone.value, email: email.value, mailing: mailing.value } }
}

// ─── what changed ───────────────────────────────────────────────────

export interface ContactChange {
  field: ContactField
  from: string | null
  to: string | null
}

function same(field: ContactField, a: string | null, b: string | null): boolean {
  if (field === 'phone') return digits(a) === digits(b)
  if (field === 'email') return lower(a) === lower(b)
  return (a ?? '').trim() === (b ?? '').trim()
}

export function changedFields(
  current: ContactValues,
  next: ContactValues,
  allowed: readonly ContactField[] = CONTACT_FIELDS,
): ContactChange[] {
  return CONTACT_FIELDS.filter((f) => allowed.includes(f) && !same(f, current[f], next[f])).map((f) => ({
    field: f,
    from: current[f],
    to: next[f],
  }))
}

// ─── the request ticket ─────────────────────────────────────────────

const REMOVE = '(remove)'
const SAME_AS_HOME = '(same as the home)'
const SIGNED_IN = 'Signed in as'

export function formatContactRequest(changes: readonly ContactChange[], signInEmail: string): string {
  const lines = changes.map((c) => {
    const v = c.to ?? (c.field === 'mailing' ? SAME_AS_HOME : REMOVE)
    return `${FIELD_LABEL[c.field]}: ${v}`
  })
  return [
    'Please update my contact details on file.',
    '',
    ...lines,
    '',
    `${SIGNED_IN}: ${lower(signInEmail)}`,
    'Sent from My contact details in the portal. The board applies it from Approvals.',
  ].join('\n')
}

// BL-101 A4 — a board member files the same request from a resident's
// email in the Inbox. The ticket's submitter is then the BOARD MEMBER, so
// the person is named by the address the email came from ("Emailed in
// by"), and the submitter's own account must never select rows: see
// planContactApply. Present only on these requests.
const EMAILED_BY = 'Emailed in by'

/**
 * The request a board member files from a verified resident's email. Same
 * subject, same Approvals queue, same apply; only the identity line and
 * the footer differ. Values only, never removals: an email asks for a new
 * detail, it does not ask the board to delete one.
 */
export function formatInboxContactRequest(changes: readonly ContactChange[], senderEmail: string): string {
  const lines = changes.filter((c) => c.to !== null).map((c) => `${FIELD_LABEL[c.field]}: ${c.to}`)
  return [
    'Please update the contact details on file, as asked by email.',
    '',
    ...lines,
    '',
    `${EMAILED_BY}: ${lower(senderEmail)}`,
    'Filed from the Inbox by a board member. The board applies it from Approvals.',
  ].join('\n')
}

export interface ContactRequest {
  /**
   * Who the change is for, lowercase: the submitter's sign-in email, or —
   * for `channel: 'inbox'` — the address the resident emailed from.
   */
  signInEmail: string
  /** Only the fields asked for; null = remove / same as the home. */
  changes: Partial<Record<ContactField, string | null>>
  /**
   * 'inbox' = the body carries an "Emailed in by" line, i.e. it CLAIMS to
   * be filed by a board member from an email (BL-101 A4). A claim only:
   * the body is free text a resident can type, so callers pass the parse
   * through trustContactChannel with the submitter's real role first.
   */
  channel?: 'inbox'
  /**
   * The "Signed in as" line on a body that also carried "Emailed in by"
   * (inbox channel only): the fallback identity when the channel claim is
   * not honoured.
   */
  signedInAs?: string
}

const LABEL_FIELD = new Map(CONTACT_FIELDS.map((f) => [FIELD_LABEL[f].toLowerCase(), f]))

/**
 * Read a request back from its ticket. Null when this is not one (an
 * ordinary ticket, or one missing its sign-in line or any change). Every
 * value is re-checked: a resident can write a ticket by hand, so the body
 * is input, never trusted.
 */
export function parseContactRequest(subject: string, description: string): ContactRequest | null {
  if (subject.trim() !== CONTACT_SUBJECT) return null
  let signInEmail: string | null = null
  let emailedBy: string | null = null
  const changes: Partial<Record<ContactField, string | null>> = {}
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z ]+):\s?(.*)$/)
    if (!m) continue
    const label = m[1]!.trim().toLowerCase()
    const value = m[2]!.trim()
    if (label === SIGNED_IN.toLowerCase()) {
      const e = normalizeEmail(value)
      if (e.ok && e.value) signInEmail = e.value
      continue
    }
    if (label === EMAILED_BY.toLowerCase()) {
      const e = normalizeEmail(value)
      if (e.ok && e.value) emailedBy = e.value
      continue
    }
    const field = LABEL_FIELD.get(label)
    if (!field || field in changes) continue
    if (field === 'phone') {
      if (value === REMOVE) changes.phone = null
      else {
        const p = normalizePhone(value)
        if (p.ok && p.value) changes.phone = p.value
      }
    } else if (field === 'email') {
      const e = normalizeEmail(value)
      if (e.ok && e.value) changes.email = e.value
    } else if (value === SAME_AS_HOME) changes.mailing = null
    else {
      const a = normalizeMailing(value)
      if (a.ok && a.value) changes.mailing = a.value
    }
  }
  if (Object.keys(changes).length === 0) return null
  // An "Emailed in by" line wins over a "Signed in as" one: it switches the
  // submitter's own account off as a key (planContactApply), the narrower
  // reading of a body that is input, never trusted.
  if (emailedBy) return { signInEmail: emailedBy, changes, channel: 'inbox', ...(signInEmail ? { signedInAs: signInEmail } : {}) }
  if (!signInEmail) return null
  return { signInEmail, changes }
}

/**
 * Honour a request's Inbox channel only when the ticket's submitter really
 * is a board member or admin of the org (BL-101 A4 hardening).
 *
 * WHY. Residents can open a ticket with any subject and body
 * (tickets_insert, 0063), so a resident can hand-type the contact subject
 * plus an "Emailed in by:" line. Honoured, that would (a) show the board
 * "Filed from an email in the Inbox" on what is a resident's own ticket,
 * and (b) switch the key from the resident's own account to whatever
 * address they typed. So for a non-board submitter the claim is dropped
 * and the body is read as an ordinary portal request: their "Signed in
 * as" line if there is one, else not a readable request at all (null).
 */
export function trustContactChannel(request: ContactRequest, submitterIsBoard: boolean): ContactRequest | null {
  if (request.channel !== 'inbox') return request
  if (submitterIsBoard) return { signInEmail: request.signInEmail, changes: request.changes, channel: 'inbox' }
  return request.signedInAs ? { signInEmail: request.signedInAs, changes: request.changes } : null
}

/** parseContactRequest + trustContactChannel in one step. */
export function parseTrustedContactRequest(subject: string, description: string, submitterIsBoard: boolean): ContactRequest | null {
  const r = parseContactRequest(subject, description)
  return r ? trustContactChannel(r, submitterIsBoard) : null
}

// ─── the mailing-address note ───────────────────────────────────────
//
// Record a sale (sale-rules.ts mailingNote) and the import keep a mailing
// address as a "Mailing address: …" note. Same field here — no migration.

const MAILING_RE = /^\s*mailing address:\s*/i

export function readMailing(notes: string | null | undefined): string | null {
  for (const line of (notes ?? '').split(/\r?\n/)) {
    for (const seg of line.split(' · ')) {
      if (MAILING_RE.test(seg)) {
        const v = seg.replace(MAILING_RE, '').trim()
        if (v) return v
      }
    }
  }
  return null
}

export function withMailing(notes: string | null | undefined, mailing: string | null): string | null {
  const kept = (notes ?? '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(' · ')
        .filter((seg) => !MAILING_RE.test(seg))
        .join(' · '),
    )
    .filter((line) => line.trim() !== '')
  if (mailing) kept.push(`Mailing address: ${mailing}`)
  return kept.length > 0 ? kept.join('\n') : null
}

// ─── the resident's own view ────────────────────────────────────────

export interface MyResidentRow {
  id: string
  property_id: string
  email: string | null
  phone: string | null
  notes: string | null
}
export interface MyOwnershipRow {
  id: string
  unit_id: string
  owner_email: string | null
  owner_phone: string | null
}
export interface MyTenancyRow {
  id: string
  unit_id: string
  tenant_email: string | null
  tenant_phone: string | null
}
export interface PendingRequest {
  ticketId: string
  createdAt: string
  request: ContactRequest
}

export interface MyContact {
  unitId: string
  propertyId: string | null
  label: string
  current: ContactValues
  /** What this resident may ask to change. Empty = nothing on file is theirs. */
  editable: ContactField[]
  /** Sign-in rests on the email on file, so it can't be changed here. */
  emailLocked: boolean
  /** No resident row is visible, so the mailing address on file can't be shown. */
  mailingUnknown: boolean
  pending: PendingRequest | null
}

/**
 * One home's contact card, from the rows the resident's OWN client can
 * read (RLS: property_residents on their sign-in email; ownerships and
 * tenancies linked to their account). Rows for other homes are ignored.
 */
export function buildMyContact(input: {
  unit: { unit_id: string; unit_number: string | null; address: string | null }
  propertyId: string | null
  residents: readonly MyResidentRow[]
  ownerships: readonly MyOwnershipRow[]
  tenancies: readonly MyTenancyRow[]
  pending: PendingRequest | null
}): MyContact {
  const { unit, propertyId } = input
  const residents = propertyId ? input.residents.filter((r) => r.property_id === propertyId) : []
  const ownerships = input.ownerships.filter((o) => o.unit_id === unit.unit_id)
  const tenancies = input.tenancies.filter((t) => t.unit_id === unit.unit_id)
  const linked = ownerships.length > 0 || tenancies.length > 0
  const r = residents[0]
  const o = ownerships[0]
  const t = tenancies[0]
  const current: ContactValues = r
    ? { phone: r.phone, email: r.email, mailing: readMailing(r.notes) }
    : o
      ? { phone: o.owner_phone, email: o.owner_email, mailing: null }
      : t
        ? { phone: t.tenant_phone, email: t.tenant_email, mailing: null }
        : { phone: null, email: null, mailing: null }
  const any = residents.length > 0 || linked
  const editable: ContactField[] = []
  if (any) editable.push('phone')
  if (any && linked) editable.push('email')
  if (residents.length > 0) editable.push('mailing')
  return {
    unitId: unit.unit_id,
    propertyId,
    label: [unit.address, unit.unit_number ? `Unit ${unit.unit_number}` : null].filter(Boolean).join(' · ') || 'Your home',
    current,
    editable,
    emailLocked: any && !linked,
    mailingUnknown: any && residents.length === 0,
    pending: input.pending,
  }
}

// ─── applying a request (the board's approval) ──────────────────────

export interface ApplyResidentRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  notes: string | null
  role: string
}
export interface ApplyOwnershipRow {
  id: string
  owner_user_id: string | null
  owner_email: string | null
  owner_phone: string | null
}
export interface ApplyTenancyRow {
  id: string
  tenant_user_id: string | null
  tenant_email: string | null
  tenant_phone: string | null
}

export interface ApplyContext {
  request: ContactRequest
  submitterId: string
  /** The home's current residents (not moved out, not deleted). */
  residents: readonly ApplyResidentRow[]
  /** The unit's current ownerships (valid_to null). */
  ownerships: readonly ApplyOwnershipRow[]
  /** The unit's active tenancies. */
  tenancies: readonly ApplyTenancyRow[]
  /** The home's owner fields; null when not read. */
  property: { owner_email: string | null; owner_phone: string | null } | null
}

export interface Patched<P> {
  id: string
  patch: P
  before: P
}

export interface ApplyPlan {
  residents: Patched<{ phone?: string | null; email?: string | null; notes?: string | null }>[]
  ownerships: Patched<{ owner_phone?: string | null; owner_email?: string | null }>[]
  tenancies: Patched<{ tenant_phone?: string | null; tenant_email?: string | null }>[]
  property: { patch: { owner_phone?: string | null; owner_email?: string | null }; before: { owner_phone?: string | null; owner_email?: string | null } } | null
  /** Requested and applied (whether or not a row actually changed). */
  applied: ContactField[]
  /** Requested but not applied — see HELD_REASON. */
  held: ContactField[]
  /** The resident rows this changes, by name (for the board's card). */
  names: string[]
}

export const HELD_REASON: Record<ContactField, string> = {
  email:
    'The email isn’t changed: this person signs in to the portal with the email on file, so changing it would lock them out. Invite them to the portal from the property page first, then they can ask again.',
  mailing: 'The mailing address isn’t changed: there is no resident record for this person on the home to keep it on.',
  phone: '',
}

function only<P extends Record<string, unknown>>(patch: P, row: Record<string, unknown>): Patched<P> | null {
  const keys = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (row[k] ?? null))
  if (keys.length === 0) return null
  const p = Object.fromEntries(keys.map((k) => [k, patch[k]])) as P
  const before = Object.fromEntries(keys.map((k) => [k, row[k] ?? null])) as P
  return { patch: p, before } as Patched<P>
}

export function planContactApply(ctx: ApplyContext): { ok: true; plan: ApplyPlan } | { ok: false; error: string } {
  const { request } = ctx
  // An Inbox-filed request's submitter is the board member who filed it,
  // not the resident: their account never selects a row. Only unlinked
  // rows on the address the email came from do, and an email change is
  // always held (no linked access to keep it safe), like an unlinked
  // resident's own request.
  const submitterId = request.channel === 'inbox' ? null : ctx.submitterId
  const isSubmitter = (id: string | null) => submitterId !== null && id === submitterId
  const ch = request.changes
  const linkedOwn = ctx.ownerships.filter((o) => isSubmitter(o.owner_user_id))
  const linkedTen = ctx.tenancies.filter((t) => isSubmitter(t.tenant_user_id))
  const linked = linkedOwn.length > 0 || linkedTen.length > 0
  const keys = new Set([request.signInEmail, ...linkedOwn.map((o) => lower(o.owner_email)), ...linkedTen.map((t) => lower(t.tenant_email))].filter(Boolean))

  const mineResidents = ctx.residents.filter((r) => keys.has(lower(r.email)))
  const mineOwn = ctx.ownerships.filter((o) => isSubmitter(o.owner_user_id) || (o.owner_user_id === null && keys.has(lower(o.owner_email))))
  const mineTen = ctx.tenancies.filter((t) => isSubmitter(t.tenant_user_id) || (t.tenant_user_id === null && keys.has(lower(t.tenant_email))))
  const propertyMine = ctx.property !== null && keys.has(lower(ctx.property.owner_email))

  if (mineResidents.length === 0 && mineOwn.length === 0 && mineTen.length === 0 && !propertyMine) {
    return {
      ok: false,
      error: 'Nothing on file for this home matches the person who asked. Check the People section and update it there.',
    }
  }

  const requested = CONTACT_FIELDS.filter((f) => f in ch)
  const held: ContactField[] = []
  if ('email' in ch && !linked) held.push('email')
  if ('mailing' in ch && mineResidents.length === 0) held.push('mailing')
  const applied = requested.filter((f) => !held.includes(f))
  if (applied.length === 0) {
    return { ok: false, error: held.map((f) => HELD_REASON[f]).join(' ') }
  }

  const phone = applied.includes('phone') ? { set: true, v: ch.phone ?? null } : { set: false, v: null }
  const email = applied.includes('email') ? { set: true, v: ch.email ?? null } : { set: false, v: null }
  const mailing = applied.includes('mailing')

  const plan: ApplyPlan = { residents: [], ownerships: [], tenancies: [], property: null, applied, held, names: mineResidents.map((r) => r.full_name) }

  for (const r of mineResidents) {
    const patch: { phone?: string | null; email?: string | null; notes?: string | null } = {}
    if (phone.set && !same('phone', r.phone, phone.v)) patch.phone = phone.v
    if (email.set && !same('email', r.email, email.v)) patch.email = email.v
    if (mailing) {
      const notes = withMailing(r.notes, ch.mailing ?? null)
      if ((notes ?? null) !== (r.notes ?? null)) patch.notes = notes
    }
    const p = only(patch, r as unknown as Record<string, unknown>)
    if (p) plan.residents.push({ ...p, id: r.id })
  }
  for (const o of mineOwn) {
    const patch: { owner_phone?: string | null; owner_email?: string | null } = {}
    if (phone.set && !same('phone', o.owner_phone, phone.v)) patch.owner_phone = phone.v
    if (email.set && !same('email', o.owner_email, email.v)) patch.owner_email = email.v
    const p = only(patch, o as unknown as Record<string, unknown>)
    if (p) plan.ownerships.push({ ...p, id: o.id })
  }
  for (const t of mineTen) {
    const patch: { tenant_phone?: string | null; tenant_email?: string | null } = {}
    if (phone.set && !same('phone', t.tenant_phone, phone.v)) patch.tenant_phone = phone.v
    if (email.set && !same('email', t.tenant_email, email.v)) patch.tenant_email = email.v
    const p = only(patch, t as unknown as Record<string, unknown>)
    if (p) plan.tenancies.push({ ...p, id: t.id })
  }
  if (propertyMine && ctx.property) {
    const patch: { owner_phone?: string | null; owner_email?: string | null } = {}
    if (phone.set && !same('phone', ctx.property.owner_phone, phone.v)) patch.owner_phone = phone.v
    if (email.set && !same('email', ctx.property.owner_email, email.v)) patch.owner_email = email.v
    const p = only(patch, ctx.property as unknown as Record<string, unknown>)
    if (p) plan.property = p
  }
  return { ok: true, plan }
}

// ─── "Updated by owner on …" ────────────────────────────────────────

export const AUDIT_APPLIED = 'resident.contact_update.applied'
export const AUDIT_REJECTED = 'resident.contact_update.rejected'

/** Audit rows (ids only) → latest self-update per resident / ownership id. */
export function selfUpdateDates(rows: ReadonlyArray<{ created_at: string | null; metadata: unknown }>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (!row.created_at || !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) continue
    const m = row.metadata as Record<string, unknown>
    const ids = [...(Array.isArray(m.residentIds) ? m.residentIds : []), ...(Array.isArray(m.ownershipIds) ? m.ownershipIds : [])]
    for (const id of ids) {
      if (typeof id !== 'string') continue
      if (!out[id] || row.created_at > out[id]!) out[id] = row.created_at
    }
  }
  return out
}
