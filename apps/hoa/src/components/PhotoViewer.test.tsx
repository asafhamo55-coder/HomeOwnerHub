// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { PhotoViewer } from './PhotoViewer'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const photos = [1, 2, 3].map((n) => ({ src: `https://x.test/p${n}.jpg?sig=${n}`, alt: `Photo ${n} of the violation` }))
let root: Root | null = null
let host: HTMLElement | null = null

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<PhotoViewer photos={photos} />)
  })
}
const dialog = () => document.querySelector('[role="dialog"]')
const key = (k: string) =>
  act(async () => {
    ;(dialog() as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  document.body.innerHTML = ''
})

describe('PhotoViewer', () => {
  it('opens at the clicked index and shows the counter and original link', async () => {
    await mount()
    const thumbs = host!.querySelectorAll('button')
    await act(async () => thumbs[1]!.click())
    expect(dialog()).not.toBeNull()
    expect(dialog()!.textContent).toContain('2 of 3')
    expect(dialog()!.querySelector('img')!.getAttribute('src')).toBe(photos[1]!.src)
    expect(dialog()!.querySelector('a')!.getAttribute('href')).toBe(photos[1]!.src)
  })

  it('arrow keys move and wrap at the ends', async () => {
    await mount()
    await act(async () => host!.querySelectorAll('button')[2]!.click())
    await key('ArrowRight')
    expect(dialog()!.textContent).toContain('1 of 3')
    await key('ArrowLeft')
    expect(dialog()!.textContent).toContain('3 of 3')
    await act(async () => (dialog()!.querySelector('[aria-label="Previous photo"]') as HTMLElement).click())
    expect(dialog()!.textContent).toContain('2 of 3')
  })

  it('Escape closes and returns focus to the thumbnail', async () => {
    await mount()
    const thumb = host!.querySelectorAll('button')[1]!
    await act(async () => thumb.click())
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(thumb)
  })
})
