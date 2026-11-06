import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMergeBag } from '@/lib/community-templates/merge-bag'
import { isValidAccent, relativeLuminance } from '@/lib/email/palette'
import { htmlToMessageText } from './plain-text'
import { BUILT_IN_TEMPLATES } from './built-in-templates'
import { buildRecipientBag } from './merge-bag'
import { extractMergeFields, renderTemplateStrict } from './templates'
import { draftRowFields, parseDraftState, type ComposerDraftState } from './drafts'
import {
  MADISON_PARK_PRESET,
  WELCOME_EMAIL_HREF,
  WELCOME_TEMPLATE_ID,
  buildWelcomeEmailHtml,
  buildWelcomePrefill,
  communityLine,
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
  })

/** Just the card body: between the shell's body cell and its footer cell. */
const bodyOf = (html: string) => html.slice(html.indexOf('class="eh-body"'), html.indexOf('bgcolor="#FAFAFA"'))

const stripTags = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')

describe('welcome email: render', () => {
  it('is personalized to Madison Park and its city, with a name-free greeting', () => {
    const { subject, html } = madison()
    expect(subject).toBe('Madison Park is moving to HomeownerHub')
    expect(html).toContain('Your new place for Madison Park')
    expect(html).toContain('Madison Park in Johns Creek, Georgia now uses HomeownerHub')
    expect(html).toContain('Hello,')
    expect(html).toContain('The Madison Park Board')
    expect(html).not.toMatch(/\{\{|\}\}/)
  })

  it('has no name merge, so no "SMITH, JOHN" or "Hi ,"', () => {
    expect(buildWelcomeEmailHtml(ORIGIN)).not.toMatch(/recipient_name|owner_name/)
    const t = BUILT_IN_TEMPLATES.find((x) => x.id === WELCOME_TEMPLATE_ID)!
    expect(extractMergeFields(`${t.subject}\n${t.bodyHtml}`).sort()).toEqual(['association_name', 'board_signature', 'city'])
  })

  it('is branded HomeownerHub in the shell band', () => {
    const { html } = madison()
    expect(html).toMatch(/>HomeownerHub<\/td>/)
    expect(isValidAccent('#1F6F5C')).toBe(true)
  })

  it('shell: lang attributes and a title equal to the subject', () => {
    const { subject, html } = madison()
    expect(html).toContain('<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">')
    expect(html).toContain(`<title>${subject}</title>`)
  })

  it('shell: footer and band are 14px, footer in #5B646C (about 6:1 on #FAFAFA)', () => {
    const { html } = madison()
    expect(html).toMatch(/bgcolor="#FAFAFA" style="[^"]*color:#5B646C;[^"]*font-size:14px/)
    expect(html).toMatch(/bgcolor="#1F6F5C" style="[^"]*font-size:14px/)
    const lum = (hex: string) => relativeLuminance(hex)
    const ratio = (lum('#FAFAFA') + 0.05) / (lum('#5B646C') + 0.05)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('escapes every value that can come from a person', () => {
    const { subject, html } = renderWelcomeEmail({
      origin: ORIGIN,
      associationName: 'Oak & <b>Vine</b>',
      city: 'Z"ion <script>alert(1)</script>',
      boardSignature: 'The "Board" <i>',
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<b>Vine')
    expect(html).toContain('Oak &amp; &lt;b&gt;Vine&lt;/b&gt;')
    expect(html).toContain('The &quot;Board&quot; &lt;i&gt;')
    expect(subject).toBe('Oak & <b>Vine</b> is moving to HomeownerHub')
  })

  it('has one secondary text link to the video page, no button, no typed /login URL', () => {
    const { html } = madison()
    expect(html).toContain(`href="${ORIGIN}/welcome"`)
    expect((html.match(/href="/g) ?? []).length).toBe(1)
    expect(html).toContain('Watch a short video about getting started')
    expect(html).not.toMatch(/<img|bgcolor="#1F6F5C" height|\/login/)
    expect(buildWelcomeEmailHtml(`${ORIGIN}/`)).toContain(`href="${ORIGIN}/welcome"`)
  })

  it('has no em dashes or en dashes anywhere', () => {
    const { subject, html } = madison()
    expect(subject + html).not.toMatch(/[–—]/)
    expect(subject + html).not.toMatch(/&mdash;|&ndash;|&#8212;|&#8211;/)
  })

  it('is short: about 220 words of body copy, down from 330', () => {
    const body = stripTags(bodyOf(madison().html))
    const words = body.split(' ').filter(Boolean).length
    expect(words).toBeGreaterThanOrEqual(120)
    expect(words).toBeLessThanOrEqual(230)
  })

  it('lists the three steps, the bullets and the sign-off', () => {
    const text = stripTags(madison().html)
    expect(text).toContain('Look in your inbox for an email from HomeownerHub inviting you to join. If you can t find it, check your spam or junk folder.')
    expect(text).not.toMatch(/different sender|Join Madison Park/)
    expect(text).toContain('check your spam or junk folder')
    expect(text).toContain('That signs you in. You don t need a password. The button works for 24 hours. If it stops working, reply to this email and the board will send a new one.')
    expect(text).toContain('Ask to join')
    for (const b of ['See your balance and how to pay', 'Send a request to the board and read the reply', 'Read announcements and documents', 'in plain words']) {
      expect(text).toContain(b)
    }
    expect(text).toContain('Tip: to keep HomeownerHub on your phone, open it, then tap Share (iPhone) or the three dots (Android), and choose Add to Home Screen.')
    expect(text).toContain('Questions? Reply to this email and the board will answer.')
    expect(text).not.toContain('Zelle')
    expect(text).not.toContain('pool')
  })

  it('plain-text version carries the steps, the video URL and the sign-off, with no image noise', () => {
    const text = htmlToMessageText(madison().html)
    expect(text).toContain('Look in your inbox for an email from HomeownerHub')
    expect(text).toContain('Tap the button in that email')
    expect(text).toContain('Ask to join')
    expect(text).toContain(`${ORIGIN}/welcome`)
    expect(text).toContain('Thank you,')
    expect(text).toContain('The Madison Park Board')
    expect(text).not.toMatch(/\[image\]|<img|<style|font-size/i)
  })

  it('the community line is conditional on the modules that are on', () => {
    const all = { amenities: true, polls: true, board: true }
    expect(communityLine(all)).toBe('Book the clubhouse, answer polls and talk with neighbors')
    expect(communityLine({ amenities: true, polls: false, board: true })).toBe('Book the clubhouse and talk with neighbors')
    expect(communityLine({ amenities: false, polls: true, board: false })).toBe('Answer polls')
    expect(communityLine({ amenities: false, polls: false, board: false })).toBeNull()
    expect(buildWelcomeEmailHtml(ORIGIN, all)).toContain('Book the clubhouse, answer polls and talk with neighbors')
    const off = buildWelcomeEmailHtml(ORIGIN, { amenities: false, polls: false, board: false })
    expect(off).not.toMatch(/clubhouse|polls|neighbors/)
    // M9, M11 and M13 are on in this build, so the default includes the line.
    expect(buildWelcomeEmailHtml(ORIGIN)).toContain('Book the clubhouse, answer polls and talk with neighbors')
  })

  it('never mentions features that are off (M8 online payments, M10 online voting)', () => {
    const text = stripTags(madison().html).toLowerCase()
    for (const word of ['credit card', 'debit card', 'card', 'ach', 'stripe', 'apple pay', 'google pay', 'online payment', 'pay online', 'autopay', 'ballot', 'online voting', 'election']) {
      expect(text, word).not.toMatch(new RegExp(`\\b${word}\\b`))
    }
  })

  it('uses no stock AI phrases', () => {
    const text = stripTags(madison().html).toLowerCase()
    for (const phrase of ['delve', 'seamless', 'leverage', 'unlock', 'elevate', 'streamline', 'game-changer', 'in today', 'we are thrilled', 'excited to announce', 'robust', 'empower']) {
      expect(text, phrase).not.toContain(phrase)
    }
  })

  it('every body text size is 16px or more (the footer is the shell’s 14px)', () => {
    const html = bodyOf(madison().html)
    const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(5)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
    const doc = madison().html
    const all = [...doc.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 1)
    expect(Math.min(...all)).toBeGreaterThanOrEqual(14)
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
    expect(html).toContain('Madison Park in Johns Creek, Georgia now uses HomeownerHub')
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
    expect(welcomePrefillAnswers({ associationName: '  madison PARK ' }).city).toBe('Johns Creek, Georgia')
    // Exact match only: a different association that merely starts with the name does not get the preset.
    expect(welcomePrefillAnswers({ associationName: 'Madison Park Estates', stateName: 'Georgia' }).city).toBe('Georgia')
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
    })
    writeFileSync(process.env.WELCOME_SAMPLE_OUT!, html)
    expect(html.length).toBeGreaterThan(1000)
  })
})
