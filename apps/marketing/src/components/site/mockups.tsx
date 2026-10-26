import { BookOpen, Check, CircleDot, Clock, FileText, Landmark, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APP_HOST } from '@/lib/app-origin'

// HTML/CSS stand-ins for real HOA app screens (no stock photos, no
// screenshots to go stale). Each mirrors a page that exists in apps/hoa:
//   GeorgiaCompliancePanel  -> /compliance (and /compliance/ga-registration)
//   CollectionsLetterCard   -> /properties/[id]/collections-letter
//   AskAnswerCard           -> /ai/ask
// Every figure is one the product itself uses (lib/state-law.ts): the 30-day
// fee notice, the $2,000 threshold, the 10% interest cap, the 21-day annual
// meeting notice, the 5-business-day statement of amounts due. Sample
// community, sample data, and the caption says so wherever these render.

function Chrome({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-subtle/70 px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-border-strong/70" />
      <span className="ml-3 truncate rounded-md bg-surface px-2.5 py-1 text-[11px] text-muted ring-1 ring-border">
        {APP_HOST}
        {path}
      </span>
    </div>
  )
}

type Tone = 'ok' | 'soon' | 'draft'

const TONE: Record<Tone, string> = {
  ok: 'bg-success-subtle text-success',
  soon: 'bg-warning-subtle text-warning',
  draft: 'bg-primary-subtle text-primary',
}

function Row({
  icon: Icon,
  title,
  meta,
  status,
  tone,
}: {
  icon: typeof Landmark
  title: string
  meta: string
  status: string
  tone: Tone
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-foreground-secondary">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] sm:truncate font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted sm:truncate">{meta}</span>
      </span>
      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', TONE[tone])}>{status}</span>
    </li>
  )
}

export function GeorgiaCompliancePanel({ className }: { className?: string }) {
  return (
    <div className={cn('app-window', className)}>
      <Chrome path="/compliance" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-muted">Sample community · Georgia</p>
            <p className="mt-0.5 text-base font-semibold tracking-tight text-foreground">Compliance</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Landmark className="h-3 w-3" aria-hidden />
            SB 406
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          <Row
            icon={Landmark}
            title="Secretary of State registration"
            meta="Filing sheet filled from your records"
            status="Ready to review"
            tone="draft"
          />
          <Row
            icon={FileText}
            title="Notice before attorney’s fees"
            meta="30 days from receipt"
            status="Draft"
            tone="draft"
          />
          <Row
            icon={Clock}
            title="Annual meeting notice"
            meta="21 days before the meeting"
            status="Due soon"
            tone="soon"
          />
          <Row
            icon={Check}
            title="Statement of amounts due"
            meta="Within 5 business days of a request"
            status="On track"
            tone="ok"
          />
        </ul>
        <div className="h-10" aria-hidden />
      </div>
    </div>
  )
}

export function CollectionsLetterCard({ className }: { className?: string }) {
  return (
    <div className={cn('app-window', className)}>
      <div className="flex items-center justify-between border-b border-border bg-subtle/70 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
          Collections letter
        </span>
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-warning">
          Awaiting board approval
        </span>
      </div>
      <div className="p-4">
        <p className="text-[13px] font-semibold text-foreground">Notice before attorney’s fees</p>
        <div className="mt-2.5 space-y-1.5" aria-hidden>
          <div className="h-1.5 w-full rounded-full bg-border" />
          <div className="h-1.5 w-11/12 rounded-full bg-border" />
          <div className="h-1.5 w-4/5 rounded-full bg-border" />
        </div>
        <ul className="mt-3.5 space-y-1.5 text-xs text-foreground-secondary">
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            $2,000 threshold and 10% interest cap checked
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            Statute cited on the letter
          </li>
        </ul>
        <div className="mt-4 flex gap-2">
          <span className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-fg">
            Approve
          </span>
          <span className="inline-flex items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">
            Edit
          </span>
        </div>
      </div>
    </div>
  )
}

export function AskAnswerCard({ className }: { className?: string }) {
  return (
    <div className={cn('app-window', className)}>
      <div className="p-4">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <Sparkles className="h-3 w-3 text-accent-fg" aria-hidden />
          Ask your governing documents
        </p>
        <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-foreground">
          Can residents paint their fence without approval?
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-foreground">
          No. Fence color changes go to the Architectural Review Committee at least 14 days before work begins.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-subtle px-2 py-1 text-[11px] font-semibold text-primary">
          <BookOpen className="h-3 w-3" aria-hidden />
          Sample CC&amp;R · Section 3.4
        </p>
      </div>
    </div>
  )
}

/** The hero composition: one large window with two cards overlapping it. */
export function HeroProductVisual() {
  return (
    <div
      className="relative mx-auto w-full max-w-[600px]"
      role="img"
      aria-label="Sample screens from HomeownerHub: a Georgia compliance checklist, a collections letter waiting for board approval, and a cited answer from a CC&R."
    >
      <div aria-hidden>
        <GeorgiaCompliancePanel />
        <div className="relative -mt-8 grid gap-3 px-3 sm:grid-cols-2 sm:gap-4 sm:px-6">
          <AskAnswerCard />
          <CollectionsLetterCard className="hidden sm:block" />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        <CircleDot className="mr-1 inline h-3 w-3 align-[-1px] text-primary" aria-hidden />
        Sample community and sample data. The board approves every draft.
      </p>
    </div>
  )
}
