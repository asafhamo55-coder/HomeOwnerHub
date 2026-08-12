import { describe, it, expect, beforeAll } from 'vitest'
import { renderVisualBlock } from './visual-block'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
})

const ACCENT = '#2F8F5B'

describe('renderVisualBlock', () => {
  it('renders an image block with a versioned absolute URL', () => {
    const html = renderVisualBlock(
      { kind: 'illustration', asset: 'dog-leash-and-waste.png', alt: 'A dog owner at a waste station' },
      ACCENT,
    )
    expect(html).toContain('https://app.homeownerhub.com/email/v1/dog-leash-and-waste.png')
  })

  it('gives the image real alt text — for blocked images the alt IS the block', () => {
    const html = renderVisualBlock(
      { kind: 'illustration', asset: 'x.png', alt: 'A dog owner at a waste station' },
      ACCENT,
    )
    expect(html).toContain('alt="A dog owner at a waste station"')
  })

  it('rejects empty or decorative alt text', () => {
    expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: '' }, ACCENT))
      .toThrow(/alt/i)
    expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'illustration' }, ACCENT))
      .toThrow(/alt/i)
  })

  it('rejects alt text under the length floor', () => {
    for (const alt of ['x', '.', 'N/A', 'photo.']) {
      expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt }, ACCENT))
        .toThrow(/alt/i)
    }
  })

  it('rejects alt text that is just the asset filename', () => {
    for (const alt of ['IMG_1234.jpg', 'banner-image.png']) {
      expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt }, ACCENT))
        .toThrow(/alt/i)
    }
  })

  it('rejects a stoplist word wrapped in a leading article or trailing "of", even past the length floor', () => {
    for (const alt of ['an image', 'photo of', 'an illustration', 'illustration of']) {
      expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt }, ACCENT))
        .toThrow(/alt/i)
    }
  })

  it('sets explicit width and height so a blocked image reserves its space', () => {
    const html = renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'A real description' }, ACCENT)
    expect(html).toContain('width="600"')
    expect(html).toContain('height="200"')
  })

  it('paints the containing cell so a blocked image looks deliberate', () => {
    const html = renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'A real description' }, ACCENT)
    expect(html).toContain('bgcolor="#eaf1ed"')
  })

  it('delegates the meter kind and emits no image', () => {
    const html = renderVisualBlock(
      {
        kind: 'meter',
        label: 'Homes currently leased',
        valuePct: 12.5,
        capPct: 15,
        valueLabel: '10 of 80 homes',
        capLabel: '15% cap',
      },
      '#3A5AA8',
    )
    expect(html).toContain('Homes currently leased')
    expect(html).not.toContain('<img')
  })

  it('renders nothing for the none kind', () => {
    expect(renderVisualBlock({ kind: 'none' }, ACCENT)).toBe('')
  })

  it('rejects an accent color outside the required luminance window for image kinds', () => {
    expect(() =>
      renderVisualBlock(
        { kind: 'illustration', asset: 'x.png', alt: 'A real description here' },
        '#FFFFFF',
      ),
    ).toThrow(/luminance/i)
  })
})
