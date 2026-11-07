import { readManagedBy } from './managed-by'

/** The slice of a Supabase client this needs, so tests can fake it. */
type Db = {
  from: (table: 'associations') => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>
        }
      }
    }
  }
}

/**
 * The "Managed by" line for the organization's first association (the same
 * one the letterhead and primary-association helpers use). A failed read or
 * a missing line is '' and the letter simply omits it: this line must never
 * block a notice from printing.
 */
export async function loadManagedByLine(db: unknown, orgId: string): Promise<string> {
  try {
    const res = await (db as Db)
      .from('associations')
      .select('compliance_settings')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(1)
    const rows = (res.data ?? []) as Array<{ compliance_settings: unknown }>
    return readManagedBy(rows[0]?.compliance_settings)
  } catch {
    return ''
  }
}
