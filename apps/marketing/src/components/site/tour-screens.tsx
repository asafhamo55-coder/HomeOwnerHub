import * as React from 'react'
import type { ReactNode } from 'react'
import {
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  Home,
  Megaphone,
  MessageCircleQuestion,
  Receipt,
  ShieldAlert,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { APP_HOST } from '../../lib/app-origin'

// Large HTML/CSS stand-ins for the real app screens, one per tour tab. Screen
// names match the HOA app's sidebar (Approvals, Dues, Violations,
// Communications, Ask). All data is sample data: "Unit 14", "Maple Court
// HOA". No real people, no invented customers or figures.

type Nav = 'Dashboard' | 'Approvals' | 'Dues' | 'Violations' | 'Communications' | 'Ask'

const NAV: Array<{ label: Nav; icon: typeof Home }> = [
  { label: 'Dashboard', icon: Home },
  { label: 'Approvals', icon: ClipboardCheck },
  { label: 'Dues', icon: Wallet },
  { label: 'Violations', icon: ShieldAlert },
  { label: 'Communications', icon: Megaphone },
  { label: 'Ask', icon: MessageCircleQuestion },
]

type Tone = 'ok' | 'warn' | 'draft' | 'late'
const TONE: Record<Tone, string> = {
  ok: 'bg-success-subtle text-success',
  warn: 'bg-warning-subtle text-warning',
  draft: 'bg-primary-subtle text-primary',
  late: 'bg-danger-subtle text-danger',
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-[11px]', TONE[tone])}>
      {children}
    </span>
  )
}

function Frame({
  path,
  active,
  title,
  badge,
  children,
}: {
  path: string
  active: Nav
  title: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="app-window" aria-hidden>
      <div className="flex items-center gap-1.5 border-b border-border bg-subtle/70 px-3 py-2.5 sm:px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
        <span className="ml-2 min-w-0 truncate rounded-md bg-surface px-2.5 py-1 text-[10px] text-muted ring-1 ring-border sm:ml-3 sm:text-[11px]">
          {APP_HOST}
          {path}
        </span>
      </div>
      <div className="flex min-h-[340px] sm:min-h-[400px]">
        <div className="flex w-10 shrink-0 flex-col gap-1 border-r border-border bg-subtle/50 p-1.5 sm:w-40 sm:p-2.5">
          <p className="mb-1 hidden px-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:block">
            Maple Court HOA
          </p>
          {NAV.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium',
                label === active ? 'bg-primary-subtle text-primary' : 'text-foreground-secondary',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold text-muted sm:text-[11px]">Sample community</p>
              <p className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{title}</p>
            </div>
            {badge}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function Item({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: typeof Home
  title: string
  meta: string
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2.5 sm:gap-3 sm:px-3.5">
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-foreground-secondary min-[420px]:inline-flex">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-foreground sm:text-[13px]">{title}</span>
        <span className="block text-[11px] text-muted sm:text-xs">{meta}</span>
      </span>
      {children}
    </li>
  )
}

function Buttons({ primary = 'Approve' }: { primary?: string }) {
  return (
    <div className="mt-3 flex gap-2">
      <span className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-fg">
        {primary}
      </span>
      <span className="inline-flex items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">
        Edit
      </span>
    </div>
  )
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {widths.map((w) => (
        <div key={w} className={cn('h-1.5 rounded-full bg-border-strong/50', w)} />
      ))}
    </div>
  )
}

const AI_BADGE = (
  <span className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-1 text-[10px] font-semibold text-primary sm:text-[11px]">
    <Sparkles className="h-3 w-3" aria-hidden />
    AI drafted
  </span>
)

export function ApprovalsScreen() {
  return (
    <Frame path="/approvals" active="Approvals" title="Approvals" badge={AI_BADGE}>
      <p className="mt-3 text-[11px] text-muted sm:text-xs">
        4 drafts waiting. Nothing goes out until a board member approves it.
      </p>
      <ul className="mt-3 space-y-2">
        <Item icon={FileText} title="Violation letter, Unit 14" meta="Drafted from a photo, rule cited">
          <Pill tone="draft">Review</Pill>
        </Item>
        <Item icon={Megaphone} title="Pool closure notice" meta="Email, text and Spanish versions">
          <Pill tone="draft">Draft</Pill>
        </Item>
        <Item icon={Receipt} title="Vendor bill, landscaping" meta="Read from the scan, check before you approve">
          <Pill tone="draft">Review</Pill>
        </Item>
        <Item icon={ClipboardCheck} title="Annual meeting notice" meta="Deadline from your state’s law">
          <Pill tone="warn">Due soon</Pill>
        </Item>
      </ul>
      <div className="mt-3 rounded-xl border border-primary/25 bg-primary-subtle/60 p-3">
        <p className="text-xs font-semibold text-foreground">Violation letter, Unit 14</p>
        <Lines widths={['w-full', 'w-11/12', 'w-3/5']} />
        <Buttons />
      </div>
    </Frame>
  )
}

export function DuesScreen() {
  return (
    <Frame path="/dues" active="Dues" title="Dues and credits" badge={<Pill tone="late">1 past due</Pill>}>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Unit 3', 'Paid'],
          ['Unit 9', 'Credit on file'],
          ['Unit 21', 'Past due'],
        ].map(([unit, state]) => (
          <div key={unit} className="rounded-xl border border-border bg-surface p-2.5">
            <p className="text-[10px] text-muted sm:text-[11px]">{unit}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-foreground sm:text-xs">{state}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        <Item icon={Wallet} title="Unit 21, quarterly dues" meta="Balance carried from last quarter">
          <Pill tone="late">Past due</Pill>
        </Item>
        <Item icon={Wallet} title="Unit 9, overpayment" meta="Credit applied to next quarter">
          <Pill tone="ok">Credit</Pill>
        </Item>
        <Item icon={FileText} title="Unit 21, late notice" meta="Drafted with the statute cited">
          <Pill tone="draft">Review</Pill>
        </Item>
      </ul>
      <div className="mt-3 rounded-xl border border-border bg-subtle/60 p-3">
        <p className="text-xs font-semibold text-foreground">Late notice, Unit 21</p>
        <ul className="mt-2 space-y-1.5 text-[11px] text-foreground-secondary sm:text-xs">
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Balance matches the ledger
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Statute cited on the letter
          </li>
        </ul>
        <Buttons />
      </div>
    </Frame>
  )
}

export function ViolationsScreen() {
  return (
    <Frame path="/violations" active="Violations" title="Violations" badge={<Pill tone="warn">2 open</Pill>}>
      <div className="mt-3 flex gap-3 rounded-xl border border-border bg-surface p-2.5">
        <div
          className="flex h-20 w-24 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-gradient-to-b from-primary-subtle to-subtle sm:h-24 sm:w-32"
          aria-hidden
        >
          <div className="h-8 w-full bg-border-strong/50" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground sm:text-[13px]">Unit 14, fence</p>
          <p className="mt-0.5 text-[11px] text-muted sm:text-xs">
            Photo added by a board member. The AI matched it to the fence rule.
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            <BookOpen className="h-3 w-3" aria-hidden />
            Sample CC&amp;R · Section 3.4
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-primary/25 bg-primary-subtle/60 p-3">
        <p className="text-xs font-semibold text-foreground">First notice, awaiting board approval</p>
        <Lines widths={['w-full', 'w-10/12', 'w-2/3']} />
        <Buttons />
      </div>
      <ul className="mt-3 space-y-2">
        <Item icon={ShieldAlert} title="Unit 6, trash bins" meta="Notice sent, cure by the date shown">
          <Pill tone="ok">Cured</Pill>
        </Item>
      </ul>
    </Frame>
  )
}

export function AnnouncementsScreen() {
  return (
    <Frame path="/communications" active="Communications" title="Announcements" badge={AI_BADGE}>
      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <p className="text-[10px] font-semibold text-muted sm:text-[11px]">Board notes</p>
        <p className="mt-1 text-xs text-foreground sm:text-[13px]">Pool closed Saturday for repairs, reopens Monday.</p>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {['Email', 'Text', 'Español'].map((c, i) => (
          <span
            key={c}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              i === 0 ? 'bg-primary text-primary-fg' : 'bg-subtle text-foreground-secondary',
            )}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-primary/25 bg-primary-subtle/60 p-3">
        <p className="text-xs font-semibold text-foreground">Pool closure, Saturday</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-secondary sm:text-xs">
          Hello neighbors. The pool will be closed this Saturday for repairs and will reopen on Monday. Thank you for
          your patience.
        </p>
        <p className="mt-2 text-[10px] text-muted sm:text-[11px]">Text version fits one message. Spanish version ready.</p>
        <Buttons primary="Approve and send" />
      </div>
      <ul className="mt-3 space-y-2">
        <Item icon={Megaphone} title="Unit 14 reply, parking question" meta="Reply drafted for the board to read">
          <Pill tone="draft">Review</Pill>
        </Item>
      </ul>
    </Frame>
  )
}

export function AskScreen() {
  return (
    <Frame path="/ai/ask" active="Ask" title="Ask your documents" badge={<Pill tone="ok">Cited</Pill>}>
      <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-xs text-foreground sm:text-[13px]">
        Can a resident repaint their fence without approval?
      </p>
      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted sm:text-[11px]">
          <Sparkles className="h-3 w-3 text-accent-fg" aria-hidden />
          Answer from your documents
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground sm:text-[13px]">
          No. Fence color changes go to the Architectural Review Committee at least 14 days before work begins.
        </p>
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary-subtle px-2 py-1 text-[11px] font-semibold text-primary">
          <BookOpen className="h-3 w-3" aria-hidden />
          Sample CC&amp;R · Section 3.4
        </p>
      </div>
      <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-xs text-foreground sm:text-[13px]">
        What is the guest parking limit?
      </p>
      <div className="mt-3 rounded-xl border border-warning/30 bg-warning-subtle/50 p-3">
        <p className="text-xs leading-relaxed text-foreground sm:text-[13px]">
          Your documents don’t cover this. Check with the board or add the rules document.
        </p>
      </div>
    </Frame>
  )
}
