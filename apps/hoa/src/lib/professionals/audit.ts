// BL-168 — audit rows for professional access. Ids and codes only: never an
// address, a name, an email, a note body or an amount. Best effort: a
// failed write is logged (code only) and never undoes the action, except
// where a caller chooses to refuse (the matter and accounting views).

interface AuditInsert {
  from(table: 'audit_log'): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }>
  }
}

export interface AuditRow {
  orgId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  /** Ids, enum codes and counts. Nothing typed by a person. */
  metadata?: Record<string, string | number | boolean | null>
}

export async function writeProAudit(db: unknown, row: AuditRow): Promise<boolean> {
  const { error } = await (db as AuditInsert).from('audit_log').insert({
    org_id: row.orgId,
    user_id: row.userId,
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId,
    metadata: row.metadata ?? {},
  })
  if (error) {
    console.warn('[professionals] audit write failed', { action: row.action, code: error.code ?? 'error' })
    return false
  }
  return true
}
