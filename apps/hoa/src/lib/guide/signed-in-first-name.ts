import { cache } from 'react'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { firstNameOf } from './first-name'

/**
 * The signed-in user's first name from their profile, for the help drawer
 * greeting. Memoized per request. A failed read only costs the greeting (the
 * drawer falls back to "Help"), so errors and throws yield null. Never the email.
 */
export const getSignedInFirstName = cache(async (userId: string): Promise<string | null> => {
  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle<{ full_name: string | null }>()
    return error ? null : firstNameOf(data?.full_name)
  } catch {
    // A greeting is never worth failing the layout for.
    return null
  }
})
