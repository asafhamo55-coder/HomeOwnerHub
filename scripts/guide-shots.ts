/**
 * scripts/guide-shots.ts — the declared shot list for user-guide screenshots
 * (BL-070, spec §5.2). `pnpm ui:shots --guide` captures these into
 * apps/hoa/public/guide/shots/<name>--<width>.webp plus manifest.json;
 * `pnpm guide:check` fails when an article embeds a shot that is not listed
 * here or whose webp is missing.
 *
 * Seed data only (scripts/ui-shots-seed*.ts): reserved-TLD emails and
 * "Demo"/"Sample" addresses, never real people.
 */
import type { Shot } from './ui-shots-list'

export interface GuideShot extends Shot {
  /** Route template the shot shows; its page dir feeds the manifest sourceHash. */
  route: string
  /** Selector (Playwright syntax) outlined in brand colour over a dimmed page. */
  highlight?: string
  /** Selector whose box is captured instead of the whole page. */
  clip?: string
  /** Crop the clip box to at most this many CSS px tall (keeps phone images short). */
  clipMaxHeight?: number
  /** Selectors masked out (timestamps, relative dates). */
  mask?: string[]
}

export const GUIDE_WIDTHS = [375, 1440]

export function guideShotWidths(s: GuideShot): number[] {
  return s.widths ?? GUIDE_WIDTHS
}

const MAIN = '#main'

export const GUIDE_SHOTS: GuideShot[] = [
  // 1. start-board-admin
  {
    name: 'guide-dashboard-setup',
    path: '/',
    route: '/',
    auth: true,
    clip: 'section[aria-labelledby="setup-heading"]',
    highlight: 'section[aria-labelledby="setup-heading"] a:has-text("Invite the board")',
  },
  // 2. setup-properties-residents
  { name: 'guide-properties-list', path: '/properties', route: '/properties', auth: true, clip: MAIN, highlight: 'a:has-text("Add property")' },
  { name: 'guide-properties-new', path: '/properties/new', route: '/properties/new', auth: true, clip: 'form', highlight: 'button[type=submit]:has-text("Add property")' },
  // 3. members-invite-board
  {
    name: 'guide-members-invite',
    path: '/settings/members',
    route: '/settings/members',
    auth: true,
    clip: 'form:has(button:has-text("Send invitation"))',
    highlight: 'button:has-text("Send invitation")',
  },
  // 4. dues-generate-monthly
  { name: 'guide-dues-no-association', path: '/dues', route: '/dues', auth: true, org: 'bareHoaOrgId', clip: MAIN },
  { name: 'guide-dues-charges', path: '/dues', route: '/dues', auth: true, clip: MAIN, highlight: 'button:has-text("Generate") >> visible=true' },
  // 5. dues-record-payment
  {
    name: 'guide-dues-record-payment',
    path: '/dues',
    route: '/dues',
    auth: true,
    click: 'button:has-text("Mark paid") >> visible=true',
    clip: '[role=alertdialog]',
    highlight: '[role=alertdialog] button:has-text("Record payment")',
  },
  // 6. violations-report-and-letter
  { name: 'guide-violations-new', path: '/violations/new', route: '/violations/new', auth: true, clip: MAIN, highlight: 'button:has-text("Analyze with Covenant Brain")' },
  {
    name: 'guide-violations-approval-queue',
    path: '/violations/approval-queue',
    route: '/violations/approval-queue',
    auth: true,
    clip: MAIN,
    highlight: 'button:has-text("Approve letter") >> visible=true',
    mask: ['time'],
  },
  // 7. arc-review-application
  { name: 'guide-arc-list', path: '/arc', route: '/arc', auth: true, clip: MAIN, highlight: 'a:has-text("Replace rear fence (demo)") >> visible=true' },
  { name: 'guide-arc-detail', path: '/arc/:guideArcId', route: '/arc/[id]', auth: true, clip: MAIN, highlight: 'button:text-is("Approve")' },
  // 8. meetings-schedule-and-minutes
  { name: 'guide-meetings-list', path: '/meetings', route: '/meetings', auth: true, clip: MAIN, highlight: 'a:has-text("Schedule meeting") >> visible=true' },
  {
    name: 'guide-meetings-packet',
    path: '/meetings/:meetingId/packet',
    route: '/meetings/[id]/packet',
    auth: true,
    clip: MAIN,
    highlight: 'button:has-text("Print / Save as PDF")',
  },
  // 9. approvals-queue
  { name: 'guide-approvals', path: '/approvals', route: '/approvals', auth: true, clip: MAIN, highlight: 'button:has-text("Approve & post") >> visible=true', mask: ['time'] },
  {
    name: 'guide-approvals-bill-edit',
    path: '/approvals?type=bill',
    route: '/approvals',
    auth: true,
    click: 'button:has-text("Edit details") >> visible=true',
    clip: '[role=dialog]',
  },
  // 10. communications-send-announcement
  { name: 'guide-communications-list', path: '/communications', route: '/communications', auth: true, clip: MAIN, highlight: 'a:has-text("New message") >> visible=true' },
  {
    name: 'guide-communications-new',
    path: '/communications/new',
    route: '/communications/new',
    auth: true,
    clip: MAIN,
    highlight: 'fieldset:has(legend:has-text("Audience"))',
  },
  // 11. documents-governing-and-ask
  {
    name: 'guide-documents-governing',
    path: '/documents/governing',
    route: '/documents/governing',
    auth: true,
    clip: MAIN,
    highlight: 'button:has-text("Upload & index")',
  },
  { name: 'guide-ask-docs', path: '/ai/ask', route: '/ai/ask', auth: true, clip: MAIN, highlight: 'button:text-is("Ask")' },
  // 12. resident-portal-basics
  { name: 'guide-resident-home', path: '/resident', route: '/resident', auth: true, resident: true, clip: MAIN, clipMaxHeight: 560, highlight: 'a:has-text("Pay $") >> visible=true' },
  { name: 'guide-resident-pay', path: '/resident/dues/pay', route: '/resident/dues/pay', auth: true, resident: true, clip: MAIN, clipMaxHeight: 820 },
  {
    name: 'guide-resident-arc-new',
    path: '/resident/arc/new',
    route: '/resident/arc/new',
    auth: true,
    resident: true,
    clip: 'main form',
    highlight: 'button:has-text("Submit application")',
  },
]
