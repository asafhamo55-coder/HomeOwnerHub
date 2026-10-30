// Pure state mapping for the "Set up your association" grid on Settings >
// General. Each card reads one existing loader; this file only turns what
// the loader returned into a pill. A read that failed is "Open to check",
// never a guess in either direction.

export type SetupState = 'set_up' | 'not_set_up' | 'needs_attention' | 'unknown'

/** A loader result reduced to the part the hub needs. */
export type Read<T> = { ok: true; data: T } | { ok: false }

export const SETUP_LABEL: Record<SetupState, string> = {
  set_up: 'Set up',
  not_set_up: 'Not set up',
  needs_attention: 'Needs attention',
  unknown: 'Open to check',
}

type Saved = 'configured' | 'not_configured' | 'unverified'

/** Settings saved outside the screen read as paused, so they need a look. */
function fromSaved(state: Saved, on: boolean): SetupState {
  if (state === 'unverified') return 'needs_attention'
  return state === 'configured' && on ? 'set_up' : 'not_set_up'
}

export function paymentsState(r: Read<{ read: { state: Saved } }>): SetupState {
  if (!r.ok) return 'unknown'
  return fromSaved(r.data.read.state, true)
}

export function lateFeesState(
  r: Read<{ state: 'saved' | 'none' | 'unverified'; policy: { enabled: boolean } }>,
): SetupState {
  if (!r.ok) return 'unknown'
  if (r.data.state === 'unverified') return 'needs_attention'
  return r.data.state === 'saved' && r.data.policy.enabled ? 'set_up' : 'not_set_up'
}

export function remindersState(r: Read<{ state: Saved; settings: { enabled: boolean } }>): SetupState {
  if (!r.ok) return 'unknown'
  return fromSaved(r.data.state, r.data.settings.enabled)
}

export function receiptsState(r: Read<{ state: Saved; on: boolean }>): SetupState {
  if (!r.ok) return 'unknown'
  return fromSaved(r.data.state, r.data.on)
}

export interface MailboxLike {
  syncStatus: 'ok' | 'stalled' | 'auth_failed'
  backfillStatus: 'pending' | 'running' | 'done' | 'failed'
}

/** `null` data means no mailbox is connected. */
export function mailboxState(r: Read<MailboxLike | null>): SetupState {
  if (!r.ok) return 'unknown'
  if (!r.data) return 'not_set_up'
  if (r.data.syncStatus !== 'ok' || r.data.backfillStatus === 'failed') return 'needs_attention'
  return 'set_up'
}

export function professionalsState(r: Read<Array<{ title: string | null }>>): SetupState {
  if (!r.ok) return 'unknown'
  return r.data.some((o) => o.title === 'treasurer') ? 'set_up' : 'not_set_up'
}

/** "4 of 6 set up". Cards that could not be read are not counted as set up. */
export function setupProgress(states: readonly SetupState[]): { done: number; total: number; label: string } {
  const done = states.filter((s) => s === 'set_up').length
  return { done, total: states.length, label: `${done} of ${states.length} set up` }
}
