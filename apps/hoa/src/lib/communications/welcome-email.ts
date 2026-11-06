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
 * Merge fields (all supplied by the send): {{ association_name }} is ambient;
 * {{ city }} and {{ board_signature }} are the template's two questions. The
 * greeting is a plain "Hello," with no name: the send only has a full name,
 * and rosters hold "SMITH, JOHN" or nothing at all.
 *
 * The invitation is NOT sent from this mailer. It is Supabase Auth's email
 * (inviteUserByEmail), whose subject and sender change (OA-49, OA-51), so
 * step 1 names neither.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { assertAccent } from '@/lib/email/palette'
import { M9_APPLIED } from '@homeowner-portal/db/m9'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { M13_APPLIED } from '@homeowner-portal/db/m13'
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
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

assertAccent(ACCENT)

const P = `margin:0 0 16px;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};`
const H2 = `margin:28px 0 10px;font-size:20px;line-height:1.3;font-weight:700;color:${TEXT};font-family:${FONT};`
const LI = `margin:0 0 10px;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};`

/** Which community modules are on. Defaults to the build's switches (M11 booking, M9 polls, M13 neighbors board). */
export interface WelcomeModules {
  amenities: boolean
  polls: boolean
  board: boolean
}

export const DEFAULT_WELCOME_MODULES: WelcomeModules = {
  amenities: M11_APPLIED,
  polls: M9_APPLIED,
  board: M13_APPLIED,
}

/** "Book the clubhouse, answer polls and talk with neighbors", or only the parts that are on. Null when none are. */
export function communityLine(m: WelcomeModules): string | null {
  const parts = [
    m.amenities ? 'book the clubhouse' : null,
    m.polls ? 'answer polls' : null,
    m.board ? 'talk with neighbors' : null,
  ].filter((x): x is string => x !== null)
  if (parts.length === 0) return null
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

function item(text: string): string {
  return `<li style="${LI}">${text}</li>`
}

/**
 * The email body with the merge placeholders left in. `origin` is the app's
 * public origin (appOrigin()); the video page is `${origin}/welcome`. The
 * poster image is left out on purpose: it is optional, and an image URL
 * needs EMAIL_ASSET_BASE_URL, which the browser-side composer cannot read.
 * The video is a plain, secondary text link.
 */
export function buildWelcomeEmailHtml(origin: string, modules: WelcomeModules = DEFAULT_WELCOME_MODULES): string {
  const watch = `${origin.replace(/\/+$/, '')}/welcome`
  const community = communityLine(modules)

  const body = [
    `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;color:${TEXT};font-family:${FONT};">Your new place for {{ association_name }}</h1>`,
    `<p style="${P}">Hello,</p>`,
    `<p style="${P}">{{ association_name }} in {{ city }} now uses HomeownerHub, free for you on your phone or computer. You can see your balance, ask the board a question and read community news.</p>`,

    `<h2 style="${H2}">What to do now</h2>`,
    `<ol style="margin:0 0 8px;padding-left:26px;">`,
    item(
      'Look in your inbox for an email from HomeownerHub inviting you to join. If you can&rsquo;t find it, check your spam or junk folder.',
    ),
    item(
      'Tap the button in that email. That signs you in. You don&rsquo;t need a password. The button works for 24 hours. If it stops working, reply to this email and the board will send a new one.',
    ),
    item(
      'If the first screen says no home is linked yet, tap &ldquo;Ask to join&rdquo; and type your address. The board will approve it.',
    ),
    `</ol>`,

    `<h2 style="${H2}">What you can do</h2>`,
    `<ul style="margin:0 0 8px;padding-left:24px;">`,
    item('See your balance and how to pay'),
    item('Send a request to the board and read the reply'),
    item('Read announcements and documents'),
    item('Tap &ldquo;Ask&rdquo; any time for help in plain words'),
    ...(community ? [item(community)] : []),
    `</ul>`,

    `<p style="${P}margin-top:20px;"><a href="${escapeHtml(watch)}" style="color:${ACCENT};font-weight:700;text-decoration:underline;">Watch a short video about getting started</a></p>`,
    `<p style="${P}">Tip: to keep HomeownerHub on your phone, open it, then tap Share (iPhone) or the three dots (Android), and choose Add to Home Screen.</p>`,
    `<p style="${P}">Questions? Reply to this email and the board will answer.</p>`,
    `<p style="margin:24px 0 0;font-size:17px;line-height:1.6;color:${BODY};font-family:${FONT};">Thank you,<br>{{ board_signature }}</p>`,
  ].join('\n')

  return renderEmailDocument({
    title: WELCOME_SUBJECT,
    band: { text: 'HomeownerHub', color: ACCENT },
    previewText: 'Your balance, your requests and your news in one place. Look for the email that invites you to join.',
    bodyHtml: body,
    footerHtml:
      'Sent by the {{ association_name }} board through HomeownerHub. To stop these emails, reply and tell the board.',
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
  const isMadison = name.toLowerCase() === MADISON_PARK_PRESET.associationName.toLowerCase()
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
  modules?: WelcomeModules
}): { subject: string; html: string } {
  const bag = {
    association_name: escapeHtml(input.associationName),
    city: escapeHtml(input.city),
    board_signature: escapeHtml(input.boardSignature),
  }
  return {
    // The subject is plain text: unescaped.
    subject: renderTemplateStrict(WELCOME_SUBJECT, { association_name: input.associationName }),
    html: renderTemplateStrict(buildWelcomeEmailHtml(input.origin, input.modules), bag),
  }
}
