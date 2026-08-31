// VAPID application-server key handling. Pure — no browser, no network,
// no Supabase — so it can be unit-tested under the root vitest harness
// (see vitest.config.ts: PURE MODULES ONLY). The component that consumes
// it, EnablePushButton, cannot be tested here at all.

/**
 * The VAPID public key is published as base64url (that is how the
 * web-push tooling emits it, and how it travels in an env var), but
 * PushManager.subscribe() only accepts a BufferSource or a raw base64url
 * string — and Safari has historically mishandled the string form. So we
 * decode it ourselves and hand over bytes, which every browser accepts.
 *
 * base64url differs from base64 in exactly two ways: '-' replaces '+',
 * '_' replaces '/', and the '=' padding is dropped. atob() understands
 * neither, so both have to be undone before decoding.
 *
 * Throws on input that isn't decodable. Callers that hold an env var of
 * unknown provenance should use applicationServerKey() instead.
 *
 * The `Uint8Array<ArrayBuffer>` annotation is not decoration: since the
 * typed arrays became generic, a bare `Uint8Array` means
 * `Uint8Array<ArrayBufferLike>`, which could be backed by a
 * SharedArrayBuffer and so does not satisfy BufferSource — the exact
 * type PushManager.subscribe() wants.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  // (4 - len % 4) % 4 — the inner %4 keeps an already-aligned length at
  // zero padding rather than adding four '=' and breaking the decode.
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')

  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}

/**
 * A VAPID public key is an uncompressed P-256 point: the 0x04 prefix
 * byte followed by a 32-byte X and a 32-byte Y. Anything else — a
 * truncated copy-paste, the PRIVATE key pasted by mistake (32 bytes), a
 * REPLACE_ME placeholder — is rejected here.
 *
 * Checking is worth the few lines because the browser's own failure for
 * a malformed key is an opaque DOMException from subscribe(), which
 * reads to the user as "push is broken" rather than "the key is wrong".
 */
export function isValidVapidPublicKey(bytes: Uint8Array): boolean {
  return bytes.length === 65 && bytes[0] === 0x04
}

/**
 * Decodes NEXT_PUBLIC_VAPID_PUBLIC_KEY into the form subscribe() wants,
 * or null when it is absent or unusable.
 *
 * null is a first-class outcome, not an error path: per the design doc
 * this whole feature ships BEFORE the VAPID env vars are set, and the
 * opt-in UI has to render a truthful "not configured yet" instead of
 * blowing up the settings page.
 */
export function applicationServerKey(
  rawKey: string | undefined | null,
): Uint8Array<ArrayBuffer> | null {
  const trimmed = rawKey?.trim()
  if (!trimmed || trimmed === 'REPLACE_ME') return null

  try {
    const bytes = urlBase64ToUint8Array(trimmed)
    return isValidVapidPublicKey(bytes) ? bytes : null
  } catch {
    return null
  }
}
