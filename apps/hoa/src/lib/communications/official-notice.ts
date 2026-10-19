/**
 * BL-020: official notices and e-consent (CA Civ. Code §4040(a) / §4041).
 *
 * An individual official notice to a California association's members
 * may go by email only to members who chose electronic delivery; anyone
 * else must get it by first-class mail (or another §4040(a) method). The
 * board marks a message as an official notice in the composer
 * (`officialNotice` on sendCommunication). That flag is the
 * classification: categories alone can't tell a meeting notice from a
 * meeting reminder. Ordinary announcements never carry it and are
 * unaffected.
 *
 * Pure. The composer's Review-step preview and sendCommunication both
 * call `planOfficialNotice`, so the "needs a paper notice" list the board
 * sees is the one the send produces. Inert unless M1_APPLIED (passed in
 * as `m1`), so nothing here changes behaviour while the flag is false.
 */
import { filterEmailRecipientsByConsent, type LoadConsentResult } from '../email-consent'

/** The rule only exists where it changes something: CA associations, once M1 is applied. */
export function officialNoticeApplies(state: string | null | undefined, m1: boolean): boolean {
  return m1 && (state ?? '').trim().toUpperCase() === 'CA'
}

/** What the board needs to mail a paper copy: name and home, never contact details. */
export interface PaperNoticeRecipient {
  name: string
  home: string
}

export interface PaperNoticeSummary {
  count: number
  recipients: PaperNoticeRecipient[]
}

interface PlanRecipient {
  userId: string | null
  email: string | null
  recipientName: string | null
  unitAddress: string | null
  unitNumber: string | null
}

export type OfficialNoticePlan<T> =
  /** Not an official notice, not CA, or M1 off: today's fan-out, untouched. */
  | { applies: false }
  /** Consent couldn't be read. An official notice must not go out by email blind. */
  | { applies: true; ok: false }
  | {
      applies: true
      ok: true
      /** Recipients who may get an email row. */
      emailKeep: ReadonlySet<T>
      /** Everyone who won't get this by email, so needs a paper notice. */
      paper: PaperNoticeSummary
    }

export function planOfficialNotice<T extends PlanRecipient>(
  recipients: readonly T[],
  args: {
    channels: readonly string[]
    state: string | null | undefined
    officialNotice: boolean
    m1: boolean
    consent: LoadConsentResult | null
  },
): OfficialNoticePlan<T> {
  if (!args.officialNotice || !officialNoticeApplies(args.state, args.m1)) return { applies: false }
  if (!args.consent || !args.consent.ok || !args.consent.available) return { applies: true, ok: false }
  const { kept } = filterEmailRecipientsByConsent(recipients, {
    state: args.state,
    officialNotice: true,
    consent: args.consent,
  })
  const emailKeep = new Set(kept)
  // Paper = anyone this send won't email: no consent, no address on file,
  // or email not among the chosen channels at all. Portal and SMS don't
  // count as delivery of an individual notice under §4040(a).
  const emailing = args.channels.includes('email')
  const paper = recipients.filter((r) => !(emailing && r.email && emailKeep.has(r))).map(paperEntry)
  return { applies: true, ok: true, emailKeep, paper: { count: paper.length, recipients: paper } }
}

function paperEntry(r: PlanRecipient): PaperNoticeRecipient {
  const home = [r.unitAddress, r.unitNumber ? `#${r.unitNumber}` : null].filter(Boolean).join(' ')
  return { name: r.recipientName?.trim() || 'Resident', home: home || 'No home on file' }
}

/**
 * The channels one recipient gets a row for: only those they can receive
 * on, and email only when `emailKeep` is null (no official-notice plan) or
 * includes them. With `emailKeep` null this is exactly the fan-out
 * sendCommunication always had.
 */
export function deliverableChannels<C extends string, T extends { email: string | null; phone: string | null; userId: string | null }>(
  r: T,
  channels: readonly C[],
  emailKeep: ReadonlySet<T> | null,
): C[] {
  return channels.filter((channel) => {
    if (channel === 'email') return !!r.email && (emailKeep === null || emailKeep.has(r))
    if (channel === 'sms') return !!r.phone
    if (channel === 'portal') return !!r.userId
    return true
  })
}

/** "3 members need a paper notice" — the Review step's headline. */
export function paperNoticeLabel(n: number): string {
  return `${n} ${n === 1 ? 'member needs' : 'members need'} a paper notice`
}
