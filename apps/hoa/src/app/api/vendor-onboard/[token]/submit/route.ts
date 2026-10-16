import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { validateInvitationToken } from '@/lib/vendor-invitations'
import { sendEmail, appUrl } from '@/lib/email'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseForm, parseValue } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure, type LogContext } from '@/lib/api/log'
import {
  MAX_ARRAY_ITEMS,
  MAX_JSON_BYTES,
  MAX_SHORT_TEXT,
  MAX_UPLOAD_BYTES,
} from '@/lib/api/limits'

// POST /api/vendor-onboard/[token]/submit
//
// Public endpoint — no Supabase auth session. The token is the
// credential (RC-5). We use the service-role client to bypass RLS on the
// vendors / vendor_documents / vendor_onboarding_invitations tables
// after validating the token in app code.
//
// Multipart payload:
//   - JSON field "payload" with the vendor profile fields (snake_case:
//     a public contract, kept until versioned — RC-11)
//   - File fields "file_coi", "file_w9", "file_license" (optional)
//
// Flow: validate token → parse + validate → claim the invitation
// atomically (pending → submitted) → create the vendor → upload files +
// vendor_documents rows → link the vendor to the invitation. Any failure
// after the claim compensates in reverse order and releases the claim,
// so the vendor can retry with the same link.

const STORAGE_BUCKET = 'hoa-documents'
const WHERE = 'vendor_onboard.submit'

const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

// Some browsers send an empty (or generic octet-stream) MIME type for files
// they don't recognise (HEIC on older platforms). Fall back to the
// extension, still on the allowlist.
const EXTENSION_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
}

// Tokens are 32 random bytes in base64url (lib/vendor-invitations). Anything
// else cannot be one of ours: 404 without a lookup.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/

// Three uploads plus the JSON payload and multipart overhead.
const MAX_SUBMIT_BYTES = 3 * MAX_UPLOAD_BYTES + MAX_JSON_BYTES

const optText = (max = MAX_SHORT_TEXT) => zText(max).optional().nullable()

const AddressSchema = z.object({
  line1: optText(),
  line2: optText(),
  city: optText(),
  state: optText(),
  postal_code: optText(20),
})

const PayloadSchema = z
  .object({
    legal_name: zText(MAX_SHORT_TEXT, 2),
    dba: optText(),
    // Strip non-digit chars first, then validate just the digit count.
    // Tolerates "12-3456789", "12 3456789", "12-345-6789", etc. —
    // vendors enter EINs in several conventions and we don't want
    // formatting nits to block submission.
    ein: zText(32)
      .transform((s) => s.replace(/\D/g, ''))
      .refine((s) => s.length === 9, 'EIN must contain exactly 9 digits.'),
    primary_email: zText(320).email().nullable().optional().or(z.literal('')),
    primary_phone: optText(50),
    trades: z.array(zText(100, 1)).min(1).max(MAX_ARRAY_ITEMS),
    address: AddressSchema.nullable().optional(),
    // Accept either a 5-digit ZIP (30022) or a ZIP+4 (30022-1234).
    // Normalize to the 5-digit base before storage so downstream
    // filtering stays consistent.
    service_area_zips: z
      .array(
        z
          .string()
          .trim()
          .max(10)
          .regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits, with an optional -4 suffix.')
          .transform((zip) => zip.slice(0, 5)),
      )
      .max(MAX_ARRAY_ITEMS)
      .default([]),
  })
  .refine(
    (v) => (v.primary_email && v.primary_email !== '') || (v.primary_phone && v.primary_phone !== ''),
    { message: 'Email or phone is required.', path: ['primary_email'] },
  )

const DOC_FILE_KEYS = [
  ['file_coi', 'coi'],
  ['file_w9', 'w9'],
  ['file_license', 'license'],
] as const

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

function safeName(original: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionOf(original)}`
}

const DUPLICATE_EIN = {
  reason: 'duplicate_ein',
  message: 'A vendor with this EIN already exists for this organization.',
}

const ALREADY_SUBMITTED_MESSAGE = 'This invitation has already been submitted.'

type Db = ReturnType<typeof createAdminClient>

export const POST = withRoute(
  'vendor_onboard.submit',
  async (request: Request, { params }: { params: Promise<{ token: string }> }) => {
    // ── Auth: the token (RC-3, RC-5) ────────────────────────────────
    const { token } = await params
    if (!TOKEN_SHAPE.test(token)) throw new ApiRouteError('not_found', 'This invitation link is not valid.')

    const validation = await validateInvitationToken(token)
    if (!validation.ok) throw tokenRejection(validation.reason)
    const invitation = validation.invitation
    const orgId = invitation.organizationId

    // ── Parse + validate (RC-8, RC-10) ──────────────────────────────
    const formData = await parseForm(request, { maxBytes: MAX_SUBMIT_BYTES })

    const payloadRaw = formData.get('payload')
    if (typeof payloadRaw !== 'string') {
      throw new ApiRouteError('validation_failed', undefined, {
        issues: [{ path: 'payload', message: 'The vendor profile is missing.' }],
      })
    }
    // The cap is in bytes: measure UTF-8 bytes, not UTF-16 code units.
    if (new TextEncoder().encode(payloadRaw).byteLength > MAX_JSON_BYTES) {
      throw new ApiRouteError('payload_too_large', undefined, { maxBytes: MAX_JSON_BYTES })
    }
    let payloadJson: unknown
    try {
      payloadJson = JSON.parse(payloadRaw)
    } catch {
      throw new ApiRouteError('invalid_json')
    }
    const payload = parseValue(PayloadSchema, payloadJson)

    // Pre-validate file shapes before we touch the DB.
    const files: Array<{ docType: string; file: File; contentType: string }> = []
    for (const [field, docType] of DOC_FILE_KEYS) {
      const entry = formData.get(field)
      if (!(entry instanceof File) || entry.size === 0) continue
      if (entry.size > MAX_UPLOAD_BYTES) {
        throw new ApiRouteError('payload_too_large', 'That file is larger than 25 MB.', {
          field,
          maxBytes: MAX_UPLOAD_BYTES,
        })
      }
      const declared = entry.type === 'application/octet-stream' ? '' : entry.type
      const contentType = declared || EXTENSION_TYPES[extensionOf(entry.name)] || ''
      if (!ALLOWED_FILE_TYPES.has(contentType)) {
        throw new ApiRouteError('unsupported_media_type', 'Upload a PDF, JPEG, PNG, WebP or HEIC file.', {
          field,
        })
      }
      files.push({ docType, file: entry, contentType })
    }

    const address = payload.address
    const addressJson =
      address && Object.values(address).some((v) => v != null && v !== '') ? address : null

    const db = createAdminClient()
    const ctx = { orgId, invitationId: invitation.id }

    // ── Claim the invitation atomically (RC-5) ──────────────────────
    // Only one concurrent submit can move pending → submitted; the loser
    // creates nothing. Expiry is re-checked in the same statement so a link
    // that expired mid-form (the upload can take a while) cannot be claimed.
    const claim = await db
      .from('vendor_onboarding_invitations' as never)
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as never)
      .eq('id', invitation.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id')
    checkWrite(claim, `${WHERE}.claim`, ctx)
    if (!Array.isArray(claim.data) || claim.data.length === 0) {
      // Zero rows: the row changed since validateInvitationToken. Re-read it
      // so expired / revoked / already submitted each get their own answer
      // (RC-1, RC-5) instead of all reading as "already submitted".
      throw await lostClaimRejection(db, invitation.id, ctx)
    }

    // Everything below runs under the claim. On failure, undo in reverse
    // order, release the claim, then rethrow the envelope.
    //
    // Left behind if the function dies here (timeout on a large upload, a
    // crash, a redeploy) before the catch runs: compensation never executes,
    // so the invitation stays 'submitted' with vendor_id null, possibly with
    // a vendor row and some uploaded files, and every retry of the link
    // answers 409 already_submitted. The board recovers by re-inviting the
    // vendor (and deleting any half-created vendor) from the vendors page.
    let vendorId: string | null = null
    const uploadedPaths: string[] = []
    try {
      // Per-org duplicate guard on EIN. There is no unique index on
      // vendors(organization_id, ein), so two *different* invitations for
      // the same org could still race past this; a 23505 from a future
      // index is mapped to the same 409 below. Orgs can already hold the
      // same EIN more than once (older races, createVendor has no guard), so
      // this reads up to one row as an array: .maybeSingle() would turn two
      // matches into a PGRST116 error and a 500 that no retry can fix.
      const existing = await db
        .from('vendors' as never)
        .select('id')
        .eq('organization_id', orgId)
        .eq('ein', payload.ein)
        .limit(1)
      if (existing.error) {
        logRouteFailure(`${WHERE}.ein_lookup`, existing.error, ctx)
        throw new ApiRouteError('internal')
      }
      if (Array.isArray(existing.data) && existing.data.length > 0) {
        throw new ApiRouteError('conflict', DUPLICATE_EIN.message, { reason: DUPLICATE_EIN.reason })
      }

      const vendorInsert = await db
        .from('vendors' as never)
        .insert({
          organization_id: orgId,
          legal_name: payload.legal_name,
          dba: payload.dba || null,
          ein: payload.ein,
          primary_email: payload.primary_email || null,
          primary_phone: payload.primary_phone || null,
          trades: payload.trades,
          address: addressJson,
          service_area_zips: payload.service_area_zips.length > 0 ? payload.service_area_zips : null,
          status: 'prospect',
        } as never)
        .select('id')
        .single<{ id: string }>()
      checkWrite(vendorInsert, `${WHERE}.vendor_insert`, ctx, { conflict: DUPLICATE_EIN })
      if (!vendorInsert.data) throw new ApiRouteError('internal')
      vendorId = vendorInsert.data.id

      // Any document failure aborts the whole submission: reporting
      // "submitted" with a missing document would leave the board with an
      // incomplete file set and no signal to chase.
      for (const { docType, file, contentType } of files) {
        const storagePath = `${orgId}/vendors/${vendorId}/${docType}/${safeName(file.name)}`
        const upload = await db.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        })
        checkWrite(upload, `${WHERE}.upload`, { ...ctx, vendorId, docType })
        uploadedPaths.push(storagePath)

        const docInsert = await db.from('vendor_documents' as never).insert({
          organization_id: orgId,
          vendor_id: vendorId,
          doc_type: docType,
          storage_path: storagePath,
        } as never)
        checkWrite(docInsert, `${WHERE}.document_insert`, { ...ctx, vendorId, docType })
      }

      const link = await db
        .from('vendor_onboarding_invitations' as never)
        .update({ vendor_id: vendorId } as never)
        .eq('id', invitation.id)
      checkWrite(link, `${WHERE}.invitation_link`, { ...ctx, vendorId })
    } catch (err) {
      await compensate(db, { invitationId: invitation.id, orgId, vendorId, uploadedPaths })
      throw err
    }

    // Best-effort notification to the manager who created the invitation.
    // Failures are logged (code only), not surfaced — the vendor has done
    // their part and shouldn't see an error if our email pipeline is sick.
    await notifyManagerOnSubmission(db, invitation.id, vendorId).catch((err: unknown) => {
      logRouteFailure(`${WHERE}.notify`, err, { ...ctx, vendorId })
    })

    return NextResponse.json(
      { vendorId, documentTypes: files.map((f) => f.docType) },
      { status: 201 },
    )
  },
)

/**
 * Undo a partial submission in reverse order (RC-6): uploaded files, the
 * vendor row (its vendor_documents rows cascade), then release the claim so
 * the link works again. Each step's failure is logged by code and the next
 * step still runs; whatever could not be undone is named in the log.
 */
async function compensate(
  db: Db,
  args: { invitationId: string; orgId: string; vendorId: string | null; uploadedPaths: string[] },
): Promise<void> {
  const ctx = { orgId: args.orgId, invitationId: args.invitationId, vendorId: args.vendorId }
  try {
    if (args.uploadedPaths.length > 0) {
      const { error } = await db.storage.from(STORAGE_BUCKET).remove(args.uploadedPaths)
      if (error) logRouteFailure(`${WHERE}.rollback_files`, error, { ...ctx, count: args.uploadedPaths.length })
    }
    if (args.vendorId) {
      const { error } = await db.from('vendors' as never).delete().eq('id', args.vendorId)
      // Left behind if this fails: an orphan 'prospect' vendor row (no
      // documents, no invitation link). The claim is still released below,
      // but a retry with the same EIN now hits the duplicate guard and gets
      // 409 duplicate_ein on that orphan until the board deletes it.
      if (error) logRouteFailure(`${WHERE}.rollback_vendor`, error, ctx)
    }
    const { error } = await db
      .from('vendor_onboarding_invitations' as never)
      .update({ status: 'pending', submitted_at: null, vendor_id: null } as never)
      .eq('id', args.invitationId)
      .eq('status', 'submitted')
    // Left behind if this fails: the invitation stays 'submitted' with no
    // vendor, and the board must re-invite.
    if (error) logRouteFailure(`${WHERE}.rollback_claim`, error, ctx)
  } catch (err) {
    logRouteFailure(`${WHERE}.rollback`, err, ctx)
  }
}

type TokenReason = 'not_found' | 'expired' | 'consumed' | 'revoked'

/** One answer per token situation (RC-1, RC-5): 404 / 410 + reason / 409. */
function tokenRejection(reason: TokenReason): ApiRouteError {
  switch (reason) {
    case 'not_found':
      return new ApiRouteError('not_found', 'This invitation link is not valid.')
    case 'consumed':
      return new ApiRouteError('conflict', ALREADY_SUBMITTED_MESSAGE, { reason: 'already_submitted' })
    case 'expired':
      return new ApiRouteError('gone', 'This invitation has expired. Ask the association for a new link.', {
        reason: 'expired',
      })
    case 'revoked':
      return new ApiRouteError('gone', 'This invitation was cancelled by the association.', {
        reason: 'revoked',
      })
  }
}

/**
 * The atomic claim matched no row. Re-read the invitation and answer for
 * what actually happened between validation and the claim: it expired, the
 * board revoked it, or another submit claimed it.
 */
async function lostClaimRejection(
  db: Db,
  invitationId: string,
  ctx: LogContext,
): Promise<ApiRouteError> {
  const { data, error } = await db
    .from('vendor_onboarding_invitations' as never)
    .select('status, expires_at')
    .eq('id', invitationId)
    .maybeSingle<{ status: string; expires_at: string }>()
  if (error) {
    logRouteFailure(`${WHERE}.claim_reread`, error, ctx)
    return new ApiRouteError('internal')
  }
  if (!data) return tokenRejection('not_found')
  if (data.status === 'submitted') return tokenRejection('consumed')
  if (data.status === 'revoked') return tokenRejection('revoked')
  if (data.status === 'expired' || new Date(data.expires_at).getTime() <= Date.now()) {
    return tokenRejection('expired')
  }
  // Still pending and unexpired: a concurrent submit claimed it and has
  // already released it after a failure. Nothing was saved; retrying works.
  return new ApiRouteError('conflict', 'Another submission of this invitation did not finish. Please try again.', {
    reason: 'in_progress',
  })
}

async function notifyManagerOnSubmission(db: Db, invitationId: string, vendorId: string): Promise<void> {
  const { data: inv } = await db
    .from('vendor_onboarding_invitations' as never)
    .select('created_by, invitee_name, invitee_email, org:orgs(name)')
    .eq('id', invitationId)
    .maybeSingle<{
      created_by: string | null
      invitee_name: string | null
      invitee_email: string
      org: { name: string } | null
    }>()
  if (!inv?.created_by) return // nobody to notify

  const { data: vendor } = await db
    .from('vendors' as never)
    .select('legal_name')
    .eq('id', vendorId)
    .maybeSingle<{ legal_name: string }>()

  const { data: profile } = await db
    .from('profiles')
    .select('email, full_name')
    .eq('id', inv.created_by)
    .maybeSingle<{ email: string | null; full_name: string | null }>()
  if (!profile?.email) return

  const vendorName = vendor?.legal_name ?? inv.invitee_name ?? inv.invitee_email
  const orgName = inv.org?.name ?? 'your association'

  const sent = await sendEmail({
    to: profile.email,
    subject: `${vendorName} completed vendor onboarding`,
    text: `${vendorName} just submitted their vendor profile for ${orgName}.

Open the manager dashboard to review:
${appUrl('/vendors')}

— HomeownerHub`,
    html: `<p>${escapeHtml(vendorName)} just submitted their vendor profile for <strong>${escapeHtml(orgName)}</strong>.</p>
<p><a href="${appUrl('/vendors')}">Review in the manager dashboard →</a></p>`,
  })
  if (!sent.ok) logRouteFailure(`${WHERE}.notify_send`, null, { invitationId, vendorId })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
