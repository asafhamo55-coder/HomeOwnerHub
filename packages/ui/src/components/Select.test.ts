import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Select } from './Select'

// BL-059: an unset Select showed an empty box, not its placeholder — the
// "unset" value was passed to Radix as the '' sentinel, which no option
// carries, so Radix rendered neither an option nor the placeholder.
// (Server markup never holds a chosen option's label — Radix fills that in
// on the client — so the chosen cases assert the placeholder's absence.)

const opts = [h('option', { key: 'a', value: 'a' }, 'Alpha'), h('option', { key: 'b', value: 'b' }, 'Beta')]

describe('Select', () => {
  it('shows the placeholder while no value is chosen', () => {
    const html = renderToStaticMarkup(h(Select, { value: undefined, placeholder: 'Choose a vendor' }, opts))
    expect(html).toContain('Choose a vendor')
    expect(html).toContain('data-placeholder')
  })

  it('an explicit "" with no "" option is unset too', () => {
    const html = renderToStaticMarkup(h(Select, { value: '', placeholder: 'Choose a vendor' }, opts))
    expect(html).toContain('Choose a vendor')
  })

  it('a chosen value is not shown as the placeholder', () => {
    const html = renderToStaticMarkup(h(Select, { value: 'b', placeholder: 'Choose a vendor' }, opts))
    expect(html).not.toContain('Choose a vendor')
  })

  it('an explicit "" option (a filter’s "All") stays chosen, not the placeholder', () => {
    const withAll = [h('option', { key: '', value: '' }, 'All types'), ...opts]
    const html = renderToStaticMarkup(h(Select, { value: '', placeholder: 'Pick one' }, withAll))
    expect(html).not.toContain('Pick one')
    expect(html).not.toContain('data-placeholder')
  })
})
