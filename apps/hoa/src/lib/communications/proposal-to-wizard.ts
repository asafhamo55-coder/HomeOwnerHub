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

/** The audience kinds the proposal can pick, all existing wizard kinds. */
export type ProposalWizardAudience = CommProposal['audience']

export interface WizardFieldsFromProposal {
  audience: ProposalWizardAudience
  category: CommProposal['category']
  subject: string
  /** Safe HTML from the plain-text converter (never model-written HTML). */
  bodyHtml: string
  channels: Array<'email' | 'portal' | 'sms'>
  /** `datetime-local` value ("YYYY-MM-DDTHH:mm"), or '' to send now. */
  scheduledFor: string
  /** What the board should check before sending, shown on the draft. */
  review: {
    missingFacts: string[]
    unverifiedNumbers: string[]
    /** A street the board named; no audience targets a street yet. */
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
  opts: { smsConfigured: boolean; schedulingEnabled: boolean },
): WizardFieldsFromProposal {
  // Email + portal always; an urgent message also goes by text when texting
  // is set up (only residents who opted in to texts get one, and the send
  // fits it into one 279-character SMS with a link to the rest).
  const channels: WizardFieldsFromProposal['channels'] = ['email', 'portal']
  if (proposal.urgency === 'urgent' && opts.smsConfigured) channels.push('sms')

  const scheduledFor = opts.schedulingEnabled && proposal.sendAt ? proposal.sendAt : ''

  return {
    audience: proposal.audience,
    category: proposal.category,
    subject: proposal.subject.trim(),
    bodyHtml: plainTextToHtml(proposal.body),
    channels,
    scheduledFor,
    review: {
      missingFacts: proposal.missingFacts,
      unverifiedNumbers: proposal.unverifiedNumbers,
      street: proposal.street,
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
