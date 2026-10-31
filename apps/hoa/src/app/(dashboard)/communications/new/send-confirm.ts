/**
 * Wording for the "are you sure?" step before a message goes out to a whole
 * audience. Pure so the numbers and channel words can be tested. A wrong
 * number here is worse than none, so an unknown count falls back to naming
 * the audience instead.
 */

export interface SendConfirmInput {
  /** Audience name as shown in the review, e.g. "Everyone". */
  audienceLabel: string
  /** Real recipient count, or null/0/NaN when not known. */
  count: number | null | undefined
  /** What a count of this audience counts. Default: homes. */
  noun?: { one: string; many: string }
  /** Channels that will really be used, in plain words: "email and text". */
  channelsWords: string
  /** Chosen send time, or null to send right away. */
  scheduledAt: Date | null
}

export interface SendConfirmCopy {
  title: string
  description: string
  confirmLabel: string
}

export function sendConfirmCopy(i: SendConfirmInput): SendConfirmCopy {
  const known = typeof i.count === 'number' && Number.isFinite(i.count) && i.count > 0
  const noun = i.noun ?? { one: 'home', many: 'homes' }
  const who = known
    ? `${i.count} ${i.count === 1 ? noun.one : noun.many}`
    : `everyone in ${i.audienceLabel.toLowerCase() === 'everyone' ? 'the community' : i.audienceLabel}`
  const by = i.channelsWords.trim() || 'the channels you picked'
  if (i.scheduledAt) {
    const when = i.scheduledAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    return {
      title: `Schedule for ${when} to ${who}?`,
      description: `It will go out by ${by} at that time.`,
      confirmLabel: 'Schedule it',
    }
  }
  return {
    title: `Send to ${who} by ${by}?`,
    description: 'Messages go out right away and cannot be taken back.',
    confirmLabel: 'Send now',
  }
}
