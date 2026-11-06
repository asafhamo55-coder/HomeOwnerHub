/**
 * What the board is told after choosing to email residents. Plain words,
 * counts only. Pure and browser-safe.
 */

import type { PollEmailStatus } from './run'

export interface PollEmailMessage {
  tone: 'success' | 'warning'
  text: string
}

const homes = (n: number) => `${n} ${n === 1 ? 'home' : 'homes'}`

export function pollEmailMessage(
  kind: 'opened' | 'results',
  r: { status: PollEmailStatus; sent: number; held: number; optedOut: number },
): PollEmailMessage {
  const what = kind === 'opened' ? 'The poll is open' : 'The poll is closed'
  switch (r.status) {
    case 'sent': {
      const skipped = r.optedOut > 0 ? ` ${homes(r.optedOut)} turned off email and were skipped.` : ''
      return { tone: 'success', text: `${what}. Emailed ${homes(r.sent)}.${skipped}` }
    }
    case 'held':
      return { tone: 'warning', text: `${what}, but the safety guard held the email back. Nothing was sent.` }
    case 'already_sent':
      return { tone: 'success', text: `${what}. This email was already sent, so it was not sent again.` }
    case 'no_recipients':
      return { tone: 'warning', text: `${what}, but no home has an email address that can receive it.` }
    case 'email_not_configured':
      return { tone: 'warning', text: `${what}, but email is not set up on this server, so nothing was sent.` }
    case 'results_hidden':
      return { tone: 'warning', text: `${what}. Residents cannot see these results yet, so no email was sent.` }
    default:
      return { tone: 'warning', text: `${what}, but the email could not be sent.` }
  }
}

/** "Emailed 12 homes on November 6, 2026." */
export function emailedLine(homesCount: number, atIso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(atIso),
  )
  return `Emailed ${homes(homesCount)} on ${day}.`
}
