/** Fixed locations used by the guide tooling. */
import { resolve } from 'node:path'

export const REPO_ROOT = resolve(__dirname, '..', '..')
export const HOA_DIR = resolve(REPO_ROOT, 'apps', 'hoa')
export const CONTENT_DIR = resolve(HOA_DIR, 'content', 'guide')
export const META_FILE = resolve(CONTENT_DIR, '_meta.yaml')
export const GENERATED_FILE = resolve(HOA_DIR, 'src', 'generated', 'guide.ts')
export const APP_DIR = resolve(HOA_DIR, 'src', 'app')
export const SRC_DIR = resolve(HOA_DIR, 'src')
export const SHOTS_DIR = resolve(HOA_DIR, 'public', 'guide', 'shots')
export const MANIFEST_FILE = resolve(SHOTS_DIR, 'manifest.json')
/** Release notes; their `whats_new:` blocks feed WHATS_NEW (spec §6.5). */
export const RELEASES_DIR = resolve(REPO_ROOT, 'docs', 'releases')

/**
 * Core routes that must have at least one article (spec §5.3). A ratchet:
 * entries are only ever added. Phase 2 added every core board route
 * (accounting, vendors, leases, events, inbox, settings, state law, tickets)
 * and the deeper resident pages.
 */
export const GUIDE_EXPECTED_ROUTES = [
  '/',
  '/properties',
  '/settings/members',
  '/dues',
  '/violations',
  '/violations/approval-queue',
  '/arc',
  '/meetings',
  '/approvals',
  '/communications',
  '/documents/governing',
  '/ai/ask',
  '/resident',
  '/resident/dues',
  '/resident/arc',
  '/resident/meetings',
  // Phase 2
  '/accounting',
  '/accounting/reports',
  '/accounting/reports/income-statement',
  '/accounting/reports/budget-vs-actual',
  '/accounting/reports/balance-sheet',
  '/accounting/reports/monthly-report',
  '/accounting/bank',
  '/accounting/invoices',
  '/accounting/payment-plans',
  '/accounting/recurring',
  '/accounting/budget',
  '/vendors',
  '/rfps',
  '/leases',
  '/events',
  '/inbox',
  '/communications/new',
  '/tickets',
  '/legal',
  '/legal/compliance',
  '/settings/mailbox',
  '/settings/notifications',
  '/settings/reminders',
  '/settings/payments',
  '/settings/data',
  '/settings/billing',
  '/resident/dues/statement',
  '/resident/arc/new',
  '/resident/requests',
  '/resident/tickets',
]
