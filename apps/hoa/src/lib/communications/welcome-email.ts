/**
 * The "Welcome to HomeownerHub" email a board sends its residents when the
 * association moves onto the app. Pure: no database, no env reads (the app
 * origin is passed in), no clock.
 *
 * It is an ordinary built-in template (built-in-templates.ts), so it goes
 * out through the board's normal Communications flow: preview, a test send
 * to themselves, audience choice, opt-outs and the outbound guard. Nothing
 * here sends anything, and nothing sends it automatically.
 *
 * What the copy says is checked against the app, not assumed:
 *
 *   - Access. A resident without an account gets the board's invitation
 *     email (Settings, Members, "Invite owners": owner-invites-actions.ts
 *     inviteAllOwners, which calls auth.admin.inviteUserByEmail with
 *     redirectTo /auth/callback). The link signs them in and links their
 *     home; ChoosePasswordPrompt then offers an optional password. Later
 *     they sign in at /login with a password or "Email me a link". An
 *     account whose home is not linked yet uses "Ask to join" (/join, M5),
 *     which the board approves.
 *   - Features. Only what is on: polls (M9), booking (M11) and the
 *     neighbors board (M13). Online card payments (M8) and online voting
 *     (M10) are off, so dues are Zelle or check and neither is mentioned.
 *
 * Layout: the shared email shell (lib/email/shell.ts), light-only palette
 * with an explicit background on every cell so Gmail and Outlook dark mode
 * cannot turn text invisible, table layout, fluid down to a phone.
 *
 * Merge fields (all supplied by the send): {{ recipient_name }} and
 * {{ association_name }} are ambient per recipient; {{ city }} and
 * {{ board_signature }} are the template's two questions. The resident's
 * full name is the only name the send path has, so the greeting uses it
 * (as the other built-ins do) rather than a first name.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { assertAccent } from '@/lib/email/palette'
import { renderTemplateStrict } from './templates'

export const WELCOME_TEMPLATE_ID = 'builtin:welcome-homeownerhub'
/** `?from=welcome-email`: the Communications entry point that opens the composer on this template. */
export const WELCOME_EMAIL_FROM = 'welcome-email'
export const WELCOME_EMAIL_HREF = `/communications/new?from=${WELCOME_EMAIL_FROM}`

export const WELCOME_SUBJECT = '{{ association_name }} is moving to HomeownerHub'

/** Brand green, the receipt and notification accent. Inside the dark-mode luminance window. */
const ACCENT = '#1F6F5C'
const TEXT = '#1A1D21'
const BODY = '#2B3238'
const MUTED = '#5B646C'
const PANEL = '#F3F7F5'
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

assertAccent(ACCENT)

const P = `margin:0 0 16px;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};`
const H2 = `margin:28px 0 10px;font-size:20px;line-height:1.3;font-weight:700;color:${TEXT};font-family:${FONT};`
const LI = `margin:0 0 10px;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};`

/** A button 56px tall with 18px text. Padding lives on the cell because
 *  Outlook's Word engine ignores padding on an anchor. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;"><tr><td bgcolor="${ACCENT}" height="56" style="background-color:${ACCENT};border-radius:8px;height:56px;padding:0 34px;"><a href="${escapeHtml(href)}" style="display:inline-block;font-family:${FONT};font-size:18px;line-height:56px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

function step(n: number, title: string, text: string): string {
  return `<tr><td width="44" valign="top" style="padding:0 0 14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:17px;width:34px;height:34px;font-family:${FONT};font-size:17px;line-height:34px;font-weight:700;color:#ffffff;">${n}</td></tr></table></td><td valign="top" style="padding:0 0 14px;font-family:${FONT};font-size:17px;line-height:1.6;color:${BODY};"><strong style="color:${TEXT};">${title}</strong><br>${text}</td></tr>`
}

function bullet(text: string): string {
  return `<li style="${LI}">${text}</li>`
}

/**
 * The email body with the merge placeholders left in. `origin` is the app's
 * public origin (appOrigin()); the video page is `${origin}/welcome` and the
 * poster `${origin}/welcome/poster.jpg`.
 */
export function buildWelcomeEmailHtml(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  const watch = `${base}/welcome`
  const poster = `${base}/welcome/poster.jpg`
  const login = `${base}/login`

  const body = [
    `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;color:${TEXT};font-family:${FONT};">{{ association_name }} is moving to HomeownerHub</h1>`,
    `<p style="${P}">Hi {{ recipient_name }},</p>`,
    `<p style="${P}">{{ association_name }} in {{ city }} is moving to HomeownerHub. It puts your dues, your requests to the board and the latest news in one place, on your phone or your computer.</p>`,
    `<p style="${P}">The next minute is the easiest way to see how it works.</p>`,

    `<h2 style="${H2}">Watch: getting started (1 minute)</h2>`,
    `<a href="${escapeHtml(watch)}" style="text-decoration:none;"><img src="${escapeHtml(poster)}" width="556" alt="Watch the 1 minute video: getting started with HomeownerHub" style="display:block;width:100%;max-width:556px;height:auto;border:0;border-radius:8px;background-color:${PANEL};color:${TEXT};font-family:${FONT};font-size:17px;"></a>`,
    button(watch, 'Watch the video'),
    `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:${MUTED};font-family:${FONT};">It shows how to sign in the first time and where to find everything.</p>`,

    `<h2 style="${H2}">How to get started</h2>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    step(
      1,
      'Open your invitation',
      'Your board is sending you a separate email that invites you to join. Tap the link in it. If you do not see it, look in your spam folder.',
    ),
    step(
      2,
      'Sign in',
      `The link signs you in. You can choose a password if you like, or skip that. Next time, go to <a href="${escapeHtml(login)}" style="color:${ACCENT};font-weight:700;">${escapeHtml(login.replace(/^https?:\/\//, ''))}</a> and type your password, or tap &ldquo;Email me a link&rdquo;.`,
    ),
    step(
      3,
      'Check your home',
      'Your home and balance show on the first screen. If it says no home is linked yet, tap &ldquo;Ask to join&rdquo; and give your address. The board will approve it.',
    ),
    `</table>`,

    `<h2 style="${H2}">What you can do</h2>`,
    `<ul style="margin:0 0 8px;padding-left:22px;">`,
    bullet('See your balance and your statement.'),
    bullet('Pay your dues the way your board offers, by Zelle or by check. The app shows you how, step by step.'),
    bullet('Send a request to the board and see their replies.'),
    bullet('Book the clubhouse or the pool.'),
    bullet('Read announcements and find association documents.'),
    bullet('Answer quick polls from the board.'),
    bullet('Talk with your neighbors on the community message board.'),
    bullet('Get help any time. Tap Ask for answers in plain words, or open Account, then Help.'),
    `</ul>`,

    `<h2 style="${H2}">Add it to your phone&rsquo;s home screen</h2>`,
    `<p style="${P}"><strong style="color:${TEXT};">iPhone:</strong> open the link in Safari, tap the Share button, then tap &ldquo;Add to Home Screen&rdquo;.</p>`,
    `<p style="${P}"><strong style="color:${TEXT};">Android:</strong> open the link in Chrome, tap the menu (three dots), then tap &ldquo;Add to Home screen&rdquo;.</p>`,

    `<h2 style="${H2}">Questions?</h2>`,
    `<p style="${P}">Just reply to this email and the board will get back to you.</p>`,
    `<p style="margin:24px 0 0;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};">Thank you,<br>{{ board_signature }}</p>`,
  ].join('\n')

  return renderEmailDocument({
    band: { text: 'HomeownerHub', color: ACCENT },
    previewText: 'One place for your dues, your requests and your news. Watch a 1 minute video to get started.',
    bodyHtml: body,
    footerHtml:
      'Sent by the {{ association_name }} board through HomeownerHub. If you would rather not get emails like this, reply and tell the board.',
    fluid: true,
    // Phones: a little less side padding so the 17px text gets the width.
    extraCss: '@media only screen and (max-width:480px){.eh-page{padding:8px !important}.eh-body{padding:18px !important} }',
  })
}

// ─── Questions and the Madison Park preset ───────────────────────────

export interface WelcomeAnswers {
  city: string
  board_signature: string
}

/** The Madison Park preset the owner asked for. */
export const MADISON_PARK_PRESET = {
  associationName: 'Madison Park',
  city: 'Johns Creek, Georgia',
} as const

export function defaultBoardSignature(associationName: string): string {
  const name = associationName.trim()
  return name ? `The ${name} Board` : 'The Board of Directors'
}

/**
 * The answers the composer opens with for this board's association. Madison
 * Park gets its preset; any other association gets its state's name in the
 * city box (the app stores a state, not a city), which the board edits.
 */
export function welcomePrefillAnswers(input: { associationName: string; stateName?: string | null }): WelcomeAnswers {
  const name = input.associationName.trim()
  const isMadison = name.toLowerCase().startsWith(MADISON_PARK_PRESET.associationName.toLowerCase())
  return {
    city: isMadison ? MADISON_PARK_PRESET.city : (input.stateName?.trim() ?? ''),
    board_signature: defaultBoardSignature(name),
  }
}

export interface WelcomePrefill {
  templateId: typeof WELCOME_TEMPLATE_ID
  baseCategory: 'welcome'
  audience: 'everyone'
  answers: Record<string, string>
}

export function buildWelcomePrefill(input: { associationName: string; stateName?: string | null }): WelcomePrefill {
  return {
    templateId: WELCOME_TEMPLATE_ID,
    baseCategory: 'welcome',
    audience: 'everyone',
    answers: { ...welcomePrefillAnswers(input) },
  }
}

/**
 * The finished email for one resident, every value HTML-escaped. This is
 * what the Madison Park sample and the tests render; the real send does the
 * same substitution per recipient through renderTemplateStrict.
 */
export function renderWelcomeEmail(input: {
  origin: string
  associationName: string
  city: string
  boardSignature: string
  recipientName: string
}): { subject: string; html: string } {
  const bag = {
    association_name: escapeHtml(input.associationName),
    city: escapeHtml(input.city),
    board_signature: escapeHtml(input.boardSignature),
    recipient_name: escapeHtml(input.recipientName),
  }
  return {
    // The subject is plain text: unescaped.
    subject: renderTemplateStrict(WELCOME_SUBJECT, { association_name: input.associationName }),
    html: renderTemplateStrict(buildWelcomeEmailHtml(input.origin), bag),
  }
}
