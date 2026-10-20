// W30 — "is this state's law actually loaded?"
//
// /legal/ask offers GA, FL, CA and TX, but a state only has statute text in
// state_statutes once its source has been ingested (GA from the seed, FL /
// CA / TX from the refresh job). Until then, every surface that answers
// state-law questions must say so plainly instead of letting a model answer
// from memory. Pure: callers supply the count.

export type StateLawState = 'GA' | 'FL' | 'CA' | 'TX'

export const STATE_LAW_NAMES: Readonly<Record<StateLawState, string>> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

/** What a resident or board member is told when the state has no text yet. */
export function stateNotLoadedMessage(state: StateLawState): string {
  const name = STATE_LAW_NAMES[state]
  return (
    `${name} state law isn't loaded yet, so I can't answer questions about it. ` +
    `Answers here come only from the statute text itself, never from general knowledge. ` +
    `Until ${name}'s statutes are added, check with your association's attorney.`
  )
}

/** Live (not superseded) statute rows for the state. */
export type CountLiveStatutes = (state: StateLawState) => Promise<number>

export function isStateLoaded(liveStatutes: number): boolean {
  return liveStatutes > 0
}
