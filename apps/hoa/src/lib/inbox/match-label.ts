/**
 * Plain-English wording for how an email was filed under a home. The
 * thread's `match_reason.rule` is a MatchRule code (lib/inbox/match.ts);
 * the property rail used to print it raw ("Matched via resident_email").
 * Pure, so the rail's copy is unit-tested without a DOM.
 */

const RULE_LABEL: Record<string, string> = {
  thread_continuity: 'an earlier email in this conversation',
  sender_alias: 'a sender address saved for this home',
  resident_email: 'the sender’s email on file for a resident',
  resident_email_ambiguous: 'a resident email that more than one home has on file',
  address_in_body: 'the address in the email',
  sender_name: 'the sender’s name',
}

/** "the sender’s email on file for a resident"; null when there is no usable rule. */
export function matchRuleLabel(rule: unknown): string | null {
  return typeof rule === 'string' && Object.prototype.hasOwnProperty.call(RULE_LABEL, rule) ? RULE_LABEL[rule] : null
}

/** The rail's one-line provenance under a filed thread's address. */
export function filedByLine(rule: unknown, matchSource: string | null | undefined): string {
  if (matchSource === 'manual') return 'Filed here by hand'
  const label = matchRuleLabel(rule)
  return label ? `Matched by ${label}` : 'Filed under this home'
}
