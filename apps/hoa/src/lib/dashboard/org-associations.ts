import { cache } from 'react'
import { ASSOCIATION_ZONE_COLUMNS, DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { primaryAssociationZone } from '@/lib/association-time-server'

/**
 * The dashboard's one read of an org's associations, shared per request
 * (BL-099 follow-up). KPIs, activity, approvals, stale approvals, next
 * meeting, lease, heat map and at-risk each used to read `associations`
 * for the same org on their own (eight round trips for one render). They
 * now all await the same promise.
 *
 * Columns are the union of what they need: id (lease, heat map, at-risk),
 * name + the zone columns (zone/today), lease_cap_pct (lease). Scoped by
 * organization_id exactly as each read was.
 *
 * SECURITY: the memo lives in a React `cache()` scope, i.e. one request.
 * It is never module-level, so nothing survives into another request, and
 * inside a request it is keyed by org id (and by client when a caller
 * passes its own, as ./cached.ts does with the admin client), so two orgs
 * never share a result. Outside a request `cache()` does not memoize, so
 * every call gets a fresh scope and reads for itself.
 *
 * Failure: the read's error is returned, not thrown or swallowed. Each
 * loader keeps its own handling (lease: failed flag; heat map / at-risk:
 * log and treat as no associations; zone readers: log and fall back to
 * America/New_York), so a failed read degrades each exactly as before.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any }

export type OrgAssociationRow = {
  id: string
  name: string | null
  state?: string | null
  timezone?: string | null
  lease_cap_pct: number | string | null
}

export type OrgAssociationsRead = {
  rows: OrgAssociationRow[]
  error: { code?: string; message?: string } | null
}

export const ORG_ASSOCIATION_COLUMNS = `id, name, lease_cap_pct, ${ASSOCIATION_ZONE_COLUMNS}`

export type AssociationsScope = {
  /** Reads through the request's own cookie-bound client, keyed by org id. */
  own: Map<string, Promise<OrgAssociationsRead>>
  /** Reads through a client the caller passed in, keyed by that client, then org id. */
  byClient: WeakMap<object, Map<string, Promise<OrgAssociationsRead>>>
}

/** A fresh, empty memo. Exported for tests; production code goes through `requestScope`. */
export function createScope(): AssociationsScope {
  return { own: new Map(), byClient: new WeakMap() }
}

const requestScope = cache(createScope)

async function fetchRows(client: AnyClient, orgId: string): Promise<OrgAssociationsRead> {
  const { data, error } = await client
    .from('associations')
    .select(ORG_ASSOCIATION_COLUMNS)
    .eq('organization_id', orgId)
  return { rows: (data ?? []) as OrgAssociationRow[], error: error ?? null }
}

export function readOrgAssociationsIn(
  scope: AssociationsScope,
  orgId: string,
  supabase: AnyClient,
  passedClient?: AnyClient,
): Promise<OrgAssociationsRead> {
  let memo = scope.own
  if (passedClient) {
    let m = scope.byClient.get(passedClient)
    if (!m) scope.byClient.set(passedClient, (m = new Map()))
    memo = m
  }
  let pending = memo.get(orgId)
  if (!pending) memo.set(orgId, (pending = fetchRows(supabase, orgId)))
  return pending
}

/**
 * @param supabase the resolved client to read with
 * @param passedClient the client the caller was handed, if any (undefined on the normal cookie-bound path)
 */
export function readOrgAssociations(
  orgId: string,
  supabase: AnyClient,
  passedClient?: AnyClient,
): Promise<OrgAssociationsRead> {
  return readOrgAssociationsIn(requestScope(), orgId, supabase, passedClient)
}

/**
 * Same answer and same log as `orgTimeZone` (association-time-server.ts),
 * from the shared read: a failed read, or no association, is Eastern.
 */
export async function dashboardOrgTimeZone(
  orgId: string,
  supabase: AnyClient,
  passedClient?: AnyClient,
): Promise<string> {
  const { rows, error } = await readOrgAssociations(orgId, supabase, passedClient)
  if (error) {
    console.error('[association-time] org zone read failed', { code: error.code })
    return DEFAULT_ASSOCIATION_TIME_ZONE
  }
  return primaryAssociationZone(rows)
}
