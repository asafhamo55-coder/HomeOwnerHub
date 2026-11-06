import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMergeBag } from '@/lib/community-templates/merge-bag'
import { isValidAccent } from '@/lib/email/palette'
import { BUILT_IN_TEMPLATES } from './built-in-templates'
import { buildRecipientBag } from './merge-bag'
import { renderTemplateStrict } from './templates'
import { draftRowFields, parseDraftState, type ComposerDraftState } from './drafts'
import {
  MADISON_PARK_PRESET,
  WELCOME_EMAIL_HREF,
  WELCOME_TEMPLATE_ID,
  buildWelcomeEmailHtml,
  buildWelcomePrefill,
  renderWelcomeEmail,
  welcomePrefillAnswers,
} from './welcome-email'

const ORIGIN = 'https://app.example.test'

const madison = () =>
  renderWelcomeEmail({
    origin: ORIGIN,
    associationName: MADISON_PARK_PRESET.associationName,
    city: MADISON_PARK_PRESET.city,
    boardSignature: 'The Madison Park Board',
    recipientName: 'Sam Rivera',
  })

const stripTags = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')

describe('welcome email: render', () => {
  it('is personalized to Madison Park, its city, the signature and the resident', () => {
    const { subject, html } = madison()
    expect(subject).toBe('Madison Park is moving to HomeownerHub')
    expect(html).toContain('Madison Park is moving to HomeownerHub')
    expect(html).toContain('Madison Park in Johns Creek, Georgia is moving to HomeownerHub')
    expect(html).toContain('Hi Sam Rivera,')
    expect(html).toContain('The Madison Park Board')
    expect(html).not.toMatch(/\{\{|\}\}/)
  })

  it('is branded HomeownerHub in the shell band', () => {
    const { html } = madison()
    expect(html).toMatch(/>HomeownerHub<\/td>/)
    expect(html).toContain('width="100%"')
    expect(isValidAccent('#1F6F5C')).toBe(true)
  })

  it('escapes every value that can come from a person', () => {
    const { subject, html } = renderWelcomeEmail({
      origin: ORIGIN,
      associationName: 'Oak & <b>Vine</b>',
      city: 'Z"ion <script>alert(1)</script>',
      boardSignature: 'The "Board" <i>',
      recipientName: 'Tom <img src=x onerror=1> & Jane',
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Vine')
    expect(html).toContain('Oak &amp; &lt;b&gt;Vine&lt;/b&gt;')
    expect(html).toContain('Tom &lt;img src=x onerror=1&gt; &amp; Jane')
    expect(html).toContain('The &quot;Board&quot; &lt;i&gt;')
    // The subject is plain text, so it keeps the raw name.
    expect(subject).toBe('Oak & <b>Vine</b> is moving to HomeownerHub')
  })

  it('links the video page and the poster on the app origin', () => {
    const { html } = madison()
    expect(html).toContain(`href="${ORIGIN}/welcome"`)
    expect(html).toContain(`src="${ORIGIN}/welcome/poster.jpg"`)
    // The poster and the button both open the video page, and a trailing slash on the origin is tolerated.
    expect((html.match(new RegExp(`href="${ORIGIN}/welcome"`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(buildWelcomeEmailHtml(`${ORIGIN}/`)).toContain(`href="${ORIGIN}/welcome"`)
    expect(html).toContain(`${ORIGIN}/login`)
    expect(html).toContain('Watch: getting started (1 minute)')
  })

  it('does not need the poster or video to exist: the image has alt text and a fallback colour', () => {
    const { html } = madison()
    expect(html).toMatch(/<img [^>]*alt="Watch the 1 minute video[^"]*"/)
    expect(html).toMatch(/<img [^>]*background-color:#F3F7F5/)
  })

  it('has no em dashes or en dashes anywhere', () => {
    const { subject, html } = madison()
    expect(subject + html).not.toMatch(/[–—]/)
    expect(subject + html).not.toMatch(/&mdash;|&ndash;|&#8212;|&#8211;/)
    expect(buildWelcomeEmailHtml(ORIGIN)).not.toMatch(/[–—]/)
  })

  it('lists three numbered steps and the features that are on', () => {
    const text = stripTags(madison().html)
    for (const title of ['Open your invitation', 'Sign in', 'Check your home']) expect(text).toContain(title)
    expect(madison().html.match(/border-radius:17px/g)?.length).toBe(3)
    expect(text).toContain('See your balance and your statement')
    expect(text).toContain('Zelle or by check')
    expect(text).toContain('Send a request to the board')
    expect(text).toContain('Book the clubhouse or the pool')
    expect(text).toContain('Read announcements and find association documents')
    expect(text).toContain('Answer quick polls')
    expect(text).toContain('community message board')
    expect(text).toContain('Account, then Help')
    expect(text).toContain('Add it to your phone')
    expect(text).toMatch(/iPhone:.*Add to Home Screen/)
    expect(text).toMatch(/Android:.*Add to Home screen/)
    expect(text).toContain('reply to this email')
  })

  it('never mentions features that are off (M8 online payments, M10 online voting)', () => {
    const text = stripTags(madison().html).toLowerCase()
    for (const word of ['credit card', 'debit card', 'card', 'ach', 'stripe', 'apple pay', 'google pay', 'online payment', 'pay online', 'autopay', 'ballot', 'vote online', 'online voting', 'election']) {
      expect(text, word).not.toMatch(new RegExp(`\\b${word}\\b`))
    }
  })

  it('uses no stock AI phrases', () => {
    const text = stripTags(madison().html).toLowerCase()
    for (const phrase of ['delve', 'seamless', 'leverage', 'unlock', 'elevate', 'streamline', 'game-changer', 'in today', 'we are thrilled', 'excited to announce', 'robust', 'empower']) {
      expect(text, phrase).not.toContain(phrase)
    }
  })

  it('has a call-to-action at least 48px tall with text of 17px or more, and body text of 17px', () => {
    const html = buildWelcomeEmailHtml(ORIGIN)
    const btn = html.match(/<td bgcolor="#1F6F5C" height="(\d+)"[^>]*>\s*<a [^>]*font-size:(\d+)px;line-height:(\d+)px/)
    expect(btn).not.toBeNull()
    expect(Number(btn![1])).toBeGreaterThanOrEqual(48)
    expect(Number(btn![2])).toBeGreaterThanOrEqual(17)
    expect(Number(btn![3])).toBeGreaterThanOrEqual(48)
    // Every paragraph and list item is 17px or larger, except the one small caption.
    const sizes = [...html.matchAll(/<(p|li) style="[^"]*font-size:(\d+)px/g)].map((m) => Number(m[2]))
    expect(sizes.filter((s) => s < 17).length).toBeLessThanOrEqual(1)
  })

  it('survives dark mode and Outlook: bgcolor attributes, no gradients, no external css', () => {
    const html = madison().html
    expect(html).toMatch(/<td[^>]*bgcolor="#1F6F5C"/)
    expect(html).toContain('bgcolor="#FFFFFF"')
    expect(html).not.toMatch(/linear-gradient|<link |@import|<script/i)
    expect(html).toContain('<!--[if mso]>')
    expect(html).toContain('<meta name="viewport"')
  })
})

describe('welcome email: built-in template', () => {
  const t = BUILT_IN_TEMPLATES.find((x) => x.id === WELCOME_TEMPLATE_ID)!

  it('is a built-in "Welcome to HomeownerHub" welcome template for email', () => {
    expect(t.name).toBe('Welcome to HomeownerHub')
    expect(t.category).toBe('welcome')
    expect(t.channels).toEqual(['email'])
    expect(t.questions.map((q) => q.id)).toEqual(['city', 'board_signature'])
  })

  it('renders through the real send bag for a resident, with the association name', () => {
    const extraFields = buildMergeBag(t.questions, { city: 'Johns Creek, Georgia', board_signature: 'The Madison Park Board' }, {})
    const bag = buildRecipientBag({
      extraFields,
      recipient: { email: 'resident@example.test', recipient_name: 'Sam Rivera', unit_id: 'u1' },
      associationName: 'Madison Park',
    })
    const html = renderTemplateStrict(t.bodyHtml, bag)
    expect(html).toContain('Madison Park in Johns Creek, Georgia is moving to HomeownerHub')
    expect(renderTemplateStrict(t.subject, bag)).toBe('Madison Park is moving to HomeownerHub')
  })

  it('falls back to a plain sign-off when the board leaves it blank', () => {
    const extraFields = buildMergeBag(t.questions, { city: 'Johns Creek, Georgia' }, {})
    expect(extraFields.board_signature).toBe('The Board of Directors')
  })
})

describe('welcome email: draft prefill', () => {
  it('uses the board’s own association: Madison Park gets its preset', () => {
    const p = buildWelcomePrefill({ associationName: 'Madison Park', stateName: 'Georgia' })
    expect(p.templateId).toBe(WELCOME_TEMPLATE_ID)
    expect(p.baseCategory).toBe('welcome')
    expect(p.audience).toBe('everyone')
    expect(p.answers).toEqual({ city: 'Johns Creek, Georgia', board_signature: 'The Madison Park Board' })
    // Common variants of the real name still match.
    expect(welcomePrefillAnswers({ associationName: 'Madison Park HOA' }).city).toBe('Johns Creek, Georgia')
  })

  it('never puts Madison Park on another association', () => {
    const a = welcomePrefillAnswers({ associationName: 'Lakeside HOA', stateName: 'Florida' })
    expect(a).toEqual({ city: 'Florida', board_signature: 'The Lakeside HOA Board' })
    expect(JSON.stringify(a)).not.toMatch(/Madison|Johns Creek/)
    expect(welcomePrefillAnswers({ associationName: 'Lakeside HOA' }).city).toBe('')
  })

  it('opens as a draft that sends nothing: a draft row has no recipients, schedule or template link', () => {
    const state: ComposerDraftState = {
      v: 1,
      step: 0,
      templateId: WELCOME_TEMPLATE_ID,
      baseCategory: 'welcome',
      audience: 'everyone',
      checkedResidentIds: [],
      checkedBoardIds: [],
      manualContacts: [],
      selectedPropertyId: '',
      selectedStreetKey: '',
      streetOwnersOnly: false,
      answers: buildWelcomePrefill({ associationName: 'Madison Park' }).answers,
      subject: 'Madison Park is moving to HomeownerHub',
      bodyHtml: BUILT_IN_BODY(),
      channels: ['email'],
      urgency: 'routine',
      channelsTouched: false,
      scheduledFor: '',
      spanish: null,
      officialNotice: false,
      followUp: null,
    }
    const row = draftRowFields(state)
    expect(row.scheduled_for).toBeNull()
    expect(row.template_id).toBeNull()
    expect(row.audience_definition.kind).toBe('draft')
    expect(parseDraftState(row.audience_definition.composer)?.templateId).toBe(WELCOME_TEMPLATE_ID)
  })

  it('has a board-side entry that only links to the composer; no module here can send', () => {
    expect(WELCOME_EMAIL_HREF).toBe('/communications/new?from=welcome-email')
    const here = (f: string) => readFileSync(join(__dirname, f), 'utf8')
    const welcome = here('welcome-email.ts')
    expect(welcome).not.toMatch(/from '@\/lib\/email'|from '\.\/send'|from '\.\/deliver'|sendEmail|sendCommunication|fetch\(/)
    const page = readFileSync(join(__dirname, '../../app/(dashboard)/communications/page.tsx'), 'utf8')
    expect(page).toContain('WELCOME_EMAIL_HREF')
    const newPage = readFileSync(join(__dirname, '../../app/(dashboard)/communications/new/page.tsx'), 'utf8')
    expect(newPage).not.toMatch(/sendCommunication|sendEmail/)
  })
})

function BUILT_IN_BODY(): string {
  return BUILT_IN_TEMPLATES.find((x) => x.id === WELCOME_TEMPLATE_ID)!.bodyHtml
}

// Opt-in: writes the rendered Madison Park email so the owner can look at it.
//   WELCOME_SAMPLE_OUT=/path/file.html pnpm vitest run welcome-email
describe.skipIf(!process.env.WELCOME_SAMPLE_OUT)('welcome email: sample file', () => {
  it('writes the Madison Park email', () => {
    const origin = process.env.WELCOME_SAMPLE_ORIGIN ?? 'https://www.homeownerledger.com'
    const { html } = renderWelcomeEmail({
      origin,
      associationName: MADISON_PARK_PRESET.associationName,
      city: MADISON_PARK_PRESET.city,
      boardSignature: 'The Madison Park Board',
      recipientName: 'Sample Resident',
    })
    writeFileSync(process.env.WELCOME_SAMPLE_OUT!, html)
    expect(html.length).toBeGreaterThan(1000)
  })
})
