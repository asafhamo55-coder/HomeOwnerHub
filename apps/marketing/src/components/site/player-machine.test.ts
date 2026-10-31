import { describe, expect, it } from 'vitest'
import { initPlayer, playerReducer, type PlayerAction, type PlayerState } from './player-machine'

const run = (s: PlayerState, ...a: PlayerAction[]) => a.reduce(playerReducer, s)

describe('process player state machine', () => {
  const fresh = () => initPlayer({ count: 4 })

  it('starts playing on scene 0', () => {
    expect(fresh()).toMatchObject({ index: 0, playing: true, ended: false })
  })

  it('advances one scene at a time and stops at the end', () => {
    let s = run(fresh(), { type: 'advance' }, { type: 'advance' }, { type: 'advance' })
    expect(s).toMatchObject({ index: 3, playing: true, ended: false })
    s = run(s, { type: 'advance' })
    expect(s).toMatchObject({ index: 3, playing: false, ended: true })
  })

  it('does not advance while paused, and resumes on play', () => {
    let s = run(fresh(), { type: 'pause' }, { type: 'advance' })
    expect(s.index).toBe(0)
    s = run(s, { type: 'play' }, { type: 'advance' })
    expect(s.index).toBe(1)
  })

  it('toggles between play and pause', () => {
    expect(run(fresh(), { type: 'toggle' }).playing).toBe(false)
    expect(run(fresh(), { type: 'toggle' }, { type: 'toggle' }).playing).toBe(true)
  })

  it('jumps to any step and clamps out-of-range jumps', () => {
    expect(run(fresh(), { type: 'goto', index: 2 }).index).toBe(2)
    expect(run(fresh(), { type: 'goto', index: 99 }).index).toBe(3)
    expect(run(fresh(), { type: 'goto', index: -4 }).index).toBe(0)
  })

  it('next and back stay inside the scenes', () => {
    expect(run(fresh(), { type: 'back' }).index).toBe(0)
    expect(run(fresh(), { type: 'goto', index: 3 }, { type: 'next' }).index).toBe(3)
  })

  it('replays from the start after the end, and play at the end replays', () => {
    const ended = run(fresh(), { type: 'goto', index: 3 }, { type: 'advance' })
    expect(ended.ended).toBe(true)
    expect(run(ended, { type: 'replay' })).toMatchObject({ index: 0, playing: true, ended: false })
    expect(run(ended, { type: 'play' })).toMatchObject({ index: 0, playing: true, ended: false })
  })

  it('jumping back from the end clears ended', () => {
    const ended = run(fresh(), { type: 'goto', index: 3 }, { type: 'advance' })
    expect(run(ended, { type: 'goto', index: 1 })).toMatchObject({ index: 1, ended: false })
  })

  it('reduced motion: never plays, never auto-advances, Next and Back still work', () => {
    const r = initPlayer({ count: 4, reduced: true })
    expect(r.playing).toBe(false)
    expect(run(r, { type: 'advance' }).index).toBe(0)
    expect(run(r, { type: 'play' }).playing).toBe(false)
    expect(run(r, { type: 'next' }).index).toBe(1)
    expect(run(r, { type: 'next' }, { type: 'back' }).index).toBe(0)
  })

  it('turning reduced motion on while playing stops playback', () => {
    const s = run(fresh(), { type: 'reduced', value: true })
    expect(s).toMatchObject({ reduced: true, playing: false })
    expect(run(s, { type: 'advance' }).index).toBe(0)
  })

  it('a range loops inside its scenes', () => {
    let s = initPlayer({ count: 5, start: 2, end: 3, loop: true })
    expect(s.index).toBe(2)
    s = run(s, { type: 'advance' })
    expect(s.index).toBe(3)
    s = run(s, { type: 'advance' })
    expect(s).toMatchObject({ index: 2, playing: true, ended: false })
    expect(run(s, { type: 'goto', index: 0 }).index).toBe(2)
  })

  it('announces only after a user action, never on an automatic advance', () => {
    expect(run(fresh(), { type: 'advance' }).announce).toBeNull()
    expect(run(fresh(), { type: 'goto', index: 2 }).announce).toBe(2)
    expect(run(fresh(), { type: 'goto', index: 2 }, { type: 'advance' }).announce).toBeNull()
    expect(run(fresh(), { type: 'next' }).announce).toBe(1)
  })
})
