'use server'

/**
 * BL-110: the resident turns text messages on or off for themselves.
 *
 * Takes no user id: the subject is always the signed-in user, so nobody —
 * board, manager or admin viewing as a resident — can opt someone else
 * in. Viewing as a resident is refused outright.
 *
 * Turning texts on requires the evidence the page showed: the disclosure
 * version and SHA-256, and the fingerprint of the numbers listed. The
 * server rebuilds all three from the current org and the resident's own
 * rows and refuses on any mismatch (the wording or the numbers changed
 * since the page loaded). Turning texts off needs nothing and always
 * applies.
 *
 * Errors are friendly sentences; nothing here logs row values.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  SMS_DISCLOSURE_VERSION,
  disclosureHash,
  loadMyTextPhones,
  phonesFingerprint,
  setSmsOptIn,
} from './sms-consent'

export type SmsActionResult = { ok: true } | { ok: false; error: string }

const SAVE_FAILED = 'Couldn’t save your text preference. Try again.'
const STALE = 'This page is out of date — reload it, read the terms again, and try once more.'

export interface SmsOptInInput {
  agreed: boolean
  disclosureVersion: string
  disclosureSha256: string
  phonesFingerprint: string
}

function revalidate() {
  revalidatePath('/resident/account')
  revalidatePath('/resident')
}

async function signedInResident(): Promise<
  | { ok: true; orgId: string; orgName: string; userId: string; client: Awaited<ReturnType<typeof getSupabaseServerClient>> }
  | { ok: false; error: string }
> {
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: 'You’re viewing as this resident — only they can change this.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const client = await getSupabaseServerClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  return { ok: true, orgId: org.id, orgName: org.name, userId: user.id, client }
}

function friendly(error: 'read_failed' | 'write_failed' | 'audit_failed' | 'other_org'): string {
  if (error === 'other_org') return 'Your text preference is kept with another community on your account. Contact support to move it.'
  return SAVE_FAILED
}

/** Agree to texts. Every field must match what the server would show now. */
export async function optInToTexts(input: SmsOptInInput): Promise<SmsActionResult> {
  if (!input || input.agreed !== true) return { ok: false, error: 'Tick the box to agree before turning texts on.' }
  const who = await signedInResident()
  if (!who.ok) return who

  if (input.disclosureVersion !== SMS_DISCLOSURE_VERSION || input.disclosureSha256 !== disclosureHash(who.orgName)) {
    return { ok: false, error: STALE }
  }
  const phones = await loadMyTextPhones(who.client, who.orgId, who.userId)
  if (!phones.ok) return { ok: false, error: SAVE_FAILED }
  if (phones.phones.length === 0) {
    return { ok: false, error: 'There’s no mobile number on file for you yet. Add one under My contact details first.' }
  }
  if (input.phonesFingerprint !== phonesFingerprint(phones.phones)) return { ok: false, error: STALE }

  const res = await setSmsOptIn(who.client, createAdminClient(), {
    orgId: who.orgId,
    userId: who.userId,
    optIn: true,
    now: new Date(),
    evidence: { disclosureVersion: SMS_DISCLOSURE_VERSION, disclosureSha256: input.disclosureSha256, phones: phones.phones },
  })
  if (!res.ok) return { ok: false, error: friendly(res.error) }
  revalidate()
  return { ok: true }
}

/** Stop texts. One click, applies immediately, no questions. */
export async function optOutOfTexts(): Promise<SmsActionResult> {
  const who = await signedInResident()
  if (!who.ok) return who
  const res = await setSmsOptIn(who.client, createAdminClient(), {
    orgId: who.orgId,
    userId: who.userId,
    optIn: false,
    now: new Date(),
  })
  if (!res.ok) return { ok: false, error: friendly(res.error) }
  revalidate()
  return { ok: true }
}
