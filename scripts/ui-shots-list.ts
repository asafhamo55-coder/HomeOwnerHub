/**
 * scripts/ui-shots-list.ts — the route list `pnpm ui:shots` captures.
 *
 * Pure data, no imports, so other tooling can read it without loading
 * Playwright or Supabase: scripts/release-notes maps a route to the PNG CI
 * took of it. Each shot is written as
 *   .ui-shots/<name>--<width>-<theme>.png
 * for every width in `widths` (default WIDTHS) and theme in `themes`
 * (default THEMES).
 */

export type App = 'hoa' | 'pm' | 'eviction' | 'marketing'

export interface Shot {
  name: string
  /** Route. `:var` segments are filled from the seed's vars; the shot is
   *  skipped when a var is missing. */
  path: string
  app?: App
  /** Needs the seeded session. */
  auth?: boolean
  /** Render as a resident (admin role-override cookie). */
  resident?: boolean
  /** Seed var naming the HOA org to make active (switcher cookie). */
  org?: string
  /** Desktop sidebar collapsed to the icon rail. */
  rail?: boolean
  /** Board copilot panel open. */
  copilot?: boolean
  /** Viewport-sized screenshot instead of full page (shows what is pinned
   *  to the viewport — fixed/sticky bars — at the scroll position). */
  viewport?: boolean
  /** Scroll to the bottom before a viewport shot. */
  scrollBottom?: boolean
  widths?: number[]
  themes?: ('light' | 'dark')[]
  /** Render with print media (CSS `print:` styles), e.g. the resident statement. */
  print?: boolean
  /** Open the ⌘K palette and type this query; waits for record search to settle (BL-022). */
  palette?: string
  /** Click the first element matching this selector before the shot (opens a dialog, BL-059). */
  click?: string
  /** Selector that must appear after `click` (default: a dialog). */
  clickWaitFor?: string
}

export const WIDTHS = [375, 1440]
export const THEMES: ('light' | 'dark')[] = ['light', 'dark']
export const LIGHT: ('light' | 'dark')[] = ['light']

export const SHOTS: Shot[] = [
  { name: 'gallery', path: '/ui-gallery' },
  { name: 'gallery-rail', path: '/ui-gallery', rail: true, widths: [1440] },
  { name: 'dashboard-rail', path: '/', auth: true, rail: true, widths: [1440], themes: LIGHT },
  { name: 'gallery-dialog', path: '/ui-gallery?overlay=dialog', themes: LIGHT },
  // BL-056: public invitation pages — the "couldn't load" state (dev preview;
  // a real DB failure can't be provoked here) next to the "invalid link" one.
  { name: 'invitation-unavailable', path: '/ui-gallery/invitation-unavailable' },
  { name: 'rfp-bid-invalid', path: '/rfp-bid/no-such-token', themes: LIGHT },
  { name: 'vendor-onboard-invalid', path: '/vendor-onboard/no-such-token', themes: LIGHT },
  { name: 'gallery-sheet', path: '/ui-gallery?overlay=sheet', themes: LIGHT },
  { name: 'gallery-confirm', path: '/ui-gallery?overlay=confirm', themes: ['dark'] },
  { name: 'gallery-palette', path: '/ui-gallery?overlay=palette' },
  { name: 'gallery-menu', path: '/ui-gallery?overlay=menu', widths: [1440], themes: LIGHT },
  { name: 'gallery-toast', path: '/ui-gallery?overlay=toast', themes: LIGHT },
  { name: 'dashboard', path: '/', auth: true },
  // BL-071: the version line in the mobile nav drawer, and its "What's new" target.
  { name: 'dashboard-nav-drawer', path: '/', auth: true, viewport: true, click: 'button[aria-label="Open menu"]', clickWaitFor: 'button[aria-label="Close menu"]', widths: [375] },
  { name: 'whats-new', path: '/whats-new', auth: true },
  // /login itself always redirects under DEV_AUTOLOGIN; /forgot-password
  // wears the same AuthShell (and its footer version line).
  { name: 'login-shell', path: '/forgot-password' },
  { name: 'dashboard-copilot', path: '/', auth: true, copilot: true },
  // Top bar with the Copilot column open, across laptop widths: the bar's
  // available width is what drives its icon-only / labelled states.
  { name: 'topbar-copilot', path: '/', auth: true, copilot: true, viewport: true, widths: [1024, 1280, 1440], themes: LIGHT },
  { name: 'topbar', path: '/', auth: true, viewport: true, widths: [768, 1024, 1440], themes: LIGHT },
  // BL-022: ⌘K with record results ("Sample" hits the seeded long-address
  // property and the violations on it).
  { name: 'palette-records', path: '/', auth: true, viewport: true, palette: 'Sample' },
  // BL-060: documents and meetings as record types ("ui-shots" hits the
  // seeded documents, governing documents and meeting summaries).
  { name: 'palette-records-docs', path: '/', auth: true, viewport: true, palette: 'ui-shots' },
  { name: 'dashboard-viewport', path: '/', auth: true, viewport: true, scrollBottom: true, widths: [1440], themes: LIGHT },
  { name: 'approvals', path: '/approvals', auth: true },
  // BL-021: the scanned-bill cards, and the upload screen.
  { name: 'approvals-bills', path: '/approvals?type=bill', auth: true },
  // BL-059: the Edit details dialog on the first scanned bill.
  { name: 'approvals-bill-edit', path: '/approvals?type=bill', auth: true, viewport: true, click: 'button:has-text("Edit details") >> visible=true', themes: LIGHT },
  { name: 'accounting-invoices-new', path: '/accounting/invoices/new', auth: true },
  { name: 'violations', path: '/violations', auth: true },
  // BL-019: the state-law rule panel where the board creates and reviews
  // violation letter drafts.
  { name: 'violations-new', path: '/violations/new', auth: true },
  { name: 'violations-approval-queue', path: '/violations/approval-queue', auth: true },
  { name: 'dues', path: '/dues', auth: true },
  // BL-046: an HOA with no association — the inline "Set up your
  // association" form on /dues and on every accounting page.
  { name: 'dues-no-association', path: '/dues', auth: true, org: 'bareHoaOrgId' },
  { name: 'accounting-no-association', path: '/accounting', auth: true, org: 'bareHoaOrgId' },
  // BL-064: the shared no-association state on leases and two settings pages.
  { name: 'leases-no-association', path: '/leases', auth: true, org: 'bareHoaOrgId' },
  { name: 'settings-payments-no-association', path: '/settings/payments', auth: true, org: 'bareHoaOrgId' },
  { name: 'settings-reminders-no-association', path: '/settings/reminders', auth: true, org: 'bareHoaOrgId' },
  // BL-064: an association whose books were never opened — "Open the books"
  // for an admin, "See your HOA's admins" for a board member.
  { name: 'books-not-open-periods', path: '/accounting/periods', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-trial-balance', path: '/accounting/trial-balance', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-coa', path: '/accounting/coa', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-invoices-new', path: '/accounting/invoices/new', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-cash-flow', path: '/accounting/reports/cash-flow', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-income-statement', path: '/accounting/reports/income-statement', auth: true, org: 'noBooksAdminOrgId' },
  { name: 'books-not-open-board-periods', path: '/accounting/periods', auth: true, org: 'noBooksBoardOrgId' },
  { name: 'inbox', path: '/inbox', auth: true },
  // BL-134: the Snoozed chip's view, with one seeded snoozed thread.
  { name: 'inbox-snoozed', path: '/inbox?filter=snoozed', auth: true },
  // An inbox thread filed under 128 Demo Court: the property/vendor context
  // panel (its own column at xl, below the conversation on a phone), and
  // the "Create from email" menu open (BL-101 A4). scripts/ui-shots-seed/screens.ts.
  { name: 'inbox-thread', path: '/inbox/:inboxThreadId', auth: true },
  {
    name: 'inbox-thread-create-menu',
    path: '/inbox/:inboxThreadId',
    auth: true,
    viewport: true,
    click: 'button:has-text("Create from email") >> visible=true',
    widths: [1440],
    themes: LIGHT,
  },
  { name: 'properties', path: '/properties', auth: true },
  // P1 quick wins. Query strings survive the dev auto-login now (the
  // middleware keeps them in `redirect`), so filtered and tabbed views shoot.
  { name: 'properties-attention', path: '/properties?filter=attention', auth: true, themes: LIGHT },
  { name: 'properties-search', path: '/properties?q=Demo%20Court', auth: true },
  { name: 'properties-search-empty', path: '/properties?filter=attention&q=Mock', auth: true, themes: LIGHT },
  { name: 'properties-new', path: '/properties/new', auth: true, themes: LIGHT },
  { name: 'properties-edit', path: '/properties/:propertyId/edit', auth: true, themes: LIGHT },
  ...(['overview', 'residents', 'mail', 'violations', 'dues', 'collections', 'history'] as const).map(
    (tab): Shot => ({
      name: `properties-detail-${tab}`,
      path: `/properties/:propertyId?tab=${tab}`,
      auth: true,
      themes: tab === 'overview' ? THEMES : LIGHT,
    }),
  ),
  // The sticky header and tab strip at the scroll position a phone user sees.
  { name: 'properties-detail-mobile-scrolled', path: '/properties/:propertyId?tab=violations', auth: true, viewport: true, scrollBottom: true, widths: [375], themes: LIGHT },
  { name: 'properties-out-violations', path: '/violations?property=:propertyId', auth: true, themes: LIGHT },
  { name: 'properties-out-violations-new', path: '/violations/new?property=:propertyId', auth: true, themes: LIGHT },
  { name: 'properties-out-dues', path: '/dues?property=:propertyId', auth: true, themes: LIGHT },
  { name: 'properties-out-leases', path: '/leases?property=:propertyId', auth: true, themes: LIGHT },
  { name: 'meetings', path: '/meetings', auth: true },
  { name: 'meeting-detail', path: '/meetings/:meetingId', auth: true, themes: LIGHT },
  // BL-016 board packet: screen at both widths and themes, plus paper
  // (print media at US Letter width) in both themes — dark must print light.
  { name: 'meeting-packet', path: '/meetings/:meetingId/packet', auth: true },
  { name: 'meeting-packet-print', path: '/meetings/:meetingId/packet', auth: true, print: true, widths: [816] },
  // 2026-10-20 screens nobody had a shot of: the motion log, the quorum
  // kit, board tasks, the roster, year-end and opening balances, and the
  // activity log and board handover settings.
  { name: 'meetings-motions', path: '/meetings/motions', auth: true },
  // The quorum kit on the seeded annual meeting (held today): counter,
  // check-in list and chase list, plus its printable proxy forms and
  // sign-in sheet. scripts/ui-shots-seed/board-tools.ts.
  { name: 'meeting-quorum', path: '/meetings/:annualMeetingId/quorum', auth: true },
  { name: 'meeting-quorum-proxies', path: '/meetings/:annualMeetingId/quorum/proxies', auth: true, themes: LIGHT },
  { name: 'meeting-quorum-sign-in', path: '/meetings/:annualMeetingId/quorum/sign-in', auth: true, themes: LIGHT },
  { name: 'tasks', path: '/tasks', auth: true },
  { name: 'properties-roster', path: '/properties/roster', auth: true },
  { name: 'accounting-year-end', path: '/accounting/reports/year-end', auth: true },
  { name: 'accounting-opening-balances', path: '/accounting/opening-balances', auth: true },
  { name: 'settings-activity', path: '/settings/activity', auth: true },
  { name: 'settings-handover', path: '/settings/handover', auth: true },
  { name: 'tickets', path: '/tickets', auth: true },
  // BL-123: owner records requests, one due soon and one overdue.
  { name: 'tickets-records', path: '/tickets/records', auth: true },
  // BL-132: three policies, one expiring within 30 days, one fidelity bond.
  { name: 'insurance', path: '/insurance', auth: true },
  // BL-145: every state-law obligation (the Georgia demo org: registration
  // countdown, annual meeting, records), read-only until M5_APPLIED.
  { name: 'compliance', path: '/compliance', auth: true },
  // BL-133: a violation with a scheduled fine hearing (the Fine hearing card).
  { name: 'violation-hearing', path: '/violations/:hearingViolationId', auth: true },
  { name: 'communications', path: '/communications', auth: true },
  // BL-102 A11: the Messages area — the one "New message" button opened on
  // its two choices, the Drafts tab, and the Inbox tab's read-only
  // "Replies to announcements".
  {
    name: 'messages-new-menu',
    path: '/communications',
    auth: true,
    click: 'button:has-text("New message") >> visible=true',
    clickWaitFor: '[role="menu"]',
    themes: LIGHT,
  },
  { name: 'messages-drafts', path: '/communications?status=draft', auth: true, themes: LIGHT },
  { name: 'messages-announcement-replies', path: '/inbox?view=replies', auth: true },
  // BL-102: the composer's first step with the one-box "What do you want to
  // tell residents?" composer, the results page of a sent message, and its
  // follow-up opened on the Review step's phone preview (Continue once from
  // the pre-filled Message step; waits for the preview, or its error).
  { name: 'communications-new', path: '/communications/new', auth: true },
  { name: 'communications-results', path: '/communications/:commsResultsId', auth: true },
  {
    name: 'communications-phone-preview',
    path: '/communications/new?followUp=:commsResultsId&via=email',
    auth: true,
    click: 'button[type="submit"]:has-text("Continue") >> visible=true',
    clickWaitFor: 'section[aria-label="Phone preview"] :is(iframe, [role="alert"])',
    themes: LIGHT,
  },
  { name: 'accounting', path: '/accounting', auth: true },
  // Release-note example route (docs/releases/README.md "shots:").
  { name: 'accounting-payment-plans', path: '/accounting/payment-plans', auth: true, themes: LIGHT },
  // BL-091: the owner budget notice from the seeded adopted 2026 budget.
  { name: 'accounting-budget-notice', path: '/accounting/budget/:budgetNoticeId/notice', auth: true },
  // BL-089 / BL-087: the collections letter (open case on 128 Demo Court)
  // and the estoppel certificate prepared for the same home.
  { name: 'properties-collections-letter', path: '/properties/:propertyId/collections-letter', auth: true },
  { name: 'properties-estoppel', path: '/properties/:propertyId/estoppel', auth: true },
  { name: 'vendors', path: '/vendors', auth: true },
  { name: 'settings-members', path: '/settings/members', auth: true },
  { name: 'settings-payments', path: '/settings/payments', auth: true },
  { name: 'settings-data', path: '/settings/data', auth: true },
  { name: 'settings-reminders', path: '/settings/reminders', auth: true },
  // BL-103: Settings → Billing on an org whose subscription is past due, so
  // the payment banner shows. Its own org: the main demo org stays clean.
  // The only /settings/billing shot, so release notes for that route get it.
  { name: 'settings-billing-past-due', path: '/settings/billing', auth: true, org: 'pastDueHoaOrgId' },
  { name: 'legal-compliance', path: '/legal/compliance', auth: true },
  // next.md §2: Georgia is the launch state. A Georgia board's view, in its
  // own org (scripts/ui-shots-seed/georgia.ts): the SB 406 registration
  // deadline card on the dashboard, the § 44-3-232(d) statement of amounts
  // due on the estoppel route, an open violation, and /legal over the
  // verbatim O.C.G.A. Art. 6 text the seed loads from the GA snapshot.
  { name: 'ga-dashboard', path: '/', auth: true, org: 'gaHoaOrgId', themes: LIGHT },
  { name: 'ga-estoppel', path: '/properties/:gaPropertyId/estoppel', auth: true, org: 'gaHoaOrgId', themes: LIGHT },
  { name: 'ga-violation', path: '/violations/:gaViolationId', auth: true, org: 'gaHoaOrgId', themes: LIGHT },
  { name: 'ga-legal', path: '/legal', auth: true, org: 'gaHoaOrgId', themes: LIGHT },
  // BL-070 user guide: help centre, search (hit + no hit), topic, article,
  // and the "?" drawer on a covered page and on one with no article.
  { name: 'help', path: '/help', auth: true },
  { name: 'help-search', path: '/help?q=owner+paid+by+check', auth: true, themes: LIGHT },
  { name: 'help-search-empty', path: '/help?q=clubhouse+booking', auth: true, themes: LIGHT },
  { name: 'help-topic', path: '/help/topics/dues', auth: true, themes: LIGHT },
  { name: 'help-article', path: '/help/dues-record-payment', auth: true },
  { name: 'help-drawer', path: '/violations', auth: true, viewport: true, click: 'button[aria-label="Help for this page"] >> visible=true' },
  { name: 'help-drawer-fallback', path: '/accounting', auth: true, viewport: true, themes: LIGHT, click: 'button[aria-label="Help for this page"] >> visible=true' },

  // Platform admin
  { name: 'admin', path: '/admin', auth: true },
  { name: 'admin-tenants', path: '/admin/tenants', auth: true },
  { name: 'admin-tenant', path: '/admin/tenants/:hoaOrgId', auth: true },
  { name: 'admin-tenant-edit', path: '/admin/tenants/:hoaOrgId/edit', auth: true, themes: LIGHT },
  { name: 'admin-tenant-preview', path: '/admin/tenants/:hoaOrgId/preview', auth: true, themes: LIGHT },
  { name: 'admin-tenant-new', path: '/admin/tenants/new', auth: true, themes: LIGHT },
  { name: 'admin-admins', path: '/admin/admins', auth: true },
  { name: 'admin-analytics', path: '/admin/analytics', auth: true },
  { name: 'admin-audit', path: '/admin/audit', auth: true },
  { name: 'admin-import', path: '/admin/import-units', auth: true, themes: LIGHT },

  // Resident portal
  { name: 'resident', path: '/resident', auth: true, resident: true },
  { name: 'resident-viewport', path: '/resident', auth: true, resident: true, viewport: true, scrollBottom: true, widths: [375], themes: LIGHT },
  { name: 'resident-dues', path: '/resident/dues', auth: true, resident: true },
  { name: 'resident-pay', path: '/resident/dues/pay', auth: true, resident: true },
  { name: 'resident-ledger', path: '/resident/dues/ledger', auth: true, resident: true },
  { name: 'resident-statement', path: '/resident/dues/statement', auth: true, resident: true },
  { name: 'resident-statement-print', path: '/resident/dues/statement', auth: true, resident: true, print: true, widths: [816], themes: LIGHT },
  { name: 'resident-requests', path: '/resident/requests', auth: true, resident: true },
  { name: 'resident-tickets', path: '/resident/tickets', auth: true, resident: true },
  { name: 'resident-ticket', path: '/resident/tickets/:residentTicketId', auth: true, resident: true },
  { name: 'resident-ticket-new', path: '/resident/tickets/new', auth: true, resident: true },
  { name: 'resident-arc', path: '/resident/arc', auth: true, resident: true },
  { name: 'resident-arc-detail', path: '/resident/arc/:residentArcId', auth: true, resident: true },
  { name: 'resident-arc-new', path: '/resident/arc/new', auth: true, resident: true },
  { name: 'resident-violations', path: '/resident/violations', auth: true, resident: true },
  { name: 'resident-violation', path: '/resident/violations/:residentReportId', auth: true, resident: true },
  { name: 'resident-report', path: '/resident/report-violation', auth: true, resident: true },
  // BL-123: the owner's records-request form.
  { name: 'resident-records-new', path: '/resident/records/new', auth: true, resident: true },
  { name: 'resident-ask', path: '/resident/ask', auth: true, resident: true },
  { name: 'resident-documents', path: '/resident/documents', auth: true, resident: true },
  { name: 'resident-account', path: '/resident/account', auth: true, resident: true },
  { name: 'resident-announcements', path: '/resident/announcements', auth: true, resident: true },
  { name: 'resident-help', path: '/resident/help', auth: true, resident: true },
  { name: 'resident-help-article', path: '/resident/help/resident-portal-basics', auth: true, resident: true },
  {
    name: 'resident-help-drawer',
    path: '/resident/dues',
    auth: true,
    resident: true,
    viewport: true,
    click: 'button[aria-label="Help for this page"] >> visible=true',
  },

  // PM Hub
  { name: 'pm-home', app: 'pm', path: '/', auth: true },
  { name: 'pm-rent', app: 'pm', path: '/rent', auth: true },
  { name: 'pm-setup', app: 'pm', path: '/setup', auth: true },
  { name: 'pm-settings', app: 'pm', path: '/settings', auth: true },
  { name: 'pm-billing', app: 'pm', path: '/settings/billing', auth: true },
  { name: 'pm-404', app: 'pm', path: '/no-such-page', auth: true, themes: LIGHT },
  { name: 'pm-login', app: 'pm', path: '/login' },
  { name: 'pm-signup', app: 'pm', path: '/signup', themes: LIGHT },
  { name: 'pm-verify', app: 'pm', path: '/verify', themes: LIGHT },

  // Eviction Hub
  { name: 'eviction-home', app: 'eviction', path: '/', auth: true },
  { name: 'eviction-case', app: 'eviction', path: '/cases/:evictionCaseId', auth: true },
  { name: 'eviction-case-new', app: 'eviction', path: '/cases/new', auth: true },
  { name: 'eviction-settings', app: 'eviction', path: '/settings', auth: true },
  { name: 'eviction-billing', app: 'eviction', path: '/settings/billing', auth: true },
  { name: 'eviction-404', app: 'eviction', path: '/no-such-page', auth: true, themes: LIGHT },
  { name: 'eviction-login', app: 'eviction', path: '/login' },
  { name: 'eviction-signup', app: 'eviction', path: '/signup', themes: LIGHT },
  { name: 'eviction-verify', app: 'eviction', path: '/verify', themes: LIGHT },

  // Marketing (light-only brochure)
  ...[
    '/',
    '/about',
    '/blog',
    '/case-studies',
    '/case-studies/madison-park',
    '/compare',
    '/demo',
    '/docs',
    '/dpa',
    '/eviction',
    '/hoa',
    '/honesty-bars',
    '/landlords',
    '/pricing',
    '/privacy',
    '/roadmap',
    '/security',
    '/status',
    '/terms',
  ].map(
    (path): Shot => ({
      name: `mkt-${path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')}`,
      app: 'marketing',
      path,
      themes: LIGHT,
    }),
  ),
]
