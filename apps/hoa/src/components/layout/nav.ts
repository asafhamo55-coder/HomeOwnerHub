import {
  AlertTriangle,
  AtSign,
  BellRing,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  CalendarDays,
  CalendarHeart,
  CircleHelp,
  ClipboardCheck,
  CreditCard,
  DatabaseBackup,
  FileCheck2,
  FileText,
  History,
  Home,
  KeyRound,
  ListChecks,
  ListTodo,
  Mail,
  Megaphone,
  MessageSquare,
  PenSquare,
  Scale,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { MESSAGES_PREFIXES } from '@/lib/messages/tabs'

/**
 * The board navigation, in one place: the sidebar renders it and the ⌘K
 * command palette searches it, so the two can never disagree.
 *
 * Sidebar IA: 5 labeled sections + Account. Items that used to live as
 * flat siblings (Vendor Invitations, Vendor Queue, RFPs, AI Approval
 * Queue, Governing Docs) live as page-level tabs inside their parent and
 * are reachable via the parent's link here.
 */
export interface HoaNavLink {
  href: string
  icon: LucideIcon
  label: string
  /** Extra palette search terms. */
  keywords?: string[]
  /**
   * Extra path prefixes this item lights up for, beyond `href`. Messages
   * (BL-102 A11) covers both /inbox/** and /communications/**.
   */
  match?: readonly string[]
}

export interface HoaNavGroup {
  label?: string
  items: HoaNavLink[]
}

export const HOA_NAV: HoaNavGroup[] = [
  {
    items: [
      { href: '/', icon: Home, label: 'Dashboard', keywords: ['home', 'overview'] },
      {
        href: '/approvals',
        icon: ListChecks,
        label: 'Approvals',
        keywords: ['approve', 'pending', 'queue', 'decisions', 'ai', 'proposals'],
      },
      { href: '/ai/ask', icon: Sparkles, label: 'Ask the Docs', keywords: ['ai', 'question', 'ccr', 'bylaws'] },
    ],
  },
  {
    label: 'Community',
    items: [
      // BL-102 A11: one "Messages" item over the Inbox and Communications
      // pages (tabs live on the pages: components/messages/MessagesTabs).
      // The old names stay as keywords so ⌘K muscle memory still lands.
      {
        href: '/inbox',
        icon: Mail,
        label: 'Messages',
        match: MESSAGES_PREFIXES,
        keywords: ['inbox', 'email', 'mail', 'communications', 'announcements', 'broadcast', 'sent', 'drafts', 'replies'],
      },
      { href: '/properties', icon: Building2, label: 'Properties', keywords: ['units', 'homes', 'residents', 'owners'] },
      { href: '/leases', icon: KeyRound, label: 'Leases', keywords: ['rentals', 'tenants'] },
      { href: '/violations', icon: AlertTriangle, label: 'Violations', keywords: ['notices', 'compliance'] },
      { href: '/arc', icon: ClipboardCheck, label: 'ARC review', keywords: ['architectural', 'applications'] },
      { href: '/meetings', icon: CalendarDays, label: 'Meetings', keywords: ['minutes', 'agenda'] },
      // BL-119: meeting action items and ticket follow-ups, board-wide.
      {
        href: '/tasks',
        icon: ListTodo,
        label: 'Tasks',
        keywords: ['action items', 'to do', 'todo', 'follow ups', 'assigned', 'my tasks', 'due'],
      },
      { href: '/events', icon: CalendarHeart, label: 'Events' },
      { href: '/tickets', icon: MessageSquare, label: 'Tickets', keywords: ['requests', 'maintenance'] },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/dues', icon: Wallet, label: 'Dues', keywords: ['assessments', 'overdue', 'payments'] },
      { href: '/accounting', icon: Calculator, label: 'Accounting', keywords: ['ledger', 'invoices', 'bank', 'budget'] },
      // BL-132: only once migration 0068 is applied (M4_APPLIED), so the
      // sidebar doesn't change before then.
      ...(M4_APPLIED
        ? [
            {
              href: '/insurance',
              icon: ShieldCheck,
              label: 'Insurance',
              keywords: ['policy', 'policies', 'fidelity bond', 'crime', 'd&o', 'renewal', 'coverage', 'master policy'],
            },
          ]
        : []),
    ],
  },
  {
    label: 'Vendors',
    items: [{ href: '/vendors', icon: Briefcase, label: 'Vendors', keywords: ['contractors', 'rfp', 'bids'] }],
  },
  {
    label: 'Knowledge',
    items: [
      { href: '/documents', icon: FileText, label: 'Documents', keywords: ['files', 'governing'] },
      { href: '/legal', icon: Scale, label: 'State Law', keywords: ['statutes', 'legal', 'compliance', '720.303', 'official records'] },
      // BL-145: every statutory obligation, its status and the evidence.
      {
        href: '/compliance',
        icon: FileCheck2,
        label: 'Compliance',
        keywords: ['obligations', 'deadlines', 'secretary of state', 'registration', 'sb 406', 'annual meeting', 'management certificate', 'evidence', 'overdue'],
      },
    ],
  },
]

// Mailbox is admin-only and deliberately absent from BOARD_ACCOUNT:
// /settings/mailbox gates on requireAdmin, and so do updateScope,
// disconnectMailbox, and /api/oauth/google/start. A board member sees the
// Inbox itself (in Community above) but cannot connect, rescope, or
// disconnect the mailbox, so linking them here would only dead-end in a
// silent redirect to '/'.
export const ADMIN_ACCOUNT: HoaNavLink[] = [
  { href: '/settings', icon: Settings, label: 'Settings' },
  { href: '/settings/mailbox', icon: AtSign, label: 'HOA mailbox' },
  { href: '/settings/members', icon: Users, label: 'Members', keywords: ['board', 'invite'] },
  { href: '/settings/payments', icon: Send, label: 'Resident payments', keywords: ['zelle', 'pay', 'memo'] },
  { href: '/settings/reminders', icon: BellRing, label: 'Dues reminders', keywords: ['reminder', 'late', 'dues', 'chaser'] },
  { href: '/settings/vendors', icon: ShieldCheck, label: 'Vendor settings', keywords: ['insurance', 'coi', 'minimum', 'liability', 'workers comp'] },
  { href: '/settings/billing', icon: CreditCard, label: 'Billing', keywords: ['subscription', 'plan'] },
  { href: '/settings/data', icon: DatabaseBackup, label: 'Your data', keywords: ['export', 'download', 'backup', 'csv'] },
  { href: '/settings/activity', icon: History, label: 'Activity log', keywords: ['audit', 'audit log', 'history', 'who did', 'activity'] },
  { href: '/settings/handover', icon: ListChecks, label: 'Board handover', keywords: ['turnover', 'handover', 'leaving', 'new board', 'transfer', 'successor'] },
  { href: '/help', icon: CircleHelp, label: 'Help', keywords: ['guide', 'how do i', 'how to', 'support', 'tutorial'] },
]

export const BOARD_ACCOUNT: HoaNavLink[] = [
  { href: '/settings/members', icon: Users, label: 'Members', keywords: ['board', 'invite'] },
  { href: '/settings/payments', icon: Send, label: 'Resident payments', keywords: ['zelle', 'pay', 'memo'] },
  { href: '/settings/reminders', icon: BellRing, label: 'Dues reminders', keywords: ['reminder', 'late', 'dues', 'chaser'] },
  { href: '/settings/vendors', icon: ShieldCheck, label: 'Vendor settings', keywords: ['insurance', 'coi', 'minimum', 'liability', 'workers comp'] },
  { href: '/settings/billing', icon: CreditCard, label: 'Billing', keywords: ['subscription', 'plan'] },
  { href: '/settings/data', icon: DatabaseBackup, label: 'Your data', keywords: ['export', 'download', 'backup', 'csv'] },
  { href: '/settings/activity', icon: History, label: 'Activity log', keywords: ['audit', 'audit log', 'history', 'who did', 'activity'] },
  { href: '/settings/handover', icon: ListChecks, label: 'Board handover', keywords: ['turnover', 'handover', 'leaving', 'new board', 'transfer', 'successor'] },
  { href: '/help', icon: CircleHelp, label: 'Help', keywords: ['guide', 'how do i', 'how to', 'support', 'tutorial'] },
]

/** Quick-create actions offered in the palette. */
export const HOA_CREATE: HoaNavLink[] = [
  { href: '/violations/new', icon: AlertTriangle, label: 'New violation' },
  { href: '/inspect', icon: Camera, label: 'Inspect homes (drive-by photos)', keywords: ['inspection', 'walk', 'drive', 'camera', 'mobile'] },
  // The two halves of the Messages "New message" button, same wording.
  { href: '/inbox/compose', icon: PenSquare, label: 'Email one resident', keywords: ['new email', 'compose', 'reply'] },
  { href: '/communications/new', icon: Megaphone, label: 'New message to residents', keywords: ['announcement', 'broadcast', 'many homes'] },
  { href: '/meetings/schedule', icon: CalendarDays, label: 'Schedule a meeting' },
  { href: '/dues/new', icon: Wallet, label: 'Add a due' },
  { href: '/properties/new', icon: Building2, label: 'Add a property' },
  { href: '/documents/upload', icon: FileText, label: 'Upload a document' },
]

export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * How specifically `link` matches `pathname`: the length of the longest of
 * its `href` and `match` prefixes that is active, or 0 for no match. The
 * sidebar lights the single most specific item.
 */
export function navMatchLength(pathname: string, link: Pick<HoaNavLink, 'href' | 'match'>): number {
  let best = 0
  for (const prefix of [link.href, ...(link.match ?? [])]) {
    if (isActive(pathname, prefix)) best = Math.max(best, prefix.length)
  }
  return best
}

/** The single most specific nav href that matches — so /settings/members
 *  lights "Members", not also "Settings", and /communications/new lights
 *  "Messages" through its `match` prefixes (BL-102 A11). */
export function activeNavHref(pathname: string, links: readonly HoaNavLink[]): string | null {
  let best: string | null = null
  let bestLen = 0
  for (const l of links) {
    const len = navMatchLength(pathname, l)
    if (len > bestLen) {
      best = l.href
      bestLen = len
    }
  }
  return best
}
