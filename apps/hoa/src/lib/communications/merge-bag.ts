/**
 * Per-recipient merge bag construction for the send pipeline.
 *
 * Lives in its own module rather than inside send.ts because send.ts is a
 * `'use server'` file: every export there must be an async server action,
 * so a synchronous helper cannot be exported from it — and an un-exported
 * closure cannot be tested directly. Since the send path renders strictly
 * (`renderTemplateStrict` throws on any unsupplied field), the exact
 * contents of this bag decide whether a message goes out or is marked
 * `failed`. That is worth pinning with tests rather than approximating.
 */

import type { MergeBag } from './templates'

/** The subset of a persisted `communication_recipients` row the bag needs. */
export interface RecipientIdentity {
  email: string | null
  recipient_name: string | null
  unit_id: string | null
}

export interface BuildRecipientBagArgs {
  /** Caller-supplied fields shared by every recipient — e.g. the wizard's
   *  declared-question answers, built via buildMergeBag. */
  extraFields?: MergeBag
  recipient: RecipientIdentity
  associationName: string
  /** Per-recipient values keyed by recipient email. Dues reminders use
   *  this to give each owner their own charge table. */
  extraMergeFields?: Record<string, MergeBag>
}

/**
 * Build the flat bag `renderTemplateStrict` consumes for one recipient.
 *
 * Precedence, lowest to highest:
 *   1. `extraFields`      — shared across the whole campaign
 *   2. ambient fields     — owner_name, recipient_name, association_name, unit_id
 *   3. `extraMergeFields[recipient.email]` — this recipient's own values
 *
 * Ambient beats `extraFields` so a declared question cannot shadow
 * `{{association_name}}` and friends. Per-recipient beats ambient so a
 * caller that genuinely knows better — dues reminders supply their own
 * escaped `association_name` — can override for its campaign only.
 *
 * The per-recipient lookup is guarded on a truthy email: SMS and portal
 * recipients carry `email: null`, and an unguarded lookup would key every
 * one of them on the same `''` and hand them a stranger's merge data.
 */
export function buildRecipientBag({
  extraFields,
  recipient,
  associationName,
  extraMergeFields,
}: BuildRecipientBagArgs): MergeBag {
  return {
    ...extraFields,
    owner_name: recipient.recipient_name ?? 'Resident',
    recipient_name: recipient.recipient_name ?? 'Resident',
    association_name: associationName,
    unit_id: recipient.unit_id ?? '',
    ...(recipient.email ? (extraMergeFields?.[recipient.email] ?? {}) : {}),
  }
}
