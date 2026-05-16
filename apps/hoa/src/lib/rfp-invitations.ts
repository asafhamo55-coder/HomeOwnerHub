'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendEmail, appUrl } from '@/lib/email'

// rfp_invitations rows ship in migration 0007. One row per (rfp_id,
// vendor_id) — unique constraint. Token format identical to
// vendor_onboarding_invitations (32 bytes base64url).

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

export interface InvitableVendor {
  id: string
  legal_name: string
  trades: string[] | null
  status: 'prospect' | 'active' | 'inactive' | 'blacklisted'
  compliance_status: 'green' | 'yellow' | 'red' | 'missing' | null
  already_invited: boolean
}

export interface RfpInvitationRow {
  id: string
  vendor_id: string
  vendor_legal_name: string
  invited_at: string
  acknowledged_at: string | null
  has_bid: boolean
  bid_status: string | null
}

const TOKEN_BYTES = 32
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

// ─── Reads ───────────────────────────────────────────────────────────

// List vendors eligible to receive a bid invitation for this RFP. Marks
// who's already invited so the manager doesn't double-invite.
export async function listInvitableVendors(
  rfpId: string,
  associationId: string,
): Promise<InvitableVendor[]> {
  const supabase = await getSupabaseServerClient()

  const { data: vendorRows } = await supabase
    .from('vendors' as never)
    .select('id, legal_name, trades, status')
    .neq('status', 'blacklisted')
    .order('legal_name', { ascending: true })

  const vendors = (vendorRows ?? []) as unknown as Array<
    Pick<InvitableVendor, 'id' | 'legal_name' | 'trades' | 'status'>
  >
  if (vendors.length === 0) return []

  const vendorIds = vendors.map((v) => v.id)

  const [{ data: complianceRows }, { data: inviteRows }] = await Promise.all([
    supabase
      .from('vendor_compliance' as never)
      .select('vendor_id, coi_status')
      .eq('association_id', associationId)
      .in('vendor_id', vendorIds),
    supabase
      .from('rfp_invitations' as never)
      .select('vendor_id')
      .eq('rfp_id', rfpId)
      .in('vendor_id', vendorIds),
  ])

  const complianceByVendor = new Map<string, InvitableVendor['compliance_status']>()
  for (const c of (complianceRows ?? []) as unknown as Array<{
    vendor_id: string
    coi_status: InvitableVendor['compliance_status']
  }>) {
    complianceByVendor.set(c.vendor_id, c.coi_status)
  }
  const invitedSet = new Set(
    ((inviteRows ?? []) as unknown as Array<{ vendor_id: string }>).map(
      (r) => r.vendor_id,
    ),
  )

  return vendors.map((v) => ({
    ...v,
    compliance_status: complianceByVendor.get(v.id) ?? null,
    already_invited: invitedSet.has(v.id),
  }))
}

export async function listRfpInvitations(
  rfpId: string,
): Promise<RfpInvitationRow[]> {
  const supabase = await getSupabaseServerClient()

  const { data: invitations } = await supabase
    .from('rfp_invitations' as never)
    .select(
      'id, vendor_id, invited_at, acknowledged_at, vendor:vendors(legal_name)',
    )
    .eq('rfp_id', rfpId)
    .order('invited_at', { ascending: false })

  const rows = (invitations ?? []) as unknown as Array<{
    id: string
    vendor_id: string
    invited_at: string
    acknowledged_at: string | null
    vendor: { legal_name: string } | null
  }>
  if (rows.length === 0) return []

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)))
  const { data: bidRows } = await supabase
    .from('bids' as never)
    .select('vendor_id, status')
    .eq('rfp_id', rfpId)
    .in('vendor_id', vendorIds)
  const bidByVendor = new Map<string, string>()
  for (const b of (bidRows ?? []) as unknown as Array<{
    vendor_id: string
    status: string
  }>) {
    bidByVendor.set(b.vendor_id, b.status)
  }

  return rows.map((r) => ({
    id: r.id,
    vendor_id: r.vendor_id,
    vendor_legal_name: r.vendor?.legal_name ?? '(unknown vendor)',
    invited_at: r.invited_at,
    acknowledged_at: r.acknowledged_at,
    has_bid: bidByVendor.has(r.vendor_id),
    bid_status: bidByVendor.get(r.vendor_id) ?? null,
  }))
}

// ─── Writes ──────────────────────────────────────────────────────────

const InviteSchema = z.object({
  rfp_id: z.string().uuid(),
  vendor_ids: z.array(z.string().uuid()).min(1),
})

export interface InviteVendorsInput {
  rfpId: string
  vendorIds: string[]
}

export async function inviteVendorsToRfp(
  input: InviteVendorsInput,
): Promise<
  ActionResult<{
    sent: number
    skipped: number
    failed: Array<{ vendorId: string; reason: string }>
  }>
> {
  const parsed = InviteSchema.safeParse({
    rfp_id: input.rfpId,
    vendor_ids: input.vendorIds,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // Pull RFP + verify it's actually open. Sending invites for a draft
  // or cancelled RFP would let vendors see something they shouldn't.
  const { data: rfp } = await supabase
    .from('rfps' as never)
    .select('id, title, rfp_number, status, submission_deadline')
    .eq('id', parsed.data.rfp_id)
    .maybeSingle<{
      id: string
      title: string
      rfp_number: string
      status: string
      submission_deadline: string
    }>()
  if (!rfp) return { ok: false, error: 'RFP not found.' }
  if (rfp.status !== 'open') {
    return {
      ok: false,
      error: `RFP must be 'open' to send invitations. Currently '${rfp.status}'.`,
    }
  }

  // Vendor lookup — collect emails for sending.
  const { data: vendorRows } = await supabase
    .from('vendors' as never)
    .select('id, legal_name, primary_email')
    .in('id', parsed.data.vendor_ids)
  const vendors = (vendorRows ?? []) as unknown as Array<{
    id: string
    legal_name: string
    primary_email: string | null
  }>
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))

  // Skip vendors that already have an invitation for this RFP — the
  // unique constraint would refuse the insert anyway.
  const { data: existing } = await supabase
    .from('rfp_invitations' as never)
    .select('vendor_id')
    .eq('rfp_id', rfp.id)
    .in('vendor_id', parsed.data.vendor_ids)
  const alreadyInvited = new Set(
    ((existing ?? []) as unknown as Array<{ vendor_id: string }>).map(
      (r) => r.vendor_id,
    ),
  )

  let sent = 0
  let skipped = alreadyInvited.size
  const failed: Array<{ vendorId: string; reason: string }> = []

  for (const vendorId of parsed.data.vendor_ids) {
    if (alreadyInvited.has(vendorId)) continue
    const vendor = vendorMap.get(vendorId)
    if (!vendor) {
      failed.push({ vendorId, reason: 'vendor_not_found' })
      continue
    }
    if (!vendor.primary_email) {
      failed.push({ vendorId, reason: 'vendor_has_no_email' })
      continue
    }

    const token = generateToken()
    const { error: insertErr } = await supabase
      .from('rfp_invitations' as never)
      .insert({
        organization_id: org.id,
        rfp_id: rfp.id,
        vendor_id: vendorId,
        unique_submission_token: token,
      } as never)
    if (insertErr) {
      failed.push({ vendorId, reason: insertErr.message })
      continue
    }

    const link = appUrl(`/rfp-bid/${token}`)
    const emailResult = await sendEmail({
      to: vendor.primary_email,
      subject: `Invitation to bid on ${rfp.rfp_number} — ${rfp.title}`,
      html: renderInviteHtml({
        vendorName: vendor.legal_name,
        rfpTitle: rfp.title,
        rfpNumber: rfp.rfp_number,
        deadline: rfp.submission_deadline,
        link,
      }),
      text: renderInviteText({
        vendorName: vendor.legal_name,
        rfpTitle: rfp.title,
        rfpNumber: rfp.rfp_number,
        deadline: rfp.submission_deadline,
        link,
      }),
    })
    if (!emailResult.ok) {
      console.warn(
        '[rfp-invite] email send failed for vendor',
        vendorId,
        emailResult.error,
      )
      // Don't roll back — the invitation row exists and the manager
      // can re-send by copying the link from the dashboard.
    }
    sent += 1
  }

  revalidatePath(`/rfps/${rfp.id}`)
  return { ok: true, data: { sent, skipped, failed } }
}

export async function revokeRfpInvitation(
  invitationId: string,
): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()

  // Invalidate the token. We keep the row so the audit trail shows
  // someone was invited and then revoked.
  const { data: row, error } = await supabase
    .from('rfp_invitations' as never)
    .update({ unique_submission_token: null } as never)
    .eq('id', invitationId)
    .select('rfp_id')
    .single<{ rfp_id: string }>()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/rfps/${row.rfp_id}`)
  return { ok: true }
}

// ─── Token validation (public-side) ──────────────────────────────────

export interface ValidatedRfpInvitation {
  invitationId: string
  organizationId: string
  rfpId: string
  rfpNumber: string
  rfpTitle: string
  rfpScope: string
  submissionDeadline: string
  vendorId: string
  vendorLegalName: string
  vendorEmail: string | null
}

export async function validateRfpInvitationToken(
  token: string,
): Promise<
  | { ok: true; invitation: ValidatedRfpInvitation; alreadyBid: boolean }
  | { ok: false; reason: 'not_found' | 'rfp_closed' | 'revoked' | 'expired' }
> {
  const db = createAdminClient()
  const { data } = await db
    .from('rfp_invitations' as never)
    .select(
      'id, organization_id, rfp_id, vendor_id, unique_submission_token, rfp:rfps(id, rfp_number, title, scope, status, submission_deadline), vendor:vendors(id, legal_name, primary_email)',
    )
    .eq('unique_submission_token', token)
    .maybeSingle<{
      id: string
      organization_id: string
      rfp_id: string
      vendor_id: string
      unique_submission_token: string | null
      rfp: {
        id: string
        rfp_number: string
        title: string
        scope: string
        status: string
        submission_deadline: string
      } | null
      vendor: {
        id: string
        legal_name: string
        primary_email: string | null
      } | null
    }>()

  if (!data || !data.rfp || !data.vendor) return { ok: false, reason: 'not_found' }
  if (data.unique_submission_token == null) {
    return { ok: false, reason: 'revoked' }
  }
  if (data.rfp.status === 'cancelled' || data.rfp.status === 'awarded') {
    return { ok: false, reason: 'rfp_closed' }
  }
  if (new Date(data.rfp.submission_deadline).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  // If the vendor already submitted a bid, surface it so the
  // public page can show "thanks, already submitted" instead of
  // letting them double-submit.
  const { data: existingBid } = await db
    .from('bids' as never)
    .select('id, status')
    .eq('rfp_id', data.rfp_id)
    .eq('vendor_id', data.vendor_id)
    .maybeSingle<{ id: string; status: string }>()
  const alreadyBid = !!existingBid && existingBid.status === 'submitted'

  // Mark the invitation acknowledged the first time the link is opened.
  // Best-effort — failure shouldn't block submission.
  await db
    .from('rfp_invitations' as never)
    .update({ acknowledged_at: new Date().toISOString() } as never)
    .eq('id', data.id)
    .is('acknowledged_at', null)

  return {
    ok: true,
    invitation: {
      invitationId: data.id,
      organizationId: data.organization_id,
      rfpId: data.rfp.id,
      rfpNumber: data.rfp.rfp_number,
      rfpTitle: data.rfp.title,
      rfpScope: data.rfp.scope,
      submissionDeadline: data.rfp.submission_deadline,
      vendorId: data.vendor.id,
      vendorLegalName: data.vendor.legal_name,
      vendorEmail: data.vendor.primary_email,
    },
    alreadyBid,
  }
}

// ─── Email templates ─────────────────────────────────────────────────

interface InviteTemplateArgs {
  vendorName: string
  rfpTitle: string
  rfpNumber: string
  deadline: string
  link: string
}

function renderInviteHtml(args: InviteTemplateArgs): string {
  const deadlineFmt = new Date(args.deadline).toLocaleString()
  return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
  <p style="font-size: 12px; color: #666; margin-bottom: 4px;">${escapeHtml(args.rfpNumber)}</p>
  <h1 style="font-size: 20px; margin: 0 0 16px;">Invitation to bid: ${escapeHtml(args.rfpTitle)}</h1>
  <p>Hi ${escapeHtml(args.vendorName)},</p>
  <p>You're invited to submit a bid on the RFP linked below. Please review the scope and line items, and submit your bid before the deadline.</p>
  <p style="margin: 24px 0;">
    <a href="${args.link}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:600;">View RFP & submit bid</a>
  </p>
  <p style="font-size: 14px;"><strong>Submission deadline:</strong> ${escapeHtml(deadlineFmt)}</p>
  <p style="font-size: 12px; color: #666;">Or copy this link: <br><a href="${args.link}">${escapeHtml(args.link)}</a></p>
  <p style="font-size: 12px; color: #666;">This link is unique to you. Please don't forward it — anyone with the link can submit a bid in your name.</p>
</body></html>`
}

function renderInviteText(args: InviteTemplateArgs): string {
  return `Invitation to bid: ${args.rfpTitle} (${args.rfpNumber})

Hi ${args.vendorName},

You're invited to submit a bid on the RFP linked below. Please review the scope and line items, and submit your bid before the deadline.

View RFP & submit bid: ${args.link}

Submission deadline: ${new Date(args.deadline).toLocaleString()}

This link is unique to you. Please don't forward it.`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
