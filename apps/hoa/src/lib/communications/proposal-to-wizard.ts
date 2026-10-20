/**
 * BL-102 A2: map the one-box composer's proposal onto the announcement
 * wizard's existing fields (audience, channels, subject, body, schedule).
 *
 * Pure and client-safe. It only fills fields: the wizard then shows them on
 * its usual steps, the board reviews and edits them, and nothing goes out
 * until the board presses Send. The wizard's own validation, audience
 * resolution, preference checks and the outbound guard all run exactly as
 * for a hand-written message.
 */

import type { CommProposal } from '@homeowner-portal/workflows/W31-propose'
import { plainTextToHtml } from './plain-text'
import { defaultChannels, type Urgency } from './channel-defaults'
import { matchStreet, type StreetOption } from './streets'

/** The audience kinds the proposal can pick, all existing wizard kinds. */
export type ProposalWizardAudience = CommProposal['audience']

export interface WizardFieldsFromProposal {
  /** 'street' when the board named one of the HOA's streets (BL-102 A5). */
  audience: ProposalWizardAudience | 'street'
  /** The matched street, when `audience` is 'street'. */
  street: { key: string; ownersOnly: boolean } | null
  category: CommProposal['category']
  subject: string
  /** Safe HTML from the plain-text converter (never model-written HTML). */
  bodyHtml: string
  channels: Array<'email' | 'portal' | 'sms'>
  /** BL-102 A6: drives the channels; the board can flip it on the last step. */
  urgency: Urgency
  /** `datetime-local` value ("YYYY-MM-DDTHH:mm"), or '' to send now. */
  scheduledFor: string
  /** What the board should check before sending, shown on the draft. */
  review: {
    missingFacts: string[]
    unverifiedNumbers: string[]
    /** A street the board named that matched none of the HOA's streets
     *  (or came with an audience a street can't combine with). */
    street: string | null
    /** A built-in template that fits, offered as an alternative, not applied. */
    suggestedTemplateId: string | null
    /** A send time the board asked for that the wizard cannot use. */
    droppedSendAt: string | null
    why: string
  }
}

export function proposalToWizardFields(
  proposal: CommProposal,
  opts: { smsConfigured: boolean; schedulingEnabled: boolean; streets?: readonly StreetOption[] },
): WizardFieldsFromProposal {
  // A street narrows "every home" or "owners" to the homes on it. It never
  // combines with dues, violations, tenants or the board: those keep their
  // own audience and the street is flagged for the board instead.
  const combinable = proposal.audience === 'everyone' || proposal.audience === 'owners_only'
  const matched = combinable ? matchStreet(proposal.street, opts.streets ?? []) : null

  // Email + portal always; an urgent message also goes by text when texting
  // is set up (only residents who opted in to texts get one, and the send
  // fits it into one 279-character SMS with a link to the rest).
  const channels = defaultChannels({ urgency: proposal.urgency, smsConfigured: opts.smsConfigured })

  const scheduledFor = opts.schedulingEnabled && proposal.sendAt ? proposal.sendAt : ''

  return {
    audience: matched ? 'street' : proposal.audience,
    street: matched ? { key: matched.key, ownersOnly: proposal.audience === 'owners_only' } : null,
    category: proposal.category,
    subject: proposal.subject.trim(),
    bodyHtml: plainTextToHtml(proposal.body),
    channels,
    urgency: proposal.urgency,
    scheduledFor,
    review: {
      missingFacts: proposal.missingFacts,
      unverifiedNumbers: proposal.unverifiedNumbers,
      street: matched ? null : proposal.street,
      // Not applied: picking a template replaces the drafted body and asks
      // its own questions, so it is the board's choice, not the model's.
      suggestedTemplateId: proposal.templateId,
      droppedSendAt: !opts.schedulingEnabled && proposal.sendAt ? proposal.sendAt : null,
      why: proposal.why,
    },
  }
}

/** The board's wall-clock time as "YYYY-MM-DDTHH:mm", for the route's `localNow`. */
export function localNowString(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
