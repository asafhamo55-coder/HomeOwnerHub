/**
 * BL-102 A6: channels follow urgency.
 *
 * One question ("Is this urgent?") replaces three checkboxes:
 *
 *   - routine → email + portal;
 *   - urgent  → text + email + portal (the TownSq model), and a text only
 *     when texting is set up for the HOA (lib/sms.ts smsConfigured).
 *
 * The board can still change the channels by hand. Once they have, a
 * later template pick or urgency switch leaves their choice alone instead
 * of silently overwriting it.
 *
 * Who actually gets a text is still decided per resident at send time:
 * only residents who opted in to texts (./preferences.ts). Nothing here
 * widens that.
 *
 * Pure and client-safe. Nothing here logs.
 */

export type Urgency = 'routine' | 'urgent'

export type PickableChannel = 'email' | 'portal' | 'sms'

/** communications.category values that mean "urgent" today. There is no
 *  urgency column until Phase B (B2), so urgency maps to 'emergency'. */
const URGENT_CATEGORIES: ReadonlySet<string> = new Set(['emergency'])

export function urgencyForCategory(category: string): Urgency {
  return URGENT_CATEGORIES.has(category) ? 'urgent' : 'routine'
}

/** The category to file a message under when the board flips urgency. An
 *  urgent message is an emergency; turning urgency off returns an
 *  emergency to a plain announcement and leaves any other category. */
export function categoryForUrgency<C extends string>(category: C, urgency: Urgency): C | 'emergency' | 'announcement' {
  if (urgency === 'urgent') return 'emergency'
  return category === 'emergency' ? 'announcement' : category
}

export interface ChannelDefaultsOptions {
  urgency: Urgency
  smsConfigured: boolean
}

/** The channels a message of this urgency starts with. Always in the
 *  order email, portal, sms. */
export function defaultChannels({ urgency, smsConfigured }: ChannelDefaultsOptions): PickableChannel[] {
  const out: PickableChannel[] = ['email', 'portal']
  if (urgency === 'urgent' && smsConfigured) out.push('sms')
  return out
}

export interface PickChannelsInput extends ChannelDefaultsOptions {
  /** The channels on screen now. */
  current: readonly string[]
  /** True once the board ticked or unticked a channel themselves. */
  touched: boolean
  /** A template's own channels, when the change is a template pick. */
  templateChannels?: readonly string[]
}

export interface PickChannelsResult {
  channels: PickableChannel[]
  /** True when the board's own choice was kept rather than replaced. */
  kept: boolean
}

const ORDER: readonly PickableChannel[] = ['email', 'portal', 'sms']

function normalize(list: readonly string[], smsConfigured: boolean): PickableChannel[] {
  const set = new Set(list)
  return ORDER.filter((c) => set.has(c) && (c !== 'sms' || smsConfigured))
}

/**
 * The channels after a template pick or an urgency change.
 *
 * - The board already chose channels by hand: keep them (minus a text when
 *   texting isn't set up). This is the "no silent overwrite" rule.
 * - Otherwise: the urgency defaults, plus any channel the template itself
 *   asks for (a template can add a channel, never remove email or portal).
 */
export function pickChannels(input: PickChannelsInput): PickChannelsResult {
  if (input.touched) {
    const kept = normalize(input.current, input.smsConfigured)
    if (kept.length > 0) return { channels: kept, kept: true }
  }
  const base = defaultChannels(input)
  const fromTemplate = normalize(input.templateChannels ?? [], input.smsConfigured)
  return { channels: normalize([...base, ...fromTemplate], input.smsConfigured), kept: false }
}

const LABEL: Record<PickableChannel, string> = { email: 'email', portal: 'portal', sms: 'text' }

/** "Text, email and portal", in a fixed reading order (text first, since
 *  that is what urgency adds). */
export function channelsSentence(channels: readonly string[]): string {
  const ordered = (['sms', 'email', 'portal'] as const).filter((c) => channels.includes(c)).map((c) => LABEL[c])
  if (ordered.length === 0) return 'No channel'
  const words = ordered.length === 1 ? ordered[0] : `${ordered.slice(0, -1).join(', ')} and ${ordered[ordered.length - 1]}`
  return words.charAt(0).toUpperCase() + words.slice(1)
}
