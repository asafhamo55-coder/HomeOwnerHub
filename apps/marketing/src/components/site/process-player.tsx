'use client'
import * as React from 'react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { PROCESSES, type ProcessId } from '../../lib/process-demos'
import { initPlayer, playerReducer } from './player-machine'
import { ProcessScreen } from './process-screens'

// An in-page, code-built recreation of a real app screen that plays one
// workflow scene by scene. No video, no animation library: CSS transitions
// plus the small state machine in player-machine.ts.
//
// Behaviour: plays on its own while on screen and the tab is visible; pauses
// when scrolled away or the tab is hidden; Play/Pause, Back/Next and a
// clickable step bar for keyboard and pointer users. Under
// prefers-reduced-motion nothing auto-plays and each step is a still frame.
// The captions are the text alternative; the live region speaks only after a
// user action, never on an automatic advance.

const BTN_BASE =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const BTN = `${BTN_BASE} border-border-strong bg-surface text-foreground hover:bg-subtle`
const BTN_PRIMARY = `${BTN_BASE} border-transparent bg-primary text-primary-fg hover:bg-primary-hover`

export interface ProcessPlayerProps {
  process: ProcessId
  /** Only play these scenes (inclusive), and loop them. Used in benefit rows. */
  range?: [number, number]
  /** Fewer controls: Play/Pause and the step bar. */
  compact?: boolean
  className?: string
}

export function ProcessPlayer({ process, range, compact, className }: ProcessPlayerProps) {
  const def = PROCESSES[process]
  const scenes = def.scenes
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    initPlayer({ count: scenes.length, start: range?.[0], end: range?.[1], loop: !!range }),
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const [epoch, setEpoch] = useState(0)

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => dispatch({ type: 'reduced', value: mq.matches })
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // Off-screen pause
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Hidden-tab pause
  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState !== 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const live = state.playing && !state.reduced && visible && tabVisible

  useEffect(() => {
    if (live) setEpoch((e) => e + 1)
  }, [live])

  useEffect(() => {
    if (!live) return
    const t = setTimeout(() => dispatch({ type: 'advance' }), scenes[state.index]?.ms ?? 4000)
    return () => clearTimeout(t)
  }, [live, state.index, epoch, scenes])

  const indices = useMemo(() => {
    const out: number[] = []
    for (let i = state.start; i <= state.end; i++) out.push(i)
    return out
  }, [state.start, state.end])
  const pos = state.index - state.start + 1
  const total = indices.length
  const scene = scenes[state.index]
  const playLabel = state.ended ? 'Replay' : state.playing ? 'Pause' : 'Play'
  const PlayIcon = state.ended ? RotateCcw : state.playing ? Pause : Play
  const announce = state.announce === null ? '' : `Step ${state.announce - state.start + 1} of ${total}: ${scenes[state.announce]?.caption ?? ''}`

  return (
    <figure ref={rootRef} className={cn('m-0', className)}>
      <div role="group" aria-roledescription="interactive demo" aria-label={def.title}>
        <div aria-hidden>
          <ProcessScreen id={process} scene={state.index} live={live} reduced={state.reduced} />
        </div>

        <div className="theme-light mt-3 rounded-2xl border border-border bg-surface p-3 text-foreground">
        <div className="flex flex-wrap items-center gap-2">
          {state.reduced ? null : (
            <button type="button" onClick={() => dispatch({ type: 'toggle' })} className={BTN_PRIMARY}>
              <PlayIcon className="h-4 w-4" aria-hidden />
              {playLabel}
            </button>
          )}
          {compact && !state.reduced ? null : (
            <>
              <button type="button" onClick={() => dispatch({ type: 'back' })} disabled={state.index <= state.start} className={BTN}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Back
              </button>
              <button type="button" onClick={() => dispatch({ type: 'next' })} disabled={state.index >= state.end} className={BTN}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
          <span className="ml-auto text-sm tabular-nums text-muted">
            Step {pos} of {total}
          </span>
        </div>

        <ol className="mt-1 flex gap-1.5" aria-label="Steps">
          {indices.map((i) => {
            const n = i - state.start + 1
            const cur = i === state.index
            return (
              <li key={i} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'goto', index: i })}
                  aria-label={`Step ${n}: ${scenes[i].caption}`}
                  aria-current={cur ? 'step' : undefined}
                  className="group flex min-h-[44px] w-full items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-border-strong group-hover:bg-muted">
                    {i < state.index || (cur && !state.playing) || (cur && state.reduced) ? (
                      <span className="absolute inset-0 rounded-full bg-primary" />
                    ) : cur ? (
                      <span
                        key={`${i}-${epoch}`}
                        data-running="true"
                        data-paused={live ? 'false' : 'true'}
                        className="pp-bar absolute inset-0 rounded-full bg-primary"
                        style={{ animationDuration: `${scene.ms}ms` }}
                      />
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <p className="mt-1 min-h-[3.25rem] text-base font-medium text-foreground sm:min-h-[1.75rem]">{scene.caption}</p>
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </div>
      </div>
      <figcaption className="mt-1 text-xs text-muted">Sample screen, made-up data.</figcaption>
    </figure>
  )
}
