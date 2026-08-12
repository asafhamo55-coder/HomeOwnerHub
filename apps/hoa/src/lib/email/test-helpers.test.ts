import { describe, it, expect } from 'vitest'
import { findBackgroundWithoutColor } from './test-helpers'

describe('findBackgroundWithoutColor', () => {
  it('flags a background-color with no color at all', () => {
    const html = '<td style="background-color:#fff;padding:2px;">x</td>'
    expect(findBackgroundWithoutColor(html)).toEqual(['background-color:#fff;padding:2px;'])
  })

  it('does not flag background-color followed by a real color', () => {
    const html = '<td style="background-color:#fff;color:#000;">x</td>'
    expect(findBackgroundWithoutColor(html)).toEqual([])
  })

  it('is order independent — color before background-color also counts', () => {
    const html = '<td style="color:#000;background-color:#fff;">x</td>'
    expect(findBackgroundWithoutColor(html)).toEqual([])
  })

  it('does not let border-color satisfy the requirement', () => {
    const html = '<td style="background-color:#fff;border-color:#ccc;">x</td>'
    expect(findBackgroundWithoutColor(html)).toEqual(['background-color:#fff;border-color:#ccc;'])
  })

  it('does not let outline-color satisfy the requirement', () => {
    const html = '<td style="background-color:#fff;outline-color:#ccc;">x</td>'
    expect(findBackgroundWithoutColor(html)).toEqual(['background-color:#fff;outline-color:#ccc;'])
  })

  it('ignores elements with no background-color at all', () => {
    const html = '<td style="padding:2px;color:#000;">x</td><span style="font-weight:700;">y</span>'
    expect(findBackgroundWithoutColor(html)).toEqual([])
  })

  it('reports exactly the violators among multiple elements', () => {
    const html = [
      '<td style="background-color:#fff;color:#000;">ok</td>',
      '<td style="background-color:#eee;padding:4px;">bad-1</td>',
      '<span style="color:#111;">unrelated</span>',
      '<td style="background-color:#ddd;border-color:#aaa;">bad-2</td>',
    ].join('')
    expect(findBackgroundWithoutColor(html)).toEqual([
      'background-color:#eee;padding:4px;',
      'background-color:#ddd;border-color:#aaa;',
    ])
  })
})
