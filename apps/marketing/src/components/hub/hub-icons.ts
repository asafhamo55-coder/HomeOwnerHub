// Icon registry — referenced by string key in props so Server Components
// don't need to pass component refs across the RSC boundary.

import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Bot,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileSearch,
  FileText,
  Globe,
  Hammer,
  Lock,
  MessageSquare,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const HUB_ICONS = {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Bot,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileSearch,
  FileText,
  Globe,
  Hammer,
  Lock,
  MessageSquare,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} satisfies Record<string, LucideIcon>

export type HubIconKey = keyof typeof HUB_ICONS
