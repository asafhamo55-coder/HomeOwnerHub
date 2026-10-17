// Owner contact placeholders (BL-062).
//
// The model never sees an owner's email or phone. get_unit_owner hands it
// a token such as [OWNER_EMAIL_1] instead and records the real value in a
// per-request ContactVault. The route swaps the tokens in the final answer
// for the real values, server-side, and only for a caller who may see owner
// contact (board and admin). Anything that looks like a token but is not in
// the vault — a model guess — is neutralised rather than echoed.

export type ContactKind = 'email' | 'phone'

const TOKEN_RE = /\[OWNER_(EMAIL|PHONE)_(\d{1,4})\]/g

export class ContactVault {
  // Private fields: JSON.stringify sees no own enumerable properties, so a
  // vault that slips into a response body serialises to {}.
  #byToken = new Map<string, string>()
  #byValue = new Map<string, string>()
  #counts: Record<ContactKind, number> = { email: 0, phone: 0 }

  /** The token standing in for `value`; the same value always gets the same token. */
  token(kind: ContactKind, value: string): string {
    const key = `${kind}:${value}`
    const existing = this.#byValue.get(key)
    if (existing) return existing
    this.#counts[kind] += 1
    const token = `[OWNER_${kind.toUpperCase()}_${this.#counts[kind]}]`
    this.#byValue.set(key, token)
    this.#byToken.set(token, value)
    return token
  }

  resolve(token: string): string | undefined {
    return this.#byToken.get(token)
  }

  get size(): number {
    return this.#byToken.size
  }
}

/**
 * Replace contact tokens in model text. `vault` null means the caller may
 * not see owner contact: every token becomes "(not shown)".
 */
export function fillContactPlaceholders(text: string, vault: ContactVault | null): string {
  return text.replace(TOKEN_RE, (token) => {
    if (!vault) return '(not shown)'
    return vault.resolve(token) ?? '(not on file)'
  })
}
