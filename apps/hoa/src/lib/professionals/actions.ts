'use server'

// BL-168 — professional and officer actions (migration 0070, M6_APPLIED).
//
// Board side: invite / renew / revoke a professional, assign matters,
// officer titles (admin), the dual-control amount. Writes go through the
// caller's own RLS client (0070 lets board/admin write cpa and attorney
// rows and matter_assignments); the service role is used only to create
// the auth user and to write audit rows.
//
// Professional side: every contribution becomes an approval_requests row
// (action_type pro.*, proposed_by the caller) for the board to approve.
// Access is proven by READING the thing through the caller's own RLS
// client first (an expired or unassigned professional reads nothing), so
// the service-role insert never trusts a client-supplied id.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { fetchOrgSandbox, guardRecipients } from '@homeowner-portal/observability/outbound-guard'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { appUrl } from '@/lib/app-origin'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { createdByThisCall } from '@/lib/owner-invites'
import { getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ATTACHMENT_ALLOWED_TYPES, ATTACHMENT_BUCKET, ATTACHMENT_MAX_BYTES } from '@/lib/attachment-rules'
import { NOT_LIVE, NOT_SIGNED_IN, requireProfessionalForAction, type ActionResult } from './guard'
import { writeProAudit } from './audit'
import {
  EntryPayloadSchema,
  InviteProfessionalSchema,
  LetterPayloadSchema,
  MatterRefSchema,
  NotePayloadSchema,
  PRO_ACTIONS,
  PRO_AUDIT,
  PRO_SUBJECT,
  PRO_WORKFLOW,
  ReviewPayloadSchema,
  entryProblem,
  entryTotal,
  expiryProblem,
  readOfficerTitle,
  type InviteProfessionalInput,
  type MatterRef,
  type OfficerTitle,
  type ProAction,
} from './model'

// The M6 tables and columns are not in the generated Database types until
// gen:types runs after prod has 0070 (CLAUDE.md footgun 3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function revalidateAll(): void {
  revalidatePath('/settings/professionals')
  revalidatePath('/approvals')
  revalidatePath('/pro', 'layout')
}

/** End of the chosen day (UTC). The grant is "no access" the instant it passes. */
const endOfDay = (isoDate: string) => `${isoDate}T23:59:59Z`

// ─── board: invite, renew, revoke ────────────────────────────────────

export async function inviteProfessional(
  input: InviteProfessionalInput,
): Promise<ActionResult<{ userId: string | null }>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  const parsed = InviteProfessionalSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.')
  const v = parsed.data
  const user = await getSignedInUser()
  if (!user) return fail(NOT_SIGNED_IN)

  const admin = createAdminClient()
  const today = todayIn(await orgTimeZone(admin, gate.orgId))
  const problem = expiryProblem(v.expiresOn, today)
  if (problem) return fail(problem)

  // Outbound guard (BL-135), as for a member invite: a held address gets
  // neither the account nor the email.
  const orgSandbox = await fetchOrgSandbox(admin, gate.orgId)
  const guard = guardRecipients('email', [v.email], (e) => e, { orgSandbox, ref: `invite_pro:${gate.orgId}` })
  if (guard.allowed.length === 0) {
    return fail('Sending is switched off for this address (test or sandbox mode), so no invitation was sent.')
  }

  const startedAt = Date.now()
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(v.email, {
    redirectTo: appUrl('/auth/callback'),
    data: v.fullName ? { full_name: v.fullName } : undefined,
  })
  let userId: string
  let isNew = false
  if (inviteErr || !invited?.user) {
    // SEC-N4 as for members: an existing account is not pulled into this
    // HOA, and the answer is the same as for a fresh invitation.
    return { ok: true, data: { userId: null } }
  }
  userId = invited.user.id
  isNew = createdByThisCall(invited.user, startedAt)
  if (isNew) {
    await admin.from('profiles').upsert({ id: userId, email: v.email, full_name: v.fullName ?? null } as never)
  }

  const supabase = await getSupabaseServerClient()
  const { error: memberErr } = await (supabase as Loose).from('org_members').insert({
    org_id: gate.orgId,
    user_id: userId,
    role: v.role,
    invited_at: new Date().toISOString(),
    access_expires_at: endOfDay(v.expiresOn),
    general_counsel: v.role === 'attorney' && v.generalCounsel,
  })
  if (memberErr) {
    // A unique violation means they already belong to this HOA: no role change from here.
    return fail(memberErr.code === '23505' ? 'That person is already a member of this HOA.' : 'Couldn’t add that person. Try again.')
  }

  let assigned = 0
  for (const m of v.matters) {
    const r = await assignInternal(supabase, gate.orgId, userId, m)
    if (r) assigned += 1
  }

  await writeProAudit(admin, {
    orgId: gate.orgId,
    userId: user.id,
    action: PRO_AUDIT.granted,
    entityType: 'org_member',
    entityId: userId,
    metadata: { role: v.role, expires_on: v.expiresOn, general_counsel: v.generalCounsel, matters: assigned },
  })
  revalidateAll()
  return { ok: true, data: { userId } }
}

export async function renewProfessional(userId: string, expiresOn: string): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('That person isn’t valid.')
  const admin = createAdminClient()
  const today = todayIn(await orgTimeZone(admin, gate.orgId))
  const problem = expiryProblem(expiresOn, today)
  if (problem) return fail(problem)
  const supabase = await getSupabaseServerClient()
  const { data, error } = await (supabase as Loose)
    .from('org_members')
    .update({ access_expires_at: endOfDay(expiresOn) })
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
    .in('role', ['cpa', 'attorney'])
    .select('user_id')
  if (error) return fail('Couldn’t renew access. Try again.')
  if (!data || data.length === 0) return fail('We couldn’t find that professional.')
  const user = await getSignedInUser()
  await writeProAudit(admin, {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.renewed,
    entityType: 'org_member',
    entityId: userId,
    metadata: { expires_on: expiresOn },
  })
  revalidateAll()
  return { ok: true, data: undefined }
}

export async function revokeProfessional(userId: string): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('That person isn’t valid.')
  const supabase = (await getSupabaseServerClient()) as Loose
  // Close their matters first, then the grant itself: access ends now.
  await supabase
    .from('matter_assignments')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', gate.orgId)
    .eq('user_id', userId)
    .is('revoked_at', null)
  const { data, error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
    .in('role', ['cpa', 'attorney'])
    .select('user_id')
  if (error) return fail('Couldn’t remove access. Try again.')
  if (!data || data.length === 0) return fail('We couldn’t find that professional.')
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.revoked,
    entityType: 'org_member',
    entityId: userId,
  })
  revalidateAll()
  return { ok: true, data: undefined }
}

export async function setGeneralCounsel(userId: string, on: boolean): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('That person isn’t valid.')
  const supabase = (await getSupabaseServerClient()) as Loose
  const { data, error } = await supabase
    .from('org_members')
    .update({ general_counsel: on })
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
    .eq('role', 'attorney')
    .select('user_id')
  if (error || !data || data.length === 0) return fail('Couldn’t change that. Try again.')
  revalidateAll()
  return { ok: true, data: undefined }
}

// ─── board: matters ──────────────────────────────────────────────────

async function assignInternal(supabase: unknown, orgId: string, userId: string, m: MatterRef): Promise<boolean> {
  const { error } = await (supabase as Loose).from('matter_assignments').insert({
    organization_id: orgId,
    user_id: userId,
    matter_type: m.type,
    matter_id: m.id,
  })
  // 23505: already assigned. 23503: not an attorney here / not this HOA's matter.
  return !error || error.code === '23505'
}

export async function assignMatter(userId: string, matter: MatterRef): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  const ref = MatterRefSchema.safeParse(matter)
  if (!ref.success || !/^[0-9a-f-]{36}$/i.test(userId)) return fail('That matter isn’t valid.')
  const supabase = await getSupabaseServerClient()
  const ok = await assignInternal(supabase, gate.orgId, userId, ref.data)
  if (!ok) return fail('Couldn’t assign that matter. Check that the person is an attorney and the matter is this HOA’s.')
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.matterAssigned,
    entityType: ref.data.type,
    entityId: ref.data.id,
    metadata: { assignee: userId },
  })
  revalidateAll()
  return { ok: true, data: undefined }
}

export async function unassignMatter(assignmentId: string): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) return fail('That assignment isn’t valid.')
  const supabase = (await getSupabaseServerClient()) as Loose
  const { data, error } = await supabase
    .from('matter_assignments')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('organization_id', gate.orgId)
    .is('revoked_at', null)
    .select('matter_type, matter_id')
  if (error || !data || data.length === 0) return fail('Couldn’t remove that assignment.')
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.matterUnassigned,
    entityType: data[0].matter_type,
    entityId: data[0].matter_id,
  })
  revalidateAll()
  return { ok: true, data: undefined }
}

// ─── board: officer titles, dual control ─────────────────────────────

export async function setOfficerTitle(userId: string, title: OfficerTitle | null): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (gate.role !== 'admin') return fail('Only admins can set officer titles.')
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('That person isn’t valid.')
  if (title !== null && readOfficerTitle(title) === null) return fail('Pick a title from the list.')
  const supabase = (await getSupabaseServerClient()) as Loose
  if (title && title !== 'director') {
    // One person per office; Directors can be several.
    const { data: held, error: heldErr } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', gate.orgId)
      .eq('officer_title', title)
      .neq('user_id', userId)
    if (heldErr) return fail('Couldn’t check the title. Try again.')
    if ((held ?? []).length > 0) return fail('Another member already holds that title. Clear theirs first.')
  }
  const { data, error } = await supabase
    .from('org_members')
    .update({ officer_title: title })
    .eq('org_id', gate.orgId)
    .eq('user_id', userId)
    .eq('role', 'board')
    .select('user_id')
  if (error) return fail('Couldn’t save the title. Try again.')
  if (!data || data.length === 0) return fail('Titles are for board members.')
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.titleSet,
    entityType: 'org_member',
    entityId: userId,
    metadata: { title },
  })
  revalidateAll()
  revalidatePath('/settings/members')
  return { ok: true, data: undefined }
}

/** The amount (dollars) above which a money approval needs two board members; null clears it. */
export async function setDualControlAmount(dollars: number | null): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return gate
  if (!M6_APPLIED) return fail(NOT_LIVE)
  if (dollars !== null && (!Number.isFinite(dollars) || dollars <= 0 || dollars > 10_000_000)) {
    return fail('Enter an amount between $1 and $10,000,000, or leave it blank for none.')
  }
  const cents = dollars === null ? null : Math.round(dollars * 100)
  const supabase = (await getSupabaseServerClient()) as Loose
  const { error } = await supabase.from('associations').update({ dual_control_cents: cents }).eq('organization_id', gate.orgId)
  if (error) return fail('Couldn’t save the amount. Try again.')
  const user = await getSignedInUser()
  await writeProAudit(createAdminClient(), {
    orgId: gate.orgId,
    userId: user?.id ?? null,
    action: PRO_AUDIT.dualControlSet,
    entityType: 'org',
    entityId: gate.orgId,
    metadata: { cents },
  })
  revalidateAll()
  return { ok: true, data: undefined }
}

// ─── professionals: proposals ────────────────────────────────────────

interface Submission {
  orgId: string
  userId: string
  role: 'cpa' | 'attorney'
  action: ProAction
  payload: unknown
  summary: string
  amount: number | null
  matter?: MatterRef
}

/** Insert the proposal (service role; users have no insert policy) and audit it. */
async function submit(s: Submission): Promise<ActionResult<{ id: string }>> {
  const admin = createAdminClient() as Loose
  const { data, error } = await admin
    .from('approval_requests')
    .insert({
      organization_id: s.orgId,
      workflow_id: PRO_WORKFLOW,
      action_type: s.action,
      subject_type: PRO_SUBJECT,
      subject_id: randomUUID(),
      payload: s.payload,
      summary: s.summary,
      amount: s.amount,
      proposed_by: s.userId,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Couldn’t send that to the board. Try again.')
  await writeProAudit(admin, {
    orgId: s.orgId,
    userId: s.userId,
    action: PRO_AUDIT.proposed,
    entityType: 'approval_request',
    entityId: data.id,
    metadata: { action_type: s.action, role: s.role, matter_type: s.matter?.type ?? null },
  })
  revalidatePath('/approvals')
  revalidatePath('/pro/submissions')
  return { ok: true, data: { id: data.id } }
}

/** Can the caller read this matter through RLS (assigned, grant active)? */
async function canReadMatter(m: MatterRef): Promise<boolean | 'error'> {
  const table = m.type === 'collections_case' ? 'collection_cases' : m.type === 'violation' ? 'hoa_violations' : 'tickets'
  const supabase = (await getSupabaseServerClient()) as Loose
  const { data, error } = await supabase.from(table).select('id').eq('id', m.id).maybeSingle()
  if (error) return 'error'
  return Boolean(data)
}

export async function cpaMarkPeriodReviewed(input: { fiscalPeriodId: string; note: string }): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProfessionalForAction(['cpa'])
  if (!gate.ok) return gate
  const parsed = ReviewPayloadSchema.safeParse({ version: 1, kind: 'review', ...input })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.')
  const supabase = (await getSupabaseServerClient()) as Loose
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('id', parsed.data.fiscalPeriodId)
    .maybeSingle()
  if (error) return fail('Couldn’t check the period. Try again.')
  if (!data) return fail('We couldn’t find that period.')
  return submit({
    orgId: gate.orgId,
    userId: gate.userId,
    role: 'cpa',
    action: PRO_ACTIONS.review,
    payload: parsed.data,
    summary: `CPA review: fiscal year ${String(data.start_date).slice(0, 4)}`,
    amount: null,
  })
}

export async function cpaProposeEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProfessionalForAction(['cpa'])
  if (!gate.ok) return gate
  const parsed = EntryPayloadSchema.safeParse({ version: 1, kind: 'entry', ...(input as object) })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.')
  const p = parsed.data
  const unbalanced = entryProblem(p.lines)
  if (unbalanced) return fail(unbalanced)
  const supabase = (await getSupabaseServerClient()) as Loose
  const [period, accounts, funds] = await Promise.all([
    supabase.from('fiscal_periods').select('id, association_id, start_date, end_date, status').eq('id', p.fiscalPeriodId).maybeSingle(),
    supabase.from('chart_of_accounts').select('id, association_id').in('id', [...new Set(p.lines.map((l) => l.accountId))]),
    supabase.from('funds').select('id, association_id').in('id', [...new Set(p.lines.map((l) => l.fundId))]),
  ])
  if (period.error || accounts.error || funds.error) return fail('Couldn’t check the books. Try again.')
  const per = period.data
  if (!per || per.association_id !== p.associationId) return fail('We couldn’t find that period.')
  if (per.status !== 'open') return fail('That fiscal period is closed. Ask the board to reopen it.')
  if (p.entryDate < per.start_date || p.entryDate > per.end_date) return fail('The entry date must fall inside the fiscal period.')
  const sameAssoc = (rows: Array<{ association_id: string }> | null, n: number) =>
    (rows ?? []).filter((r) => r.association_id === p.associationId).length === n
  if (!sameAssoc(accounts.data, new Set(p.lines.map((l) => l.accountId)).size)) return fail('An account in the entry isn’t in this association.')
  if (!sameAssoc(funds.data, new Set(p.lines.map((l) => l.fundId)).size)) return fail('A fund in the entry isn’t in this association.')
  const total = entryTotal(p.lines)
  return submit({
    orgId: gate.orgId,
    userId: gate.userId,
    role: 'cpa',
    action: PRO_ACTIONS.entry,
    payload: p,
    summary: `Adjusting entry from the CPA, ${p.lines.length} lines`,
    amount: total,
  })
}

export async function attorneyAddNote(input: { matter: MatterRef; body: string; advice?: boolean }): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProfessionalForAction(['attorney'])
  if (!gate.ok) return gate
  const parsed = NotePayloadSchema.safeParse({ version: 1, kind: 'note', advice: false, ...input })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.')
  const can = await canReadMatter(parsed.data.matter)
  if (can === 'error') return fail('Couldn’t check the matter. Try again.')
  if (!can) return fail('That matter isn’t assigned to you.')
  return submit({
    orgId: gate.orgId,
    userId: gate.userId,
    role: 'attorney',
    action: PRO_ACTIONS.note,
    payload: parsed.data,
    summary: parsed.data.advice ? 'Attorney advice on a matter' : 'Attorney note on a matter',
    amount: null,
    matter: parsed.data.matter,
  })
}

export async function attorneyDraftLetter(input: { matter: MatterRef; subject: string; body: string }): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProfessionalForAction(['attorney'])
  if (!gate.ok) return gate
  const parsed = LetterPayloadSchema.safeParse({ version: 1, kind: 'letter', ...input })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.')
  const can = await canReadMatter(parsed.data.matter)
  if (can === 'error') return fail('Couldn’t check the matter. Try again.')
  if (!can) return fail('That matter isn’t assigned to you.')
  return submit({
    orgId: gate.orgId,
    userId: gate.userId,
    role: 'attorney',
    action: PRO_ACTIONS.letter,
    payload: parsed.data,
    summary: 'Draft letter from the attorney',
    amount: null,
    matter: parsed.data.matter,
  })
}

export async function attorneyUploadDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProfessionalForAction(['attorney'])
  if (!gate.ok) return gate
  const matter = MatterRefSchema.safeParse({ type: formData.get('matterType'), id: formData.get('matterId') })
  const file = formData.get('file')
  if (!matter.success) return fail('That matter isn’t valid.')
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file.')
  if (file.size > ATTACHMENT_MAX_BYTES) return fail('The file is over the 10 MB limit.')
  if (!ATTACHMENT_ALLOWED_TYPES.has(file.type)) return fail('That file type isn’t supported. Use PDF, an image, Word or Excel.')
  const can = await canReadMatter(matter.data)
  if (can === 'error') return fail('Couldn’t check the matter. Try again.')
  if (!can) return fail('That matter isn’t assigned to you.')

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'file'
  const storagePath = `${gate.orgId}/pro/${matter.data.type}/${matter.data.id}/${randomUUID()}-${safeName}`
  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (upErr) return fail('Couldn’t upload the file. Try again.')
  const res = await submit({
    orgId: gate.orgId,
    userId: gate.userId,
    role: 'attorney',
    action: PRO_ACTIONS.attachment,
    payload: {
      version: 1,
      kind: 'attachment',
      matter: matter.data,
      storagePath,
      fileName: file.name.slice(0, 200),
      sizeBytes: file.size,
      mime: file.type,
    },
    summary: 'Document from the attorney',
    amount: null,
    matter: matter.data,
  })
  if (!res.ok) await admin.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
  return res
}
