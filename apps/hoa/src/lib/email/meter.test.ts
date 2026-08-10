import { describe, it, expect } from 'vitest'
import { renderMeterHtml } from './meter'

const BASE = {
  label: 'Homes currently leased',
  valuePct: 12.5,
  capPct: 15,
  accentColor: '#3A5AA8',
  valueLabel: '10 of 80 homes',
  capLabel: '15% cap',
}

describe('renderMeterHtml', () => {
  it('contains no image at all', () => {
    expect(renderMeterHtml(BASE)).not.toContain('<img')
  })

  it('renders the fill as a percentage of the cap, not of 100', () => {
    // 12.5 of a 15 cap = 83.33% of the bar
    expect(renderMeterHtml(BASE)).toContain('width="83.3%"')
  })

  it('renders an empty bar at zero without dividing by zero', () => {
    const html = renderMeterHtml({ ...BASE, valuePct: 0 })
    expect(html).toContain('width="0%"')
    expect(html).not.toContain('NaN')
  })

  it('caps the fill at 100% when over the limit and marks it in TEXT', () => {
    const html = renderMeterHtml({ ...BASE, valuePct: 18, valueLabel: '15 of 80 homes' })
    expect(html).toContain('width="100%"')
    expect(html).toContain('over the cap')
  })

  it('does not rely on colour alone to signal over-cap', () => {
    const over = renderMeterHtml({ ...BASE, valuePct: 18 })
    const under = renderMeterHtml(BASE)
    // The distinguishing signal must survive a greyscale render.
    expect(over.replace(/#[0-9A-Fa-f]{6}/g, '')).not.toBe(under.replace(/#[0-9A-Fa-f]{6}/g, ''))
  })

  it('sets a foreground colour on every element that sets a background', () => {
    const html = renderMeterHtml(BASE)
    const bgs = html.match(/background-color:[^;"]+/g) ?? []
    expect(bgs.length).toBeGreaterThan(0)
    for (const m of html.matchAll(/style="([^"]*background-color:[^"]*)"/g)) {
      expect(m[1], `background without color: ${m[1]}`).toContain('color:')
    }
  })

  it('escapes the labels', () => {
    const html = renderMeterHtml({ ...BASE, label: '<script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects a cap of zero', () => {
    expect(() => renderMeterHtml({ ...BASE, capPct: 0 })).toThrow(/cap/i)
  })
})
