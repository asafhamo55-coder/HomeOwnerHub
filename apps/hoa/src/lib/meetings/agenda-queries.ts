import 'server-only'

import { getCurrentOrg } from '@/lib/orgs'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { AgendaActionItem } from './agenda-template'

/**
 * What the agenda builder needs from the server: the association's state
 * and type, and the open action items. Board client, so RLS is the
 * boundary. A failed read gives empty values (the builder still works) and
 * logs a code only.
 */
export interface AgendaContext {
  state: string | null
  associationType: string | null
  openActionItems: AgendaActionItem[]
}

export async function loadAgendaContext(): Promise<AgendaContext> {
  const empty: AgendaContext = { state: null, associationType: null, openActionItems: [] }
  const [org, assoc] = await Promise.all([getCurrentOrg(), getPrimaryAssociation()])
  if (!org || !assoc) return empty
  const supabase = await getSupabaseServerClient()
  const [a, items] = await Promise.all([
    supabase.from('associations').select('state, type').eq('id', assoc.id).maybeSingle(),
    supabase
      .from('meeting_action_items' as never)
      .select('title, assignee_name, due_date' as never)
      .eq('org_id' as never, org.id)
      .in('status' as never, ['open', 'in_progress'])
      .order('due_date' as never, { ascending: true, nullsFirst: false })
      .limit(30),
  ])
  if (a.error) console.error('[agenda] association read failed', { code: a.error.code ?? null })
  if (items.error) console.error('[agenda] action items read failed', { code: items.error.code ?? null })
  const row = a.data as { state: string | null; type: string | null } | null
  const rows = (items.data ?? []) as unknown as Array<{ title: string; assignee_name: string | null; due_date: string | null }>
  return {
    state: row?.state ?? null,
    associationType: row?.type ?? null,
    openActionItems: rows.map((r) => ({ title: r.title, assignee: r.assignee_name, dueDate: r.due_date })),
  }
}
