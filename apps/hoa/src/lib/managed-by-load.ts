import { readManagedBy } from './managed-by'

/** The slice of a Supabase client this needs, so tests can fake it. */
interface Query extends PromiseLike<{ data: unknown; error: unknown }> {
  eq: (col: string, val: string) => Query
  order: (col: string, opts: { ascending: boolean }) => Query
  limit: (n: number) => Query
}
type Db = { from: (table: 'associations') => { select: (cols: string) => Query } }

/**
 * The "Managed by" line for one association.
 *
 * Pass `associationId` wherever the page or action knows which association
 * the letter is for: the line is then read from that association. Without it
 * the organization's first association by name is used (the same one the
 * letterhead and primary-association helpers use), which is right only for
 * pages that have no association of their own.
 *
 * A failed read or a missing line is '' and the letter simply omits it: this
 * line must never block a notice from printing.
 */
export async function loadManagedByLine(db: unknown, orgId: string, associationId?: string | null): Promise<string> {
  try {
    let q = (db as Db).from('associations').select('compliance_settings').eq('organization_id', orgId)
    q = associationId ? q.eq('id', associationId) : q.order('name', { ascending: true })
    const res = await q.limit(1)
    const rows = (res.data ?? []) as Array<{ compliance_settings: unknown }>
    return readManagedBy(rows[0]?.compliance_settings)
  } catch {
    return ''
  }
}
