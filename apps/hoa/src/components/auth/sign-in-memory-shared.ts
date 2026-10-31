// Pure module: what this device remembers about how the person last signed in.
// Everything is wrapped in try/catch because storage can be blocked (private
// windows, strict settings). The page must work when nothing is remembered.

export const LAST_METHOD_KEY = 'hh:last-signin-method'
export const PW_PROMPT_DISMISSED_KEY = 'hh:pw-prompt-dismissed'
/** user_metadata flag written through the auth API once a password exists. */
export const PASSWORD_SET_FLAG = 'password_set'

export type SignInMethod = 'link' | 'password'
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function rememberSignInMethod(method: SignInMethod, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(LAST_METHOD_KEY, method)
  } catch {
    /* storage blocked: fine */
  }
}

export function lastSignInMethod(storage: StorageLike | null = defaultStorage()): SignInMethod | null {
  try {
    const v = storage?.getItem(LAST_METHOD_KEY)
    return v === 'link' || v === 'password' ? v : null
  } catch {
    return null
  }
}

export function dismissPasswordPrompt(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PW_PROMPT_DISMISSED_KEY, '1')
  } catch {
    /* storage blocked: fine */
  }
}

export function passwordPromptDismissed(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(PW_PROMPT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** True when the user_metadata says a password was chosen. */
export function hasChosenPassword(userMetadata: Record<string, unknown> | null | undefined): boolean {
  return userMetadata?.[PASSWORD_SET_FLAG] === true
}

/**
 * Offer the one-time "choose a password" prompt only when this device signed
 * in by link, the account has no password flag, and it was not skipped before.
 */
export function shouldOfferPasswordPrompt(input: {
  lastMethod: SignInMethod | null
  dismissed: boolean
  userMetadata: Record<string, unknown> | null | undefined
}): boolean {
  return input.lastMethod === 'link' && !input.dismissed && !hasChosenPassword(input.userMetadata)
}
