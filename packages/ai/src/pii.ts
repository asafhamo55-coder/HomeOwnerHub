// Contact-PII detector for AI payloads (BL-062).
//
// Tests build each prompt with fixture PII and assert this finds nothing in
// what would be sent to the provider. Deliberately broad on phone shapes
// (it also flags a bare 555-0100) because a missed match is a silent leak.
//
// redactContactPII uses the same patterns to strip contact details from text
// a task does not need them in (e.g. an email signature sent as a search
// question). Its breadth means a long reference number can read as a phone
// and be redacted too, which is the safe direction for an AI input.
//
// SEC-005: redactContactPII also strips US street addresses (a house number,
// one to four street-name words, a street suffix) and unit numbers ("Apt 4B",
// "Unit 12", "Suite 300"), because its output can be stored (W1 writes the
// query to ai_runs). findContactPII does NOT flag addresses: board prompts
// carry them on purpose, and that guard is about email and phone.
//
// LIMITATIONS. Free-form names are not attempted (no pattern tells "Pat"
// the neighbour from "Pat" the paint colour). An address needs a house
// number AND a known suffix: "the blue house on Maple" is not caught.
// A street-name word that is a common short word (on, my, the, …) breaks
// the match, so "2 dogs on my street" stays intact for search.

const EMAIL = String.raw`[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}`
// +1 305 555 0144 · (305) 555-0142 · 305.555.0143 · 3055550145
const PHONE_10 = String.raw`(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}\b`
// 555-0100 (local seven digits, the classic fixture shape)
const PHONE_7 = String.raw`\b\d{3}[\s.-]\d{4}\b`

const CONTACT_RE = new RegExp(`${EMAIL}|${PHONE_10}|${PHONE_7}`, 'gi')
const EMAIL_ONLY_RE = new RegExp(`^${EMAIL}$`, 'i')

const STREET_SUFFIX = [
  'street', 'st', 'avenue', 'ave', 'av', 'road', 'rd', 'drive', 'dr', 'lane', 'ln', 'court', 'ct',
  'boulevard', 'blvd', 'way', 'place', 'pl', 'terrace', 'ter', 'circle', 'cir', 'trail', 'trl',
  'parkway', 'pkwy', 'highway', 'hwy', 'square', 'sq', 'loop', 'path', 'pike', 'alley', 'aly',
  'crossing', 'xing', 'cove', 'cv', 'ridge', 'bend', 'glen', 'grove', 'run', 'row', 'point', 'pt',
  'plaza', 'plz', 'harbor', 'hbr', 'landing', 'lndg', 'mews', 'walk', 'close', 'crescent', 'cres',
].join('|')
// Short words that never form a street name; one of them ends the match.
const STOP = 'on|in|at|of|to|my|our|your|the|a|an|and|or|for|per|by|is|are|be|this|that|each|with|from|near|than'
const NAME_WORD = String.raw`(?!(?:${STOP})\b)[A-Z0-9][A-Z0-9'.-]*`
// 829 Pistace Ct · 1600 Pennsylvania Avenue NW · 12 N. Oak Ln. · 4521B Old Mill Rd
const ADDRESS = String.raw`\b\d{1,6}[A-Z]?\s+(?:${NAME_WORD}\s+){1,4}(?:${STREET_SUFFIX})\b\.?(?:\s+(?:N|S|E|W|NE|NW|SE|SW)\b\.?)?`
// Apt 4B · Apartment 12 · Unit 3 · Suite 300 · Ste. 2 · Bldg 7 · Apt #4-A. The id must hold a digit.
const UNIT = String.raw`\b(?:apt|apartment|unit|suite|ste|bldg|building)\b\.?\s*#?\s*(?=[A-Z]{0,2}\d)[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,4})?\b`

const ADDRESS_RE = new RegExp(ADDRESS, 'gi')
const UNIT_RE = new RegExp(UNIT, 'gi')

/** Every email / phone-looking substring in `text`, in order. */
export function findContactPII(text: string): string[] {
  return text.match(CONTACT_RE) ?? []
}

/**
 * `text` with every email / phone replaced by "[email removed]" / "[phone removed]",
 * every street address by "[address removed]" and every unit number by "[unit removed]".
 */
export function redactContactPII(text: string): string {
  return text
    .replace(CONTACT_RE, (m) => (EMAIL_ONLY_RE.test(m) ? '[email removed]' : '[phone removed]'))
    .replace(ADDRESS_RE, '[address removed]')
    .replace(UNIT_RE, '[unit removed]')
}
