'use server'

// Form-facing server actions for the platform-admin tree. They validate
// per field (so a form can put the message under the field that caused
// it), then delegate to the audited writers in lib/platform-admin.ts,
// which re-validate and own the authz check (requirePlatformAdmin) and
// the audit log. Nothing here bypasses those writers.

import { z } from 'zod'
import { createTenant, inviteOrPromotePlatformAdmin, updateTenant } from '@/lib/platform-admin'
import { US_STATE_CODES } from '@/lib/us-states'

export type FieldErrors = Partial<Record<string, string>>

export type FormResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: FieldErrors; error?: string }

const PLANS = ['free', 'pro', 'enterprise'] as const

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

/** "1,250" → 1250; '' → null; anything else non-numeric → NaN (an error). */
function doors(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[,\s]/g, '')
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN
}

function collect(issues: z.ZodIssue[]): FieldErrors {
  const out: FieldErrors = {}
  for (const i of issues) {
    const key = String(i.path[0] ?? '')
    if (key && !out[key]) out[key] = i.message
  }
  return out
}

const nameField = z
  .string()
  .min(2, 'Enter at least 2 characters.')
  .max(200, 'Keep it under 200 characters.')
const doorsField = z
  .number({ invalid_type_error: 'Enter a whole number.' })
  .int('Enter a whole number.')
  .min(0, 'Can’t be negative.')
  .nullable()
  .refine((n) => n === null || Number.isFinite(n), 'Enter a whole number, like 125.')

const CreateSchema = z.object({
  name: nameField,
  plan: z.enum(PLANS, { errorMap: () => ({ message: 'Pick a plan.' }) }),
  doors_count: doorsField,
  association_name: nameField,
  state: z.string().refine((s) => US_STATE_CODES.includes(s), 'Pick a US state.'),
  association_type: z.enum(['hoa', 'condo', 'coop'], { errorMap: () => ({ message: 'Pick a type.' }) }),
  invite_admin_email: z.union([z.literal(''), z.string().email('Enter a valid email address.')]),
})

export async function createTenantFromForm(fd: FormData): Promise<FormResult<{ orgId: string }>> {
  const parsed = CreateSchema.safeParse({
    name: str(fd, 'name'),
    plan: str(fd, 'plan') || 'free',
    doors_count: doors(str(fd, 'doors_count')),
    association_name: str(fd, 'association_name'),
    state: str(fd, 'state'),
    association_type: str(fd, 'association_type') || 'hoa',
    invite_admin_email: str(fd, 'invite_admin_email'),
  })
  if (!parsed.success) return { ok: false, fieldErrors: collect(parsed.error.issues) }
  const d = parsed.data
  const result = await createTenant({
    name: d.name,
    plan: d.plan,
    doorsCount: d.doors_count,
    associationName: d.association_name,
    state: d.state,
    associationType: d.association_type,
    inviteAdminEmail: d.invite_admin_email || null,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { orgId: result.data.orgId } }
}

const UpdateSchema = z.object({
  name: nameField,
  plan: z.enum(PLANS, { errorMap: () => ({ message: 'Pick a plan.' }) }),
  doors_count: doorsField,
})

export async function updateTenantFromForm(orgId: string, fd: FormData): Promise<FormResult> {
  const parsed = UpdateSchema.safeParse({
    name: str(fd, 'name'),
    plan: str(fd, 'plan'),
    doors_count: doors(str(fd, 'doors_count')),
  })
  if (!parsed.success) return { ok: false, fieldErrors: collect(parsed.error.issues) }
  const result = await updateTenant({
    orgId,
    name: parsed.data.name,
    plan: parsed.data.plan,
    doorsCount: parsed.data.doors_count,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: undefined }
}

const InviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  note: z.string().max(200, 'Keep the note under 200 characters.'),
})

export async function invitePlatformAdminFromForm(
  fd: FormData,
): Promise<FormResult<{ email: string; alreadyExisted: boolean }>> {
  const parsed = InviteSchema.safeParse({ email: str(fd, 'email').toLowerCase(), note: str(fd, 'note') })
  if (!parsed.success) return { ok: false, fieldErrors: collect(parsed.error.issues) }
  const result = await inviteOrPromotePlatformAdmin(parsed.data.email, parsed.data.note || null)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { email: parsed.data.email, alreadyExisted: result.data.alreadyExisted } }
}
