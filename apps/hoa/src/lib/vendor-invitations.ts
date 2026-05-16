'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendEmail, appUrl } from '@/lib/email'

export type InvitationStatus = 'pending' | 'submitted' | 'expired' | 'revoked'

export interface InvitationRow {
  id: string
  invitee_email: string
  invitee_name: string | null
  status: InvitationStatus
  expires_at: string
  created_at: string
  submitted_at: string | null
  vendor_id: string | null
}

const INVITATION_TTL_DAYS = 7
const TOKEN_BYTES = 32 // ~43 chars base64url

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

// ─── Action result type ──────────────────────────────────────────────

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads (manager-side, RLS-respecting) ────────────────────────────

export async function listInvitations(): Promise<InvitationRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('vendor_onboarding_invitations' as never)
    .select(
      'id, invitee_email, invitee_name, status, expires_at, created_at, submitted_at, vendor_id',
    )
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as InvitationRow[]
}

// ─── Create + send ───────────────────────────────────────────────────

const CreateSchema = z.object({
  invitee_email: z.string().trim().email('Email looks invalid.'),
  invitee_name: z.string().trim().optional().nullable(),
})

export interface CreateInvitationInput {
  inviteeEmail: string
  inviteeName?: string | null
}

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<ActionResult<{ invitationId: string; token: string; link: string }>> {
  const parsed = CreateSchema.safeParse({
    invitee_email: input.inviteeEmail,
    invitee_name: input.inviteeName ?? null,
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

  const token = generateToken()
  const expiresAt = new Date(
    Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: row, error } = await supabase
    .from('vendor_onboarding_invitations' as never)
    .insert({
      organization_id: org.id,
      token,
      invitee_email: parsed.data.invitee_email,
      invitee_name: parsed.data.invitee_name,
      status: 'pending',
      expires_at: expiresAt,
      created_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not create invitation.' }
  }

  const link = appUrl(`/vendor-onboard/${token}`)

  // Fire-and-forget-ish — if email fails, surface the link to the
  // manager via the action result so they can still copy + send manually.
  const send = await sendEmail({
    to: parsed.data.invitee_email,
    subject: `${org.name} is inviting you to onboard as a vendor`,
    html: renderInvitationHtml({
      orgName: org.name,
      inviteeName: parsed.data.invitee_name ?? null,
      link,
    }),
    text: renderInvitationText({
      orgName: org.name,
      inviteeName: parsed.data.invitee_name ?? null,
      link,
    }),
  })

  if (!send.ok) {
    // Don't roll back the invitation — the manager can resend / copy the link.
    console.warn('[invitation] email send failed', send.error)
  }

  revalidatePath('/vendors/invitations')
  return { ok: true, data: { invitationId: row.id, token, link } }
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('vendor_onboarding_invitations' as never)
    .update({ status: 'revoked' } as never)
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/vendors/invitations')
  return { ok: true }
}

// ─── Token validation (used by public route + server-side checks) ────

export interface ValidatedInvitation {
  id: string
  organizationId: string
  inviteeEmail: string
  inviteeName: string | null
  expiresAt: string
}

// Uses the admin (service-role) client because the caller is anonymous
// (vendor following an email link, not authenticated). The token itself
// is the credential; this is why tokens are 32 random bytes.
export async function validateInvitationToken(
  token: string,
): Promise<
  | { ok: true; invitation: ValidatedInvitation }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'revoked' }
> {
  const db = createAdminClient()
  const { data } = await db
    .from('vendor_onboarding_invitations' as never)
    .select(
      'id, organization_id, invitee_email, invitee_name, status, expires_at',
    )
    .eq('token', token)
    .maybeSingle<{
      id: string
      organization_id: string
      invitee_email: string
      invitee_name: string | null
      status: InvitationStatus
      expires_at: string
    }>()

  if (!data) return { ok: false, reason: 'not_found' }
  if (data.status === 'submitted') return { ok: false, reason: 'consumed' }
  if (data.status === 'revoked') return { ok: false, reason: 'revoked' }
  if (data.status === 'expired') return { ok: false, reason: 'expired' }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    // Lazily mark it expired so the manager UI reflects reality.
    await db
      .from('vendor_onboarding_invitations' as never)
      .update({ status: 'expired' } as never)
      .eq('id', data.id)
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    invitation: {
      id: data.id,
      organizationId: data.organization_id,
      inviteeEmail: data.invitee_email,
      inviteeName: data.invitee_name,
      expiresAt: data.expires_at,
    },
  }
}

// ─── Email templates ─────────────────────────────────────────────────

function renderInvitationHtml(args: {
  orgName: string
  inviteeName: string | null
  link: string
}): string {
  const greeting = args.inviteeName ? `Hi ${escapeHtml(args.inviteeName)},` : 'Hi,'
  return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">${escapeHtml(args.orgName)} would like to onboard you as a vendor</h1>
  <p>${greeting}</p>
  <p>${escapeHtml(args.orgName)} uses HomeownerHub to manage their vendors. To complete your profile, please follow the link below and fill in your business details and compliance documents (COI, W-9, contractor license if applicable).</p>
  <p style="margin: 24px 0;">
    <a href="${args.link}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:600;">Start onboarding</a>
  </p>
  <p style="font-size: 12px; color: #666;">Or copy this link: <br><a href="${args.link}">${escapeHtml(args.link)}</a></p>
  <p style="font-size: 12px; color: #666;">This link is unique to you and expires in 7 days. If you weren't expecting this email you can safely ignore it.</p>
</body></html>`
}

function renderInvitationText(args: {
  orgName: string
  inviteeName: string | null
  link: string
}): string {
  const greeting = args.inviteeName ? `Hi ${args.inviteeName},` : 'Hi,'
  return `${args.orgName} would like to onboard you as a vendor.

${greeting}

${args.orgName} uses HomeownerHub to manage their vendors. To complete your profile, please follow the link below and fill in your business details and compliance documents (COI, W-9, contractor license if applicable).

Start onboarding: ${args.link}

This link is unique to you and expires in 7 days. If you weren't expecting this email you can safely ignore it.`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
