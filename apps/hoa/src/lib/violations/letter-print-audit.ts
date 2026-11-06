/**
 * The audit_log row written each time a board prints a violation's notice
 * (the print-yourself flow). Ids and a day only: never the letter text, a
 * name or an address. No migration: audit_log's action and entity_type are
 * free text, the same as the collections letter's print row.
 */

export const VIOLATION_LETTER_PRINTED = 'violation_letter_printed'
export const VIOLATION_LETTER_ENTITY = 'violation_letter'

export function violationLetterAuditRow(args: { orgId: string; userId: string; violationId: string; propertyId: string | null; letterDate: string }) {
  return {
    action: VIOLATION_LETTER_PRINTED,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: VIOLATION_LETTER_ENTITY,
    entity_id: args.violationId,
    metadata: { violation_id: args.violationId, property_id: args.propertyId, letter_date: args.letterDate },
  }
}
