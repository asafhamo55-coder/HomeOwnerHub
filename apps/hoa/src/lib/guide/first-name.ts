/** Longest first name shown; anything longer is cut so a bar or title cannot overflow. */
export const MAX_FIRST_NAME = 30

/**
 * The first word of a full name, trimmed and capped at 30 characters; null when there is nothing to
 * greet by. Pure, so the client help drawer can share it. Never given an
 * email address: callers pass a profile name or nothing.
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? ''
  // An email-shaped first token is not a name (an impersonation token can
  // carry the email when no name was given): greet no one rather than that.
  if (first === '' || first.includes('@')) return null
  return Array.from(first).slice(0, MAX_FIRST_NAME).join('')
}

/** The help drawer's sheet title and trigger label for a (maybe missing) first name. */
export function helpGreeting(firstName: string | null | undefined): string | null {
  const name = firstNameOf(firstName)
  return name ? `Hello ${name}` : null
}
