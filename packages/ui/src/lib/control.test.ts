import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import tailwind from 'tailwindcss'
import { createTailwindConfig } from '../../tailwind.config'
import { controlBase } from './control'
import { Input } from '../components/Input'
import { Select } from '../components/Select'

// BL-059: `read-only:bg-subtle` compiles to the :read-only pseudo-class,
// which matches every element that is not user-editable — so every Select
// trigger (a <button>) and every prefixed Input's wrapper (a <div>) rendered
// grey. Only a control that really carries `readonly` may be greyed.

/** The class list of the first element matching `tag` in the markup. */
function classesOf(html: string, tag: string): string[] {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*\\sclass="([^"]*)"`))
  if (!m) throw new Error(`no <${tag}> in markup`)
  return m[1].replace(/&amp;/g, '&').split(/\s+/)
}

/** Compile classes through the app's real Tailwind config. postcss is
 *  Tailwind's own dependency, resolved from beside it. */
type Postcss = (plugins: unknown[]) => { process(css: string, opts: { from: undefined }): PromiseLike<{ css: string }> }

async function compile(classes: string): Promise<string> {
  const postcss = createRequire(require.resolve('tailwindcss'))('postcss') as Postcss
  const config = { ...createTailwindConfig('hoa'), content: [{ raw: `<i class="${classes}"></i>`, extension: 'html' }] }
  const out = await postcss([tailwind(config)]).process('@tailwind utilities;', { from: undefined })
  return out.css
}

describe('controlBase greys only genuinely read-only controls (BL-059)', () => {
  it('compiles to a [readonly] attribute selector, never the :read-only pseudo-class', async () => {
    const css = await compile(controlBase)
    expect(css).not.toContain(':read-only')
    const rule = css.match(/([^{}]*\[readonly\][^{}]*)\{([^}]*)\}/)
    expect(rule, 'a [readonly] rule').not.toBeNull()
    expect(rule![2]).toMatch(/background-color/)
  })

  it('the old variant really was the pseudo-class (guards the guard)', async () => {
    expect(await compile('read-only:bg-subtle')).toContain(':read-only')
  })

  it('a Select trigger is not greyed', () => {
    const html = renderToStaticMarkup(h(Select, { value: 'a' }, h('option', { value: 'a' }, 'Alpha')))
    const cls = classesOf(html, 'button')
    expect(cls).toContain('bg-surface')
    expect(cls).not.toContain('bg-subtle')
    expect(cls.filter((c) => c.startsWith('read-only:'))).toEqual([])
  })

  it('a prefixed Input wrapper is not greyed unless the input is read-only', () => {
    const editable = classesOf(renderToStaticMarkup(h(Input, { prefix: '$', defaultValue: '5' })), 'div')
    expect(editable).toContain('bg-surface')
    expect(editable).not.toContain('bg-subtle')
    expect(editable.filter((c) => c.startsWith('read-only:'))).toEqual([])

    const readOnly = classesOf(renderToStaticMarkup(h(Input, { prefix: '$', value: '5', readOnly: true })), 'div')
    expect(readOnly).toContain('bg-subtle')
    expect(readOnly).not.toContain('bg-surface')
  })

  it('a plain read-only Input keeps the readonly attribute the grey keys on', () => {
    const html = renderToStaticMarkup(h(Input, { value: 'x', readOnly: true }))
    expect(html).toMatch(/<input[^>]*\sreadOnly=""|<input[^>]*\sreadonly=""/)
    expect(classesOf(html, 'input')).toContain('[&[readonly]]:bg-subtle')
  })
})
