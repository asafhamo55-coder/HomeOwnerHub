'use server'

/**
 * The resident chooses the language their messages arrive in.
 *
 * Takes no user id: the subject is always the signed-in user, and viewing
 * as a resident is refused, so nobody can set someone else's language. The
 * write goes through the resident's own RLS-bound client.
 */
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { parseLanguage, saveMyLanguage } from './language-preference'

export type LanguageActionResult = { ok: true } | { ok: false; error: string }

export async function setMyLanguage(language: unknown): Promise<LanguageActionResult> {
  const parsed = parseLanguage(language)
  if (!parsed) return { ok: false, error: 'Choose English or Español.' }
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: 'You’re viewing as this resident — only they can change this.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const client = await getSupabaseServerClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const res = await saveMyLanguage(client, { orgId: org.id, userId: user.id, language: parsed, now: new Date() })
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.error === 'other_org'
          ? 'Your message preferences are kept with another community on your account. Contact support to move them.'
          : 'Couldn’t save your language. Try again.',
    }
  }
  revalidatePath('/resident/account')
  return { ok: true }
}
