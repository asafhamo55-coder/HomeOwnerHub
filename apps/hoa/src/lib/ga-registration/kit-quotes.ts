/**
 * BL-149: every statute sentence the Georgia registration kit prints. All
 * come from lib/compliance/law.ts and so from
 * scripts/fixtures/state-law/ga-sb406-2026-registration.txt;
 * kit-quotes.test.ts checks each one word for word against that file.
 *
 * Not in the fixture, so never quoted: what the Secretary of State's form
 * asks beyond name, address and officers (a registered agent, the number
 * of units), the portal, and the opt-out notice's form. The kit lists the
 * registered agent and the unit count as facts a board is likely to need,
 * and says the statute text we hold doesn't require them.
 */

import {
  GA_REGISTRATION_AMENDMENT,
  GA_REGISTRATION_BAR,
  GA_REGISTRATION_EFFECTIVE_ON_FILING,
  GA_REGISTRATION_FEE,
  GA_REGISTRATION_FILING,
  GA_REGISTRATION_FINANCIALS,
  GA_REGISTRATION_FORM_MINIMUM,
  GA_REGISTRATION_OPT_OUT,
  GA_REGISTRATION_RENEWAL,
  GA_SB406_EFFECTIVE,
  type StatuteQuote,
} from '@/lib/compliance/law'

export const KIT_QUOTES = {
  inForce: GA_SB406_EFFECTIVE,
  bar: GA_REGISTRATION_BAR,
  optOut: GA_REGISTRATION_OPT_OUT,
  filing: GA_REGISTRATION_FILING,
  formMinimum: GA_REGISTRATION_FORM_MINIMUM,
  financials: GA_REGISTRATION_FINANCIALS,
  effectiveOnFiling: GA_REGISTRATION_EFFECTIVE_ON_FILING,
  renewal: GA_REGISTRATION_RENEWAL,
  amendment: GA_REGISTRATION_AMENDMENT,
  fee: GA_REGISTRATION_FEE,
} as const satisfies Record<string, StatuteQuote>

export const ALL_KIT_QUOTES: readonly StatuteQuote[] = Object.values(KIT_QUOTES)

/** Facts the kit lists that the statute text we hold does not name (the gap, said plainly). */
export const NOT_IN_STATUTE_NOTE =
  'The statute text HomeownerHub holds requires the name, address and officers. It doesn’t mention a registered agent or the number of units; they’re here because the Secretary of State’s form may ask. Check the form when you file.'
