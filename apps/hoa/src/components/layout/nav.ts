import {
  AlertTriangle,
  AtSign,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CalendarHeart,
  ClipboardCheck,
  CreditCard,
  DatabaseBackup,
  FileText,
  Home,
  KeyRound,
  Mail,
  Megaphone,
  MessageSquare,
  Scale,
  Send,
  Settings,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

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
}

export interface HoaNavGroup {
  label?: string
  items: HoaNavLink[]
}

export const HOA_NAV: HoaNavGroup[] = [
  {
    items: [
      { href: '/', icon: Home, label: 'Dashboard', keywords: ['home', 'overview'] },
      { href: '/ai/ask', icon: Sparkles, label: 'Ask the Docs', keywords: ['ai', 'question', 'ccr', 'bylaws'] },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/inbox', icon: Mail, label: 'Inbox', keywords: ['email', 'mail'] },
      { href: '/properties', icon: Building2, label: 'Properties', keywords: ['units', 'homes', 'residents', 'owners'] },
      { href: '/leases', icon: KeyRound, label: 'Leases', keywords: ['rentals', 'tenants'] },
      { href: '/violations', icon: AlertTriangle, label: 'Violations', keywords: ['notices', 'compliance'] },
      { href: '/arc', icon: ClipboardCheck, label: 'ARC review', keywords: ['architectural', 'applications'] },
      { href: '/meetings', icon: CalendarDays, label: 'Meetings', keywords: ['minutes', 'agenda'] },
      { href: '/events', icon: CalendarHeart, label: 'Events' },
      { href: '/communications', icon: Megaphone, label: 'Communications', keywords: ['announcements', 'broadcast'] },
      { href: '/tickets', icon: MessageSquare, label: 'Tickets', keywords: ['requests', 'maintenance'] },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/dues', icon: Wallet, label: 'Dues', keywords: ['assessments', 'overdue', 'payments'] },
      { href: '/accounting', icon: Calculator, label: 'Accounting', keywords: ['ledger', 'invoices', 'bank', 'budget'] },
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
      { href: '/legal', icon: Scale, label: 'State Law', keywords: ['statutes', 'legal'] },
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
  { href: '/settings/billing', icon: CreditCard, label: 'Billing', keywords: ['subscription', 'plan'] },
  { href: '/settings/data', icon: DatabaseBackup, label: 'Your data', keywords: ['export', 'download', 'backup', 'csv'] },
]

export const BOARD_ACCOUNT: HoaNavLink[] = [
  { href: '/settings/members', icon: Users, label: 'Members', keywords: ['board', 'invite'] },
  { href: '/settings/payments', icon: Send, label: 'Resident payments', keywords: ['zelle', 'pay', 'memo'] },
  { href: '/settings/billing', icon: CreditCard, label: 'Billing', keywords: ['subscription', 'plan'] },
  { href: '/settings/data', icon: DatabaseBackup, label: 'Your data', keywords: ['export', 'download', 'backup', 'csv'] },
]

/** Quick-create actions offered in the palette. */
export const HOA_CREATE: HoaNavLink[] = [
  { href: '/violations/new', icon: AlertTriangle, label: 'New violation' },
  { href: '/communications/new', icon: Megaphone, label: 'New message to residents' },
  { href: '/meetings/schedule', icon: CalendarDays, label: 'Schedule a meeting' },
  { href: '/dues/new', icon: Wallet, label: 'Add a due' },
  { href: '/properties/new', icon: Building2, label: 'Add a property' },
  { href: '/documents/upload', icon: FileText, label: 'Upload a document' },
]

export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
