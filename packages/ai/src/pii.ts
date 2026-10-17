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

const EMAIL = String.raw`[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}`
// +1 305 555 0144 · (305) 555-0142 · 305.555.0143 · 3055550145
const PHONE_10 = String.raw`(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}\b`
// 555-0100 (local seven digits, the classic fixture shape)
const PHONE_7 = String.raw`\b\d{3}[\s.-]\d{4}\b`

const CONTACT_RE = new RegExp(`${EMAIL}|${PHONE_10}|${PHONE_7}`, 'gi')
const EMAIL_ONLY_RE = new RegExp(`^${EMAIL}$`, 'i')

/** Every email / phone-looking substring in `text`, in order. */
export function findContactPII(text: string): string[] {
  return text.match(CONTACT_RE) ?? []
}

/** `text` with every email / phone replaced by "[email removed]" / "[phone removed]". */
export function redactContactPII(text: string): string {
  return text.replace(CONTACT_RE, (m) => (EMAIL_ONLY_RE.test(m) ? '[email removed]' : '[phone removed]'))
}
