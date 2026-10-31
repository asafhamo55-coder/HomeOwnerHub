// Pure helpers for the RFP invite panel. No server imports, so the client
// panel can use them ('use server' files may only export async functions).

export function isReadFailed(r: unknown): r is { loadFailed: true } {
  return !Array.isArray(r) && typeof r === 'object' && r !== null && (r as { loadFailed?: unknown }).loadFailed === true
}

interface VendorLike {
  id: string
  legal_name: string
  already_invited: boolean
  has_email: boolean
}

export type EmptyReason = 'no_vendors' | 'all_invited' | 'missing_email' | null

export interface InviteBuckets<V extends VendorLike> {
  /** Not yet invited and has an email: the only vendors a send list may hold. */
  eligible: V[]
  /** Not yet invited but no email on file. */
  noEmail: V[]
  /** Why `eligible` is empty, or null when it is not. */
  emptyReason: EmptyReason
}

export function bucketVendors<V extends VendorLike>(vendors: V[]): InviteBuckets<V> {
  const notInvited = vendors.filter((v) => !v.already_invited)
  const eligible = notInvited.filter((v) => v.has_email)
  const noEmail = notInvited.filter((v) => !v.has_email)
  let emptyReason: EmptyReason = null
  if (eligible.length === 0) {
    if (vendors.length === 0) emptyReason = 'no_vendors'
    else if (noEmail.length > 0) emptyReason = 'missing_email'
    else emptyReason = 'all_invited'
  }
  return { eligible, noEmail, emptyReason }
}
