// Org ownership of a client-supplied id, for SERVER ACTIONS (R-18).
//
// A server action is a public POST endpoint: any id it receives came from
// the browser. Before an action hands that id to a workflow or the service
// role (which bypass RLS), it must prove the row belongs to the caller's
// org. requireOrgOwned (lib/api/auth.ts) is the route form — it throws the
// 404 envelope; an action has no envelope, so this returns a verdict and
// the action turns it into its own fixed error string.
//
// The read is the caller's RLS-scoped client AND an explicit org filter,
// so a row in another org the user also belongs to is still refused.
// A malformed id is `not_found` without a query. Ids only in logs.

import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export type OrgOwnership = 'owned' | 'not_found' | 'error'

interface LooseQuery {
  select(cols: string): LooseQuery
  eq(col: string, value: unknown): LooseQuery
  limit(n: number): LooseQuery
  maybeSingle(): PromiseLike<{ data: unknown; error: { code?: string } | null }>
}

const Uuid = z.string().uuid()

export async function checkOrgOwned(
  table: string,
  id: unknown,
  orgId: string,
  opts: { orgColumn?: 'organization_id' | 'org_id'; column?: string } = {},
): Promise<OrgOwnership> {
  const column = opts.column ?? 'id'
  if (column === 'id' ? !Uuid.safeParse(id).success : typeof id !== 'string' || id.length === 0) {
    return 'not_found'
  }
  const supabase = (await getSupabaseServerClient()) as unknown as { from(t: string): LooseQuery }
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq(column, id)
    .eq(opts.orgColumn ?? 'organization_id', orgId)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[org-owned] lookup failed', { table, code: error.code ?? 'unknown', orgId })
    return 'error'
  }
  return data ? 'owned' : 'not_found'
}
