// State machine for the process players. Pure, so tests can drive it without
// a DOM. The component adds the side effects: a timer that dispatches
// 'advance', and the off-screen and hidden-tab pauses.

export interface PlayerState {
  index: number
  count: number
  /** The user wants it playing (Play/Pause button). Never true under reduced motion. */
  playing: boolean
  /** Played through the last scene and stopped. Shows Replay. */
  ended: boolean
  reduced: boolean
  /** First and last scene this player may show. */
  start: number
  end: number
  /** Loop inside [start, end] instead of stopping. Used by benefit-row players. */
  loop: boolean
  /**
   * Scene number to announce in the polite live region, or null. Set only by
   * user actions, so automatic advances stay silent.
   */
  announce: number | null
}

export type PlayerAction =
  | { type: 'advance' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; index: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'replay' }
  | { type: 'reduced'; value: boolean }

export function initPlayer(opts: {
  count: number
  reduced?: boolean
  start?: number
  end?: number
  loop?: boolean
}): PlayerState {
  const start = Math.max(0, opts.start ?? 0)
  const end = Math.min(opts.count - 1, opts.end ?? opts.count - 1)
  const reduced = !!opts.reduced
  return {
    index: start,
    count: opts.count,
    playing: !reduced,
    ended: false,
    reduced,
    start,
    end,
    loop: !!opts.loop,
    announce: null,
  }
}

const clamp = (s: PlayerState, i: number) => Math.min(s.end, Math.max(s.start, i))

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'advance': {
      if (!s.playing || s.reduced) return s
      if (s.index < s.end) return { ...s, index: s.index + 1, announce: null }
      if (s.loop) return { ...s, index: s.start, announce: null }
      return { ...s, playing: false, ended: true, announce: null }
    }
    case 'next': {
      const index = clamp(s, s.index + 1)
      return { ...s, index, ended: false, announce: index }
    }
    case 'back': {
      const index = clamp(s, s.index - 1)
      return { ...s, index, ended: false, announce: index }
    }
    case 'goto': {
      const index = clamp(s, a.index)
      return { ...s, index, ended: false, announce: index }
    }
    case 'pause':
      return s.playing ? { ...s, playing: false } : s
    case 'play':
      if (s.reduced) return s
      if (s.ended) return playerReducer(s, { type: 'replay' })
      return s.playing ? s : { ...s, playing: true }
    case 'toggle':
      return playerReducer(s, { type: s.playing ? 'pause' : 'play' })
    case 'replay':
      return { ...s, index: s.start, ended: false, playing: !s.reduced, announce: s.start }
    case 'reduced':
      return a.value === s.reduced ? s : { ...s, reduced: a.value, playing: a.value ? false : s.playing }
  }
}
