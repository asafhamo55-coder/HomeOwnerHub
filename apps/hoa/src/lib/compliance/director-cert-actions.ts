'use server'

// BL-139: the board's writes to the FL director certification tracker.
// The rule, the storage and the day math: ./director-certs.ts.
//
// Board/admin only: every action re-checks the role first
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The member must be a current board/admin member of the
// caller's org, and the org must have a Florida association.
//
// Audit: one audit_log row per write (best effort, like vendor rejection),
// ids only — the member's user id, the association id and the actor's
// role. No dates, names or document links in the row or in any log.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  directorCertAssociation,
  isAllowedDocumentUrl,
  isYmd,
  readDirectorCerts,
  signDirectorCert,
  withDirectorCert,
  type DirectorCert,
} from './director-certs'

export type DirectorCertResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAVE_FAILED = 'Couldn’t save. Try again.'

type AssocRow = {
  id: string
  name: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

type Gate = { orgId: string; role: 'admin' | 'board' }

/**
 * Shared write: membership check, Florida association, read-modify-write
 * of compliance_settings with a freshly signed record, then the audit row.
 * `build` gets the existing verified record (or null) and today's date.
 */
async function writeDirectorCert(
  gate: Gate,
  memberId: string,
  action: 'director_certification.recorded' | 'director_certification.marked_certified',
  build: (existing: DirectorCert | null, todayYmd: string) => Omit<DirectorCert, 'updatedAt' | 'updatedBy'> | { error: string; fieldErrors?: Record<string, string> },
): Promise<DirectorCertResult> {
  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This can’t be saved on this server yet. Contact support.' }

  // Service role only for the membership lookup (org_members RLS hides
  // other members from the board's client); the write itself is RLS-bound.
  const { data: member, error: memberErr } = await createAdminClient()
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', gate.orgId)
    .eq('user_id', memberId)
    .maybeSingle()
  if (memberErr) return { ok: false, error: SAVE_FAILED }
  const role = (member as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'board') return { ok: false, error: 'That person isn’t on the board of this HOA.' }

  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'director cert association',
    supabase
      .from('associations')
      .select('id, name, state, governing_law_state, compliance_settings')
      .eq('organization_id', gate.orgId),
  )
  if (!res.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const rows = (res.data ?? []) as AssocRow[]
  const picked = directorCertAssociation(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      governingLawState: r.governing_law_state,
      complianceSettings: r.compliance_settings,
    })),
  )
  if (!picked) return { ok: false, error: 'Director certification applies to Florida associations only.' }

  const todayYmd = todayIn(await currentTimeZone())
  const existing = readDirectorCerts(picked.id, picked.complianceSettings, secret).get(memberId) ?? null
  const built = build(existing, todayYmd)
  if ('error' in built) return { ok: false, error: built.error, ...(built.fieldErrors ? { fieldErrors: built.fieldErrors } : {}) }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = signDirectorCert(
    picked.id,
    memberId,
    { ...built, updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withDirectorCert(picked.complianceSettings, memberId, stored) as never })
    .eq('id', picked.id)
    .eq('organization_id', gate.orgId)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code and ids only: a Postgres message can embed row values (RC-2).
    console.error('[director-certs] save failed', { code: error?.code ?? 'no_rows', associationId: picked.id })
    return { ok: false, error: SAVE_FAILED }
  }

  try {
    const { error: auditError } = await supabase.from('audit_log').insert({
      org_id: gate.orgId,
      user_id: user?.id ?? null,
      action,
      entity_type: 'org_member',
      entity_id: memberId,
      metadata: { association_id: picked.id, actor_role: gate.role },
    } as never)
    if (auditError) console.error('[director-certs] audit failed', { code: auditError.code, associationId: picked.id })
  } catch {
    console.error('[director-certs] audit failed', { code: 'thrown', associationId: picked.id })
  }

  revalidatePath('/')
  revalidatePath('/settings/members')
  revalidatePath('/settings/handover')
  return { ok: true }
}

/** Record or correct a director's election date, certificate date and document link. */
export async function saveDirectorCertification(input: {
  memberId: string
  electedOn: string
  certifiedOn: string | null
  documentUrl: string | null
}): Promise<DirectorCertResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.memberId !== 'string' || !UUID.test(input.memberId)) return { ok: false, error: 'Invalid input.' }
  const certifiedOn = typeof input.certifiedOn === 'string' && input.certifiedOn.trim() ? input.certifiedOn.trim() : null
  const documentUrl = typeof input.documentUrl === 'string' && input.documentUrl.trim() ? input.documentUrl.trim() : null
  const electedOn = typeof input.electedOn === 'string' ? input.electedOn.trim() : ''

  return writeDirectorCert({ orgId: gate.orgId, role: gate.role }, input.memberId, 'director_certification.recorded', (_existing, today) => {
    const fieldErrors: Record<string, string> = {}
    if (!isYmd(electedOn)) fieldErrors.electedOn = 'Enter the date they were elected or appointed.'
    else if (electedOn > today) fieldErrors.electedOn = 'The election date can’t be in the future.'
    if (certifiedOn !== null && !isYmd(certifiedOn)) fieldErrors.certifiedOn = 'Enter a valid date.'
    else if (certifiedOn !== null && certifiedOn > today) fieldErrors.certifiedOn = 'The certificate date can’t be in the future.'
    if (documentUrl !== null && !isAllowedDocumentUrl(documentUrl)) {
      fieldErrors.documentUrl = 'Use an https:// link or a link to a page under Documents.'
    }
    if (Object.keys(fieldErrors).length > 0) return { error: 'Check the highlighted fields.', fieldErrors }
    return { electedOn, certifiedOn, documentUrl }
  })
}

/** "Mark certified": today's date as the certificate date. Needs an election date on record. */
export async function markDirectorCertified(input: { memberId: string }): Promise<DirectorCertResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.memberId !== 'string' || !UUID.test(input.memberId)) return { ok: false, error: 'Invalid input.' }
  return writeDirectorCert(
    { orgId: gate.orgId, role: gate.role },
    input.memberId,
    'director_certification.marked_certified',
    (existing, today) => {
      if (!existing) return { error: 'Record the date they were elected or appointed first.' }
      return { electedOn: existing.electedOn, certifiedOn: today, documentUrl: existing.documentUrl }
    },
  )
}
