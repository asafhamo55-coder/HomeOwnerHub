import { describe, expect, it } from 'vitest'
import { hasMarker, insertMarkers, isInlineImageType, pastedImageName, removeMarker } from './inline-images'

describe('inline images', () => {
  const now = new Date('2026-10-28T13:45:07.123Z')

  it('names pastes distinctly and by type', () => {
    expect(pastedImageName('image/png', now, 0)).toBe('pasted-image-20261028-134507.png')
    expect(pastedImageName('image/jpeg', now, 1)).toBe('pasted-image-20261028-134507-2.jpg')
  })

  it('only treats renderable images as inline', () => {
    expect(isInlineImageType('image/png')).toBe(true)
    expect(isInlineImageType('image/tiff')).toBe(false)
    expect(isInlineImageType('application/pdf')).toBe(false)
  })

  it('puts the marker on its own line at the caret', () => {
    const out = insertMarkers('Hi Pat,see this', 7, 7, ['a.png'])
    expect(out.body).toBe('Hi Pat,\n[image: a.png]\nsee this')
    expect(out.body.slice(0, out.caret)).toBe('Hi Pat,\n[image: a.png]\n')
  })

  it('replaces a selection and adds no extra blank lines', () => {
    expect(insertMarkers('Hi\nX\nBye', 3, 4, ['a.png', 'b.png']).body).toBe('Hi\n[image: a.png]\n[image: b.png]\nBye')
    expect(insertMarkers('', 0, 0, ['a.png']).body).toBe('[image: a.png]\n')
  })

  it('removes a marker and its line break', () => {
    const body = 'Hi\n[image: a.png]\nBye'
    expect(hasMarker(body, 'a.png')).toBe(true)
    expect(removeMarker(body, 'a.png')).toBe('Hi\nBye')
    expect(removeMarker('Hi [image: a.png]', 'a.png')).toBe('Hi ')
  })
})
