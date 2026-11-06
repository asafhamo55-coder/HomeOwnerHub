import QRCode from 'qrcode'
import { readBoardContacts, type BoardContact } from '@/lib/association-contacts'

/**
 * The printable "How to join HomeownerHub" notice for owners who do not read
 * email. Pure helpers: the page loads the association, these shape it.
 *
 * What really happens (verified against the code, 2026-11-06):
 * - The board's invitation email (lib/owner-invites.ts, inviteUserByEmail
 *   with redirectTo /auth/callback) links the owner straight in.
 * - /join (app/join/page.tsx) sends a signed-out visitor to
 *   /login?redirect=/join. The login screen offers "Create an account";
 *   signup confirms the email and lands on /onboarding, which carries the
 *   "Ask to join your home" link back to /join (app/onboarding/page.tsx).
 * - /join asks for street address and ZIP (AskToJoinForm.tsx). The request
 *   goes to the board's Approvals queue; nothing is linked until they approve.
 */

export const JOIN_PATH = '/join'
export const WELCOME_PATH = '/welcome'
/** Most contacts printed; the notice is one page. */
export const MAX_NOTICE_CONTACTS = 2

/** "https://example.org/join" shown as "example.org/join". */
export function displayAddress(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

/** The QR code as an SVG string: black on white, quiet zone included. */
export async function joinQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/** Contacts worth printing: ones with a phone or an email, capped. */
export function noticeContacts(complianceSettings: unknown): BoardContact[] {
  return readBoardContacts(complianceSettings)
    .filter((c) => c.phone !== '' || c.email !== '')
    .slice(0, MAX_NOTICE_CONTACTS)
}

export const NOTICE_STEPS = [
  {
    title: 'Look for our email.',
    body: 'If the board has your email address, an invitation from HomeownerHub is waiting. Tap the button in it. You are in, and you can stop here.',
  },
  {
    title: 'No email? Open the web address below.',
    body: 'Type it, or point your phone camera at the square code. Tap "Create an account", then confirm your email. A family member\'s email works.',
  },
  {
    title: 'Ask to join your home.',
    body: 'After you confirm your email, this page opens on its own. Type your street address and ZIP code. Your board checks it and approves you. Then your home shows when you sign in.',
  },
] as const
