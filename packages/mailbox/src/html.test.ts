import { describe, expect, it } from 'vitest'
import { htmlToText } from './html'

describe('htmlToText', () => {
  it('turns <br> into a line break', () => {
    expect(htmlToText('one<br>two')).toBe('one\ntwo')
  })

  it('breaks between adjacent block elements instead of running words together', () => {
    expect(htmlToText('Yes<div>Jenna Rivera</div>')).toBe('Yes\nJenna Rivera')
  })

  it('drops <style> content rather than emitting it as text', () => {
    expect(htmlToText('<style>body{color:red}</style>Hello')).toBe('Hello')
  })

  it('drops <script> content rather than emitting it as text', () => {
    expect(htmlToText('<script>alert(1)</script>Hello')).toBe('Hello')
  })

  it('decodes named entities', () => {
    expect(htmlToText('a&nbsp;&lt;b&gt;&amp;c')).toBe('a <b>&c')
  })

  it('decodes decimal and hex numeric entities', () => {
    expect(htmlToText('it&#39;s&#x2019;')).toBe("it's’")
  })

  // Marketing senders pad the preview line with hundreds of these. Left
  // undecoded they surface as literal "&zwnj;" all through the body.
  it('decodes the zero-width entities used as preheader padding', () => {
    expect(htmlToText('a&zwnj;&zwj;&shy;b')).toBe('a‌‍­b')
  })

  it('leaves an unrecognised entity alone rather than guessing', () => {
    expect(htmlToText('shares &notanentity; here')).toBe('shares &notanentity; here')
  })

  it('does not re-decode an escaped ampersand into a tag', () => {
    expect(htmlToText('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;')
  })

  it('collapses runs of blank lines down to one', () => {
    expect(htmlToText('a<br><br><br><br>b')).toBe('a\n\nb')
  })

  it('returns an empty string when the HTML carries no text', () => {
    expect(htmlToText('<div><img src="x.png"></div>')).toBe('')
  })

  it('strips the byte-order mark Apple Mail embeds mid-body', () => {
    expect(htmlToText('<div>﻿Hello</div>')).toBe('Hello')
  })
})
