// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { ProcessPlayer } from './process-player'
import { PROCESSES } from '../../lib/process-demos'

let root: Root | null = null
let host: HTMLElement | null = null

function mount(reduced = false, props: Partial<React.ComponentProps<typeof ProcessPlayer>> = {}) {
  vi.useFakeTimers()
  window.matchMedia = ((q: string) => ({
    matches: reduced && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<ProcessPlayer process="violations" {...props} />))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
})

const btn = (name: RegExp | string) =>
  Array.from(document.querySelectorAll('button')).find((b) => {
    const label = b.getAttribute('aria-label') ?? b.textContent ?? ''
    return typeof name === 'string' ? label.trim() === name : name.test(label)
  }) as HTMLButtonElement | undefined
const stepText = () => host!.textContent!.match(/Step (\d) of (\d)/)![1]
const live = () => host!.querySelector('[aria-live="polite"]')!.textContent
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('ProcessPlayer', () => {
  const scenes = PROCESSES.violations.scenes

  it('auto-advances, then ends on Replay', () => {
    mount()
    expect(stepText()).toBe('1')
    wait(scenes[0].ms + 50)
    expect(stepText()).toBe('2')
    for (let i = 1; i < scenes.length; i++) wait(scenes[i].ms + 50)
    expect(stepText()).toBe(String(scenes.length))
    expect(btn('Replay')).toBeTruthy()
    act(() => btn('Replay')!.click())
    expect(stepText()).toBe('1')
    expect(btn('Pause')).toBeTruthy()
  })

  it('pauses and resumes', () => {
    mount()
    act(() => btn('Pause')!.click())
    wait(20000)
    expect(stepText()).toBe('1')
    expect(btn('Play')).toBeTruthy()
    act(() => btn('Play')!.click())
    wait(scenes[0].ms + 50)
    expect(stepText()).toBe('2')
  })

  it('jumps to a step from the step bar and announces it', () => {
    mount()
    act(() => btn(/^Step 4:/)!.click())
    expect(stepText()).toBe('4')
    expect(live()).toBe(`Step 4 of ${scenes.length}: ${scenes[3].caption}`)
  })

  it('stays silent in the live region on automatic advances', () => {
    mount()
    wait(scenes[0].ms + 50)
    expect(stepText()).toBe('2')
    expect(live()).toBe('')
  })

  it('reduced motion: no auto-play, no Play button, Next and Back work', () => {
    mount(true)
    expect(btn('Play')).toBeUndefined()
    expect(btn('Pause')).toBeUndefined()
    wait(60000)
    expect(stepText()).toBe('1')
    act(() => btn('Next')!.click())
    expect(stepText()).toBe('2')
    act(() => btn('Back')!.click())
    expect(stepText()).toBe('1')
  })

  it('every control has an accessible name, a 44px target, and the group is labelled', () => {
    mount()
    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(4)
    for (const b of buttons) {
      expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim().length).toBeGreaterThan(0)
      expect(b.className).toMatch(/min-h-\[44px\]/)
    }
    expect(host!.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe(PROCESSES.violations.title)
  })

  it('a range player loops its own scenes', () => {
    mount(false, { range: [1, 2], compact: true })
    expect(stepText()).toBe('1')
    wait(scenes[1].ms + 50)
    expect(stepText()).toBe('2')
    wait(scenes[2].ms + 50)
    expect(stepText()).toBe('1')
  })
})
