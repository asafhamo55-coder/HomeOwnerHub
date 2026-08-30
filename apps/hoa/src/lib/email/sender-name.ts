/**
 * Builds the From header so resident mail comes from the community rather
 * than from the platform.
 *
 * EMAIL_FROM is a single global env var ("HomeownerHub <noreply@...>"), so
 * every tenant's mail used to arrive under the same name. Only the DISPLAY
 * NAME varies here — the address is always the one from EMAIL_FROM, because
 * that is the domain verified with Resend. Changing the address would mean
 * DNS work per tenant; changing the display name costs nothing.
 *
 * Both functions are pure and total: any input that cannot be handled
 * returns the unchanged EMAIL_FROM rather than a half-built header, so a
 * surprising name can never stop mail going out.
 */

/** associations.type is CHECK-constrained to these (migration 0004). */
const SUFFIX_BY_TYPE: Record<string, string> = {
  hoa: 'HOA',
  condo: 'Condominium Association',
  coop: 'Housing Cooperative',
}

/**
 * Names that already say what kind of community they are. Appending to one
 * of these produces "Creek Valley Community Association HOA" — the reason
 * this is a lookup and not an unconditional append.
 *
 * Whole words only: "Hoagie Lane" is not an HOA. `co-op` is listed
 * separately because `\b` does not treat the hyphen as part of the word.
 */
const ALREADY_QUALIFIED =
  /\b(hoa|association|condominium|condo|cooperative|coop|co-op|community)\b/i

/**
 * "Madison Park" + hoa -> "Madison Park HOA".
 *
 * Returns '' for a blank name so callers can fall back to EMAIL_FROM rather
 * than send from a lone suffix like "HOA".
 */
export function buildSenderName(name: string, type?: string | null): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  const suffix = type ? SUFFIX_BY_TYPE[type.trim().toLowerCase()] : undefined
  if (!suffix) return trimmed
  if (ALREADY_QUALIFIED.test(trimmed)) return trimmed

  return `${trimmed} ${suffix}`
}

/** Pull the address out of "Name <addr>", or accept a bare address. */
function extractAddress(envFrom: string): string | null {
  const angled = envFrom.match(/<([^>]+)>/)
  if (angled) return angled[1].trim()
  const bare = envFrom.trim()
  return bare.includes('@') ? bare : null
}

/**
 * Rebuild EMAIL_FROM with `senderName` as the display name.
 *
 * Always quotes, because these names are staff-entered and one real org is
 * named "Creek Valley HOA (Demo)" — parentheses open a comment in an
 * unquoted RFC 5322 display name. Quotes and backslashes are escaped, and
 * CR/LF is stripped, so a name cannot inject additional headers.
 *
 * With no usable senderName the env value is returned byte-for-byte, which
 * is what keeps platform and vendor mail reading "HomeownerHub".
 */
export function formatFrom(envFrom: string, senderName?: string | null): string {
  const name = senderName?.replace(/[\r\n]+/g, ' ').trim()
  if (!name) return envFrom

  const address = extractAddress(envFrom)
  if (!address) return envFrom

  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}" <${address}>`
}
