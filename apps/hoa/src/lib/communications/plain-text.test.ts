import { describe, expect, it } from 'vitest'
import { BUILT_IN_TEMPLATES } from './built-in-templates'
import { extractMergeFields } from './templates'
import { htmlToMessageText, htmlToPlainEditorText, isPlainEditorHtml, plainTextToHtml, smsSafeText } from './plain-text'

describe('htmlToMessageText (the email text part and SMS source)', () => {
  it('keeps paragraphs, bullets and link addresses', () => {
    const html = plainTextToHtml(
      "Hi [Resident's name],\n\nWater is **off** Thursday.\n\n- Fill jugs\n- Wait\n\nSee [the notice](https://example.org/n?a=1&b=2) or https://example.org/x",
    )
    expect(htmlToMessageText(html)).toBe(
      'Hi {{ recipient_name }},\n\nWater is off Thursday.\n\n- Fill jugs\n- Wait\n\nSee the notice (https://example.org/n?a=1&b=2) or https://example.org/x',
    )
  })

  it('decodes entities and makes punctuation SMS-safe', () => {
    expect(htmlToMessageText('<p>Smith&rsquo;s &amp; “Jones” – 9…2&nbsp;pm</p>')).toBe(`Smith's & "Jones" - 9...2 pm`)
  })

  it('drops a non-http link target, keeping its words', () => {
    expect(htmlToMessageText('<a href="javascript:alert(1)">click</a>')).toBe('click')
  })

  it('reads designed template HTML without tags', () => {
    const t = htmlToMessageText('<table><tr><td>Due</td></tr></table><div style="x">Pay <b>now</b></div>')
    expect(t).not.toMatch(/[<>]/)
    expect(t).toContain('Pay now')
  })
})

describe('smsSafeText', () => {
  it('leaves plain ASCII alone', () => {
    expect(smsSafeText('Pool closes at 9pm - bring towels.')).toBe('Pool closes at 9pm - bring towels.')
  })
  it('replaces typographic characters', () => {
    expect(smsSafeText('‘a’ “b” c—d e… •f g')).toBe(`'a' "b" c-d e... -f g`)
  })
})

describe('plainTextToHtml (BL-102 A3)', () => {
  it('turns paragraphs and line breaks into <p> and <br>', () => {
    expect(plainTextToHtml('Hello all,\n\nThe pool opens Saturday.\nBring a towel.')).toBe(
      '<p>Hello all,</p>\n<p>The pool opens Saturday.<br>Bring a towel.</p>',
    )
  })

  it('escapes everything the board typed, so text never becomes markup', () => {
    const html = plainTextToHtml('<script>alert(1)</script> & <img src=x onerror=alert(1)> "quoted"')
    expect(html).not.toMatch(/<script|<img/)
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;img src=x onerror=alert(1)&gt; &quot;quoted&quot;</p>')
  })

  it('makes **bold**, bullet lists and links', () => {
    expect(plainTextToHtml('Water is **off** Thursday.')).toBe('<p>Water is <strong>off</strong> Thursday.</p>')
    expect(plainTextToHtml('- Fill jugs\n- Skip the dishwasher')).toBe('<ul><li>Fill jugs</li><li>Skip the dishwasher</li></ul>')
    expect(plainTextToHtml('Details: https://example.org/water.')).toBe(
      '<p>Details: <a href="https://example.org/water">https://example.org/water</a>.</p>',
    )
    expect(plainTextToHtml('See [the notice](https://example.org/n?a=1&b=2)')).toBe(
      '<p>See <a href="https://example.org/n?a=1&amp;b=2">the notice</a></p>',
    )
  })

  it('never links a non-http scheme', () => {
    expect(plainTextToHtml('[click](javascript:alert(1))')).not.toContain('<a')
  })

  it('stores chips as the merge fields the send fills', () => {
    const html = plainTextToHtml("Hi [Resident's name],\n\n— [HOA name] Board")
    expect(html).toBe('<p>Hi {{ recipient_name }},</p>\n<p>— {{ association_name }} Board</p>')
    expect(extractMergeFields(html)).toEqual(['association_name', 'recipient_name'])
    // Curly apostrophe and other case work too.
    expect(plainTextToHtml('[resident’s NAME]')).toBe('<p>{{ recipient_name }}</p>')
  })

  it('keeps a template detail field as written', () => {
    expect(plainTextToHtml('Off on {{ shutoff_date }}')).toBe('<p>Off on {{ shutoff_date }}</p>')
  })

  it('gives empty HTML for empty text', () => {
    expect(plainTextToHtml('  \n\n ')).toBe('')
  })
})

describe('htmlToPlainEditorText', () => {
  it('reads the generated HTML back to the same text', () => {
    const text = "Hi [Resident's name],\n\nWater is **off** Thursday 9–2.\nSorry & thanks.\n\n- Fill jugs\n- Wait\n\nSee [the notice](https://example.org/n?a=1&b=2) or https://example.org/x"
    expect(htmlToPlainEditorText(plainTextToHtml(text))).toBe(text)
  })

  it('opens every built-in template in the plain editor, losslessly', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const text = htmlToPlainEditorText(t.bodyHtml)
      expect(text, t.id).not.toBeNull()
      // Round trip is stable: text → html → text gives the same text.
      expect(htmlToPlainEditorText(plainTextToHtml(text!)), t.id).toBe(text)
      // And keeps every merge field.
      expect(extractMergeFields(plainTextToHtml(text!)), t.id).toEqual(extractMergeFields(t.bodyHtml))
    }
  })

  it('refuses HTML it cannot keep, so it stays in HTML mode', () => {
    expect(htmlToPlainEditorText('<table><tr><td>x</td></tr></table>')).toBeNull()
    expect(htmlToPlainEditorText('<p style="color:red">x</p>')).toBeNull()
    expect(htmlToPlainEditorText('<p onclick="x()">x</p>')).toBeNull()
    expect(htmlToPlainEditorText('<a href="javascript:alert(1)">x</a>')).toBeNull()
    expect(htmlToPlainEditorText('<p>English</p><!-- hh:lang=es:start --><p>Hola</p>')).toBeNull()
    expect(htmlToPlainEditorText('<div>x</div>')).toBeNull()
    expect(isPlainEditorHtml('<img src=x onerror=alert(1)>')).toBe(false)
  })

  it('accepts plain text with no tags as one paragraph', () => {
    expect(htmlToPlainEditorText('Just words')).toBe('Just words')
  })
})
