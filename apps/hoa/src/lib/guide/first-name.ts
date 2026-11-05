/**
 * The first word of a full name, trimmed; null when there is nothing to
 * greet by. Pure, so the client help drawer can share it. Never given an
 * email address: callers pass a profile name or nothing.
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? ''
  return first === '' ? null : first
}

/** The help drawer's sheet title and trigger label for a (maybe missing) first name. */
export function helpGreeting(firstName: string | null | undefined): string | null {
  const name = firstNameOf(firstName)
  return name ? `Hello ${name}` : null
}
