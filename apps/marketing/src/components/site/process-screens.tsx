'use client'
import * as React from 'react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  CalendarClock,
  Calculator,
  Check,
  ClipboardCheck,
  FileText,
  Flag,
  Home,
  Loader2,
  Mail,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { APP_HOST } from '../../lib/app-origin'
import { PROCESSES, type ProcessId } from '../../lib/process-demos'

// Code-built recreations of the real apps/hoa screens, one function per scene.
// Labels, buttons and layout follow the real app (see the `proof` strings in
// lib/process-demos.ts). All names and addresses are made up. Colours are
// tokens only; the ux ratchet bans raw palette classes.

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface SceneCtx {
  /** The scene is actually playing (not paused, not off-screen, not reduced). */
  live: boolean
  reduced: boolean
}
const Ctx = createContext<SceneCtx>({ live: false, reduced: false })

/** False for `ms` after the scene starts playing, then true. Always true when not playing, so still frames show the finished state. */
function usePhase(ms: number): boolean {
  const { live, reduced } = useContext(Ctx)
  const [done, setDone] = useState(true)
  const doneRef = useRef(true)
  const started = useRef(false)
  useIsoLayoutEffect(() => {
    doneRef.current = done
  }, [done])
  useIsoLayoutEffect(() => {
    if (reduced || !live) return
    if (!started.current) {
      started.current = true
      doneRef.current = false
      setDone(false)
    } else if (doneRef.current) return
    const t = setTimeout(() => setDone(true), ms)
    return () => clearTimeout(t)
  }, [live, reduced, ms])
  return done
}

/** Types `text` out when the scene plays; shows all of it otherwise. */
function Typed({ text, delay = 300, speed = 26 }: { text: string; delay?: number; speed?: number }) {
  const { live, reduced } = useContext(Ctx)
  const [n, setN] = useState(text.length)
  const nRef = useRef(text.length)
  const started = useRef(false)
  useIsoLayoutEffect(() => {
    if (reduced || !live) return
    let i = nRef.current
    let wait = 0
    if (!started.current) {
      started.current = true
      i = 0
      nRef.current = 0
      setN(0)
      wait = delay
    }
    if (i >= text.length) return
    let iv: ReturnType<typeof setInterval> | undefined
    const st = setTimeout(() => {
      iv = setInterval(() => {
        i += 1
        nRef.current = i
        setN(i)
        if (i >= text.length && iv) clearInterval(iv)
      }, speed)
    }, wait)
    return () => {
      clearTimeout(st)
      if (iv) clearInterval(iv)
    }
  }, [live, reduced, text, delay, speed])
  return (
    <>
      {text.slice(0, n)}
      {n < text.length ? <span aria-hidden className="ml-px inline-block h-[1em] w-px translate-y-[2px] bg-foreground" /> : null}
    </>
  )
}

/** Counts up to `target` when the scene plays. */
function Count({ to, ms = 1400 }: { to: number; ms?: number }) {
  const { live, reduced } = useContext(Ctx)
  const [v, setV] = useState(to)
  const started = useRef(false)
  useIsoLayoutEffect(() => {
    if (reduced || !live || started.current) return
    started.current = true
    setV(0)
    const t0 = Date.now()
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / ms)
      setV(Math.round(to * (1 - (1 - p) * (1 - p))))
      if (p >= 1) clearInterval(iv)
    }, 60)
    return () => clearInterval(iv)
  }, [live, reduced, to, ms])
  return <>{v}</>
}

type Tone = 'ok' | 'warn' | 'draft' | 'info'
const TONE: Record<Tone, string> = {
  ok: 'bg-success-subtle text-success',
  warn: 'bg-warning-subtle text-warning',
  draft: 'bg-subtle text-foreground-secondary',
  info: 'bg-primary-subtle text-primary',
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-[11px]', TONE[tone])}>
      {children}
    </span>
  )
}

function Btn({ children, hot, variant = 'primary' }: { children: ReactNode; hot?: boolean; variant?: 'primary' | 'outline' | 'ghost' }) {
  const { live } = useContext(Ctx)
  return (
    <span
      className={cn(
        'inline-flex min-h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-semibold sm:px-3 sm:text-xs',
        variant === 'primary' && 'bg-primary text-primary-fg',
        variant === 'outline' && 'border border-border-strong bg-surface text-foreground',
        variant === 'ghost' && 'text-foreground-secondary',
        hot && live && 'pp-pulse',
      )}
    >
      {children}
    </span>
  )
}

function Box({ label, children, className, grow }: { label: string; children: ReactNode; className?: string; grow?: boolean }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      <div className={cn('mt-1 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-foreground sm:text-xs', grow && 'min-h-[64px]')}>
        {children}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[11px] sm:text-xs">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{v}</dd>
    </div>
  )
}

function Stepper({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-[10px] font-semibold sm:gap-2 sm:text-[11px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
              i < at ? 'bg-success text-primary-fg' : i === at ? 'bg-primary text-primary-fg' : 'bg-subtle text-muted',
            )}
          >
            {i < at ? <Check className="h-2.5 w-2.5" aria-hidden /> : i + 1}
          </span>
          <span className={i === at ? 'text-foreground' : 'text-muted'}>{s}</span>
          {i < steps.length - 1 ? <span aria-hidden className="h-px w-3 bg-border-strong sm:w-5" /> : null}
        </li>
      ))}
    </ol>
  )
}

// ---------- pictures (inline SVG, no image files) ----------

function BinsPhoto({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" className={className} role="img" aria-label="Photo of two trash bins at the curb in front of a house">
      <defs>
        <linearGradient id="pp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0fb" />
          <stop offset="1" stopColor="#eaf5ff" />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill="url(#pp-sky)" />
      <rect y="62" width="160" height="38" fill="#7db86b" />
      <rect y="86" width="160" height="14" fill="#a9a9a9" />
      <rect x="10" y="30" width="78" height="38" fill="#eadcc6" />
      <polygon points="4,32 49,10 94,32" fill="#8c5b45" />
      <rect x="44" y="46" width="14" height="22" fill="#6b4a3a" />
      <rect x="18" y="40" width="14" height="12" fill="#cfe6f7" />
      <rect x="66" y="40" width="14" height="12" fill="#cfe6f7" />
      <rect x="104" y="64" width="20" height="26" rx="2" fill="#3f6f4f" />
      <rect x="102" y="61" width="24" height="5" rx="2" fill="#2f5a3e" />
      <rect x="130" y="66" width="18" height="24" rx="2" fill="#35597d" />
      <rect x="128" y="63" width="22" height="5" rx="2" fill="#284a69" />
    </svg>
  )
}

function FencePhoto({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" className={className} role="img" aria-label="Photo of a back yard where a new wooden fence will go">
      <rect width="160" height="100" fill="#d7ecfb" />
      <rect y="58" width="160" height="42" fill="#79b567" />
      <rect x="70" y="22" width="76" height="40" fill="#efe3cf" />
      <polygon points="64,24 108,6 152,24" fill="#95624a" />
      <rect x="100" y="40" width="12" height="22" fill="#6b4a3a" />
      {Array.from({ length: 14 }).map((_, i) => (
        <rect key={i} x={6 + i * 10.5} y="56" width="7" height="26" fill="#b98652" />
      ))}
      <rect x="4" y="62" width="150" height="3" fill="#9a6e40" />
      <rect x="4" y="74" width="150" height="3" fill="#9a6e40" />
    </svg>
  )
}

function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('shrink-0 rounded-[18px] border-2 border-foreground/70 bg-surface p-1 shadow-md', className)}>
      <div className="mx-auto mb-1 h-1 w-8 rounded-full bg-foreground/30" />
      <div className="overflow-hidden rounded-xl bg-background">{children}</div>
    </div>
  )
}

// ---------- shared frame ----------

const NAV: Array<{ label: string; icon: typeof Home }> = [
  { label: 'Dashboard', icon: Home },
  { label: 'Approvals', icon: ClipboardCheck },
  { label: 'Ask the Docs', icon: Sparkles },
  { label: 'Messages', icon: Mail },
  { label: 'Violations', icon: Flag },
  { label: 'ARC review', icon: ClipboardCheck },
  { label: 'Dues', icon: Wallet },
  { label: 'Documents', icon: FileText },
]

function Frame({
  path,
  title,
  chip,
  nav,
  portal,
  children,
  sceneKey,
  ptr,
  click,
}: {
  path: string
  title: string
  chip?: ReactNode
  nav?: string
  portal?: boolean
  children: ReactNode
  sceneKey: number
  ptr: [number, number]
  click?: boolean
}) {
  const { reduced } = useContext(Ctx)
  return (
    <div className="app-window relative">
      <div className="flex items-center gap-1.5 border-b border-border bg-subtle px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-2 min-w-0 truncate rounded-md bg-surface px-2.5 py-1 text-[10px] text-muted ring-1 ring-border sm:text-[11px]">
          {APP_HOST}
          {path}
        </span>
      </div>
      <div className="flex">
        {!portal ? (
          <div className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-border bg-subtle p-2 md:flex">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Maple Court HOA</p>
            {NAV.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium',
                  label === nav ? 'bg-primary-subtle text-primary' : 'text-foreground-secondary',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="relative h-[372px] min-w-0 flex-1 overflow-hidden bg-background sm:h-[404px]">
          {portal ? (
            <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 text-[11px] sm:px-4">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Home className="h-3.5 w-3.5 text-primary" aria-hidden />
                Maple Court HOA
              </span>
              <span className="text-muted">Resident portal</span>
            </div>
          ) : null}
          <div key={sceneKey} className="pp-scene relative h-full p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{title}</p>
              {chip}
            </div>
            {children}
          </div>
          <div
            key={`r${sceneKey}`}
            aria-hidden
            data-click={click ? 'true' : 'false'}
            className="pp-ripple"
            style={{ left: `${ptr[0]}%`, top: `${ptr[1]}%` }}
          />
          <svg
            aria-hidden
            viewBox="0 0 22 22"
            className="pp-pointer"
            style={{ left: `${ptr[0]}%`, top: `${ptr[1]}%`, transitionDuration: reduced ? '0ms' : undefined }}
          >
            <path d="M3 2 L3 17 L7 13.5 L9.8 19.5 L12.4 18.3 L9.6 12.5 L15 12.5 Z" fill="hsl(var(--foreground))" stroke="hsl(var(--surface))" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ---------- violations ----------

const LETTER_A =
  'Dear homeowner at 14 Maple Court,\n\nDuring a walk of the community, trash bins were seen at the curb well after collection day. Article VII, Section 4 asks that bins be stored out of view except on collection days.\n\nPlease bring them in'
const LETTER_B = ' by Friday, Nov 14. Thank you for helping keep Maple Court tidy.'

function ViolationScene({ s }: { s: number }) {
  const shot = usePhase(1500)
  const analyzed = usePhase(1700)
  const recorded = usePhase(1700)
  const stepper = ['Report', 'Review & approve', 'Recorded']

  if (s === 0)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={0} />
        <div className="flex gap-3">
          <Phone className="w-[92px] sm:w-[110px]">
            <div className="relative">
              <BinsPhoto className="block w-full" />
              {!shot ? <span aria-hidden className="absolute inset-0 bg-surface/90" /> : null}
            </div>
            <div className="flex h-9 items-center justify-center bg-foreground/90">
              <span className="h-5 w-5 rounded-full border-2 border-surface bg-surface/30" />
            </div>
          </Phone>
          <div className="min-w-0 flex-1 space-y-2">
            <Box label="Property">14 Maple Court</Box>
            <div>
              <p className="text-[11px] font-medium text-foreground">
                Photos <span className="font-normal text-muted">({shot ? 1 : 0} uploaded)</span>
              </p>
              <div className="mt-1 flex h-[52px] items-center rounded-lg border border-dashed border-border-strong px-2">
                {shot ? <BinsPhoto className="pp-scene h-10 w-16 rounded-md" /> : <span className="text-[11px] text-muted">Click to add photos</span>}
              </div>
            </div>
            <Box label="Notes" grow>
              <Typed text="Trash bins have been at the curb since Monday." delay={1500} />
            </Box>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-2.5">
          <Btn variant="ghost">Save draft & exit</Btn>
          <Btn hot>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Write the notice for me
          </Btn>
        </div>
      </div>
    )

  if (s === 1)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={analyzed ? 1 : 0} />
        {!analyzed ? (
          <div role="status" className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
            <p className="mt-3 text-xs font-medium text-foreground">Writing your notice</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[11px] text-muted">Reading your photo, matching the right CC&amp;R section, and drafting a letter.</p>
          </div>
        ) : (
          <div className="pp-scene space-y-2.5">
            <dl className="grid grid-cols-2 gap-x-4 rounded-xl border border-border bg-surface px-3 py-1 sm:gap-x-6">
              <Row k="Property" v="14 Maple Court" />
              <Row k="Violation type" v="Trash bins" />
              <Row k="CC&R section" v="Art. VII, Sec. 4" />
              <Row k="Severity" v={<Chip tone="warn">Minor</Chip>} />
            </dl>
            <Box label="Drafted letter" grow>
              <span className="line-clamp-4 whitespace-pre-line">
                <Typed text={LETTER_A.slice(0, 150)} delay={200} speed={14} />
              </span>
            </Box>
          </div>
        )}
      </div>
    )

  if (s === 2 || s === 3)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={s === 3 && recorded ? 2 : 1} />
        {s === 3 && recorded ? (
          <div className="pp-scene rounded-xl border border-border bg-surface p-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle text-success">
              <Check className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-2 text-sm font-semibold text-foreground">Notice recorded as sent</p>
            <p className="mx-auto mt-1 max-w-[280px] text-[11px] text-muted sm:text-xs">
              The letter for 14 Maple Court is on file. The homeowner has 14 days to fix it.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-foreground">Approve before sending</p>
            <p className="mt-0.5 text-[11px] text-muted">The board is responsible for the wording. Read carefully, edit anything that’s wrong, then approve.</p>
            <div className="mt-2 rounded-lg border border-border-strong bg-background p-2.5 text-[11px] leading-relaxed text-foreground sm:text-xs">
              <p className="whitespace-pre-line">
                {LETTER_A}
                {s === 2 ? <Typed text={LETTER_B} delay={900} speed={30} /> : LETTER_B}
              </p>
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <Btn variant="outline">Back to edit</Btn>
              <Btn hot={s === 3}>Approve & mark notice sent</Btn>
            </div>
          </div>
        )}
      </div>
    )

  // s === 4: the homeowner's portal
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs leading-relaxed text-foreground">Trash bins have been at the curb since Monday.</p>
        <dl className="mt-2 divide-y divide-border border-t border-border">
          <Row k="Rule cited" v="Article VII, Section 4" />
          <Row k="Notice sent" v="Oct 31" />
          <Row k="Fix by" v={<span className="text-warning">Nov 14</span>} />
        </dl>
      </div>
      <ol className="space-y-2 rounded-xl border border-border bg-surface p-3 text-[11px] sm:text-xs">
        <li className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-muted" aria-hidden />
          <span className="font-medium text-foreground">Opened by the board</span>
        </li>
        <li className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="font-medium text-foreground">Notice sent</span>
          <span className="text-muted">14 days to fix it</span>
        </li>
        <li className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 text-warning" aria-hidden />
          <span className="font-medium text-foreground">Fix by</span>
          <span className="text-muted">Nov 14</span>
        </li>
      </ol>
    </div>
  )
}

function violationChip(s: number, recorded: boolean) {
  if (s <= 1) return <Chip tone="draft">Draft</Chip>
  if (s === 2) return <Chip tone="warn">Awaiting board approval</Chip>
  return recorded || s === 4 ? <Chip tone="ok">Sent</Chip> : <Chip tone="warn">Awaiting board approval</Chip>
}

// ---------- announcements ----------

function AnnouncementScene({ s }: { s: number }) {
  const stepper = ['Template & audience', 'Message', 'Review & send']
  const picked = usePhase(1000)
  const confirmed = usePhase(2000)

  if (s === 0)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={0} />
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Write my own', 'Start from a blank message.'],
            ['Pool opening', 'Your HOA’s own template.'],
          ].map(([n, d], i) => (
            <div key={n} className={cn('rounded-xl border p-2.5', i === 0 ? 'border-primary bg-primary-subtle' : 'border-border bg-surface')}>
              <p className="text-xs font-semibold text-foreground">{n}</p>
              <p className="mt-0.5 text-[11px] text-muted">{d}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[11px] font-medium text-foreground">Audience</p>
          <ul className="mt-1 grid grid-cols-2 gap-1.5">
            {[
              ['All homes', '214 homes'],
              ['Owners', '168 homes'],
              ['Renters', '46 homes'],
              ['One street', 'Pick a street'],
            ].map(([n, d]) => {
              const on = n === 'All homes' && picked
              return (
                <li key={n} className={cn('flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11px] sm:text-xs', on ? 'border-primary bg-primary-subtle' : 'border-border bg-surface')}>
                  <span className="font-medium text-foreground">{n}</span>
                  <span className="text-muted">{d}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-subtle px-2.5 py-2 text-[11px] text-foreground-secondary sm:text-xs">
          <span>Going by</span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Email
          </span>
        </div>
      </div>
    )

  if (s === 1)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={1} />
        <div className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-subtle p-2.5 text-[11px] sm:text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-fg" aria-hidden />
          <span className="font-medium text-foreground">Drafted for you. Check it before sending.</span>
        </div>
        <Box label="Subject">
          <Typed text="The pool opens this Saturday" delay={400} speed={30} />
        </Box>
        <Box label="Body" grow>
          <span className="whitespace-pre-line">
            <Typed
              text={'The community pool opens Saturday at 9:00 am. Please bring your key fob.\nGuests are welcome when you come with them.'}
              delay={1500}
              speed={20}
            />
          </span>
        </Box>
      </div>
    )

  if (s === 2 || s === 3)
    return (
      <div className="mt-3 space-y-3">
        <Stepper steps={stepper} at={2} />
        <div className="flex gap-3">
          <dl className="min-w-0 flex-1 divide-y divide-border rounded-xl border border-border bg-surface px-3 py-1">
            <Row k="Audience" v="All homes (214)" />
            <Row k="Subject" v="The pool opens this Saturday" />
            <Row k="Languages" v="English" />
            <Row k="Going by" v="Email" />
            <Row k="When" v="Right away" />
          </dl>
          <Phone className="hidden w-[116px] sm:block">
            <div className="space-y-1.5 p-2">
              <p className="text-[9px] font-semibold text-muted">Maple Court HOA</p>
              <p className="text-[10px] font-semibold leading-tight text-foreground">The pool opens this Saturday</p>
              <p className="text-[9px] leading-snug text-foreground-secondary">The community pool opens Saturday at 9:00 am. Please bring your key fob.</p>
            </div>
          </Phone>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Btn variant="outline">Send a test to me</Btn>
          <Btn hot={s === 2}>Send now</Btn>
        </div>
        {s === 3 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/40 p-4">
            <div className="pp-scene w-full max-w-[320px] rounded-2xl border border-border bg-surface p-4 shadow-xl">
              {confirmed ? (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-subtle text-success">
                    <Check className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="mt-2 text-sm font-semibold text-foreground">Sending to 214 homes</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">Send to 214 homes by email?</p>
                  <p className="mt-1 text-[11px] text-muted sm:text-xs">Messages go out right away and cannot be taken back.</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Btn variant="outline">Cancel</Btn>
                    <Btn hot>Send now</Btn>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    )

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted">The pool opens this Saturday · Email · Sent just now</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Sent', 214],
          ['Delivered', 212],
          ['Opened', 131],
        ].map(([k, n]) => (
          <div key={String(k)} className="rounded-xl border border-border bg-surface p-2.5">
            <p className="text-[11px] text-muted">{k}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
              <Count to={Number(n)} />
            </p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-[11px] sm:text-xs">
        {[
          ['12 Maple Court', 'Opened'],
          ['14 Maple Court', 'Opened'],
          ['3 Birch Lane', 'Delivered'],
          ['9 Birch Lane', 'Opened'],
        ].map(([h, st]) => (
          <li key={h} className="flex items-center justify-between px-3 py-2">
            <span className="font-medium text-foreground">{h}</span>
            <Chip tone={st === 'Opened' ? 'ok' : 'info'}>{st}</Chip>
          </li>
        ))}
      </ul>
    </div>
  )
}

function announcementChip(s: number) {
  if (s <= 2) return <Chip tone="draft">Draft</Chip>
  if (s === 3) return <Chip tone="warn">Waiting for you to confirm</Chip>
  return <Chip tone="ok">Sent</Chip>
}

// ---------- architecture requests ----------

const ARC_STEPS_LIST = [
  'Height is within the 6 ft limit (Rules & regulations, Sec. 3.2)',
  'Cedar is an approved material (Sec. 3.4)',
  'Photo shows the planned location',
]

function ArcScene({ s }: { s: number }) {
  const checked = usePhase(1400)
  const sent = usePhase(1900)

  if (s === 0 || s === 1)
    return (
      <div className="mt-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Box label="Home">12 Maple Court</Box>
          <Box label="Type of change">Fence</Box>
        </div>
        <Box label="One-line summary">
          <Typed text="Replace the back fence with 6 ft cedar" delay={300} speed={28} />
        </Box>
        <div className="flex items-center gap-2.5">
          <FencePhoto className="h-12 w-[76px] shrink-0 rounded-md border border-border" />
          <p className="text-[11px] text-muted sm:text-xs">1 photo added</p>
        </div>
        {s === 1 || checked ? (
          <div className="pp-scene rounded-xl border border-accent/40 bg-accent-subtle p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent-fg" aria-hidden /> Rules that likely apply
            </p>
            <ul className="mt-1.5 space-y-1">
              {(s === 1 ? ARC_STEPS_LIST : ARC_STEPS_LIST.slice(0, 2)).map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[11px] text-foreground-secondary sm:text-xs">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Btn variant="outline" hot={s === 0}>
            Check my request against the rules
          </Btn>
          <Btn hot={s === 1}>Submit application</Btn>
        </div>
      </div>
    )

  if (s === 2)
    return (
      <div className="mt-3 space-y-3">
        <div className="overflow-hidden rounded-xl border border-border bg-surface text-[11px] sm:text-xs">
          <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr] gap-2 border-b border-border bg-subtle px-3 py-1.5 font-semibold text-muted">
            <span>Request</span>
            <span>Status</span>
            <span className="text-right">Decide by</span>
          </div>
          {[
            ['Fence, 12 Maple Court', 'New', 'Nov 30', '30 days left', true],
            ['Shed, 7 Birch Lane', 'In review', 'Nov 18', '18 days left', false],
          ].map(([a, st, d, left, on]) => (
            <div key={String(a)} className={cn('grid grid-cols-[1.2fr_0.7fr_0.9fr] items-center gap-2 border-b border-border px-3 py-2.5 last:border-0', on && 'bg-primary-subtle')}>
              <span className="font-medium text-foreground">{String(a)}</span>
              <span>
                <Chip tone={on ? 'warn' : 'info'}>{String(st)}</Chip>
              </span>
              <span className="text-right">
                <span className="block font-medium text-foreground">{String(d)}</span>
                <span className="block text-muted">{String(left)}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 rounded-xl border border-border bg-surface p-2.5">
          <FencePhoto className="h-14 w-24 shrink-0 rounded-md" />
          <ul className="space-y-1">
            {ARC_STEPS_LIST.map((t) => (
              <li key={t} className="flex items-start gap-1.5 text-[11px] text-foreground-secondary">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )

  if (s === 3 || (s === 4 && !sent))
    return (
      <div className="mt-3 space-y-2.5">
        <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-3 py-0.5">
          <Row k="Decide by" v="Nov 30 (30 days left)" />
          <Row k="Home" v="12 Maple Court" />
        </dl>
        <Box label="Your note to the homeowner" grow>
          <Typed text="Approved with conditions: keep it at 6 ft or lower, cedar only, finished side facing out." delay={500} speed={20} />
        </Box>
        <div className="flex items-center justify-end gap-2">
          <Btn variant="outline">Mark in review</Btn>
          <Btn variant="outline">Deny</Btn>
          <Btn hot={s === 3}>Approve</Btn>
        </div>
        {s === 4 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/40 p-4">
            <div className="pp-scene w-full max-w-[320px] rounded-2xl border border-border bg-surface p-4 shadow-xl">
              <p className="text-sm font-semibold text-foreground">Approve this request?</p>
              <p className="mt-1 text-[11px] text-muted sm:text-xs">The homeowner will be told right away and will see your note.</p>
              <div className="mt-3 flex justify-end gap-2">
                <Btn variant="outline">Cancel</Btn>
                <Btn hot>Approve</Btn>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )

  // s === 4 after the click: the resident's notice
  return (
    <div className="mt-3 space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <Check className="h-4 w-4" aria-hidden /> Application approved.
      </p>
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <Mail className="h-3 w-3" aria-hidden /> Email to the homeowner
        </p>
        <p className="mt-1 text-xs font-semibold text-foreground">Your ARC application was approved with conditions</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-secondary sm:text-xs">
          Your request for a 6 ft cedar fence at 12 Maple Court is approved. Keep it at 6 ft or lower, cedar only, finished side facing out.
        </p>
      </div>
    </div>
  )
}

function arcChip(s: number) {
  if (s <= 1) return <Chip tone="draft">Draft</Chip>
  if (s <= 3) return <Chip tone="warn">Awaiting board decision</Chip>
  return <Chip tone="ok">Approved with conditions</Chip>
}

// ---------- dues ----------

const OWES: Array<[string, string, string]> = [
  ['9 Birch Lane', '$250.00', '31 days'],
  ['21 Oak Terrace', '$500.00', '46 days'],
  ['5 Cedar Way', '$250.00', '12 days'],
]

function DuesScene({ s }: { s: number }) {
  const preview = usePhase(1300)
  const split = usePhase(1800)
  const kpis = (
    <div className="grid grid-cols-3 gap-2">
      {[
        ['Overdue', '$4,250.00', ''],
        ['Properties behind', '17', 'With an overdue charge'],
        ['Oldest overdue', '46 days', ''],
      ].map(([k, v, h]) => (
        <div key={k} className="rounded-xl border border-border bg-surface p-2">
          <p className="text-[10px] text-muted sm:text-[11px]">{k}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground sm:text-base">{v}</p>
          {h ? <p className="hidden text-[10px] text-muted sm:block">{h}</p> : null}
        </div>
      ))}
    </div>
  )

  if (s === 0)
    return (
      <div className="mt-3">
        <div className="opacity-50">{kpis}</div>
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/40 p-3">
          <div className="pp-scene w-full max-w-[400px] rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">Generate November dues</p>
            <p className="mt-1 text-[11px] text-muted sm:text-xs">
              Creates one regular charge per property for this month and posts it to the ledger.
            </p>
            <div className="mt-2.5">
              <Box label="Amount per property">$250.00</Box>
            </div>
            <div className="mt-2.5 min-h-[34px] text-[11px] sm:text-xs" aria-hidden>
              {preview ? (
                <p className="pp-scene font-medium text-foreground">214 homes, $250.00 each, $53,500.00 total, due Nov 15, 2026.</p>
              ) : (
                <p className="text-muted">Checking which homes will be billed…</p>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Btn variant="ghost">Cancel</Btn>
              <Btn hot>Generate dues</Btn>
            </div>
          </div>
        </div>
      </div>
    )

  if (s === 1)
    return (
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-subtle px-3 py-2 text-[11px] font-medium text-success sm:text-xs">
          <Check className="h-4 w-4" aria-hidden /> Billed 214 homes for November
        </div>
        {kpis}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <p className="border-b border-border bg-subtle px-3 py-1.5 text-[11px] font-semibold text-muted">Who owes</p>
          {OWES.map(([h, amt, days]) => (
            <div key={h} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] last:border-0 sm:text-xs">
              <span className="font-medium text-foreground">{h}</span>
              <span className="text-muted">{days} overdue</span>
              <Chip tone="warn">{amt} outstanding</Chip>
            </div>
          ))}
        </div>
      </div>
    )

  if (s === 2)
    return (
      <div className="mt-3">
        <div className="opacity-50">{kpis}</div>
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/40 p-3">
          <div className="pp-scene w-full max-w-[400px] rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">Record a payment for 9 Birch Lane</p>
            <p className="mt-1 text-[11px] text-muted sm:text-xs">Enter what the owner paid. You’ll see how it is split across their open charges before anything is saved.</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Box label="Amount received">
                $<Typed text="250.00" delay={400} speed={90} />
              </Box>
              <Box label="How it was paid">Check</Box>
            </div>
            {split ? (
              <div className="pp-scene mt-2.5 text-[11px] sm:text-xs" aria-hidden>
                <p className="font-medium text-foreground">Split in Georgia’s required order</p>
                <div className="mt-1 flex items-start justify-between rounded-lg border border-border p-2">
                  <span className="font-medium text-foreground">
                    October dues <span className="font-normal text-muted">due Oct 1</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-medium text-foreground">$250.00</span>
                    <span className="block text-muted">paid in full</span>
                  </span>
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Btn variant="ghost">Cancel</Btn>
              <Btn hot>{split ? 'Record $250.00' : 'Show the split'}</Btn>
            </div>
          </div>
        </div>
      </div>
    )

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-subtle px-3 py-2 text-[11px] font-medium text-success sm:text-xs">
        <Check className="h-4 w-4" aria-hidden /> Payment recorded for 9 Birch Lane
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface text-[11px] sm:text-xs">
        <div className="grid grid-cols-[0.6fr_1.4fr_0.8fr_0.8fr] gap-2 border-b border-border bg-subtle px-3 py-1.5 font-semibold text-muted">
          <span>Date</span>
          <span>Entry</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Balance</span>
        </div>
        {[
          ['Nov 1', 'November dues', '$250.00', '$500.00', false],
          ['Oct 31', 'Payment received (check)', '-$250.00', '$250.00', true],
          ['Oct 1', 'October dues', '$250.00', '$500.00', false],
        ].map(([d, e, a, b, on]) => (
          <div key={String(e)} className={cn('grid grid-cols-[0.6fr_1.4fr_0.8fr_0.8fr] gap-2 border-b border-border px-3 py-2 tabular-nums last:border-0', on && 'pp-scene bg-success-subtle')}>
            <span className="text-muted">{String(d)}</span>
            <span className="font-medium text-foreground">{String(e)}</span>
            <span className="text-right">{String(a)}</span>
            <span className="text-right font-medium text-foreground">{String(b)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted sm:text-xs">October dues are paid in full. November dues are due Nov 15.</p>
    </div>
  )
}

function duesChip(s: number) {
  if (s === 0) return <Chip tone="info">Preview</Chip>
  if (s === 1) return <Chip tone="warn">17 homes behind</Chip>
  if (s === 2) return <Chip tone="warn">$250.00 outstanding</Chip>
  return <Chip tone="ok">Paid in full</Chip>
}

// ---------- ask your documents ----------

const Q1 = 'Can I put a fence along the back of my lot?'
const A1 = 'Yes. Fences up to 6 feet are allowed along rear and side lot lines. Front-yard fences are not allowed. Submit an architecture request first.'

function AskScene({ s }: { s: number }) {
  const thinking = usePhase(1400)

  const input = (text: ReactNode, hot?: boolean) => (
    <div className="flex items-center gap-2">
      <div className="min-h-[34px] min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-[11px] text-foreground sm:text-xs">{text}</div>
      <Btn hot={hot}>Ask</Btn>
    </div>
  )

  if (s === 0)
    return (
      <div className="mt-3 space-y-3">
        {input(<Typed text={Q1} delay={400} speed={36} />, true)}
        <p className="text-[11px] text-muted">Ask about your governing documents, for example: can I install a satellite dish?</p>
        <div className="flex flex-wrap gap-1.5">
          {['Declaration', 'Bylaws', 'Rules & regulations'].map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-1 text-[10px] font-medium text-foreground-secondary sm:text-[11px]">
              <FileText className="h-3 w-3" aria-hidden /> {d}
            </span>
          ))}
        </div>
      </div>
    )

  if (s === 1 || s === 2)
    return (
      <div className="mt-3 space-y-3">
        {input(Q1)}
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> Answer
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground">
            {s === 1 ? (
              thinking ? <Typed text={A1} delay={100} speed={14} /> : <span className="text-muted">Searching your governing documents…</span>
            ) : (
              A1
            )}
          </p>
          <p className="mt-3 text-[11px] font-semibold text-foreground">Cited sections (2)</p>
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {[
              ['Declaration', 'Article VI, Section 2: Fences'],
              ['Rules & regulations', 'Section 3.2: Fence height'],
            ].map(([k, t], i) => (
              <li key={t} className={cn('rounded-lg border p-2', s === 2 && i === 0 ? 'border-primary bg-primary-subtle' : 'border-border bg-background')}>
                <span className="block text-[11px] font-semibold text-primary">{k}</span>
                <span className="mt-0.5 block text-[11px] text-foreground sm:text-xs">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )

  return (
    <div className="mt-3 space-y-3">
      {input('How much is 9 Birch Lane behind on dues?')}
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <Calculator className="h-3.5 w-3.5 text-primary" aria-hidden /> Answer
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground">9 Birch Lane has one open charge, October dues of $250.00, 31 days overdue.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <Chip tone="info">1 data lookup</Chip>
          <span>Answered from your records. Verify figures on the source page before acting on them.</span>
        </div>
      </div>
    </div>
  )
}

// ---------- entry ----------

const META: Record<ProcessId, { title: string; nav: string; portalAt?: (s: number) => boolean }> = {
  violations: { title: 'New violation', nav: 'Violations', portalAt: (s) => s === 4 },
  announcements: { title: 'New message to residents', nav: 'Messages' },
  arc: { title: 'Architecture request', nav: 'ARC review', portalAt: (s) => s <= 1 },
  dues: { title: 'Dues', nav: 'Dues' },
  ask: { title: 'Ask the Docs', nav: 'Ask the Docs' },
}

const PATHS: Partial<Record<ProcessId, (s: number) => string>> = {
  violations: (s) => (s === 4 ? '/resident/violations/notice' : '/violations/new'),
  arc: (s) => (s <= 1 ? '/resident/arc/new' : s === 2 ? '/arc' : '/arc/fence-12-maple'),
  dues: (s) => (s === 3 ? '/dues/9-birch-lane' : '/dues'),
}

export function ProcessScreen({ id, scene, live, reduced }: { id: ProcessId; scene: number; live: boolean; reduced: boolean }) {
  const def = PROCESSES[id]
  const sc = def.scenes[scene] ?? def.scenes[0]
  const meta = META[id]
  const portal = meta.portalAt?.(scene) ?? false
  let title = meta.title
  let chip: ReactNode = null
  let body: ReactNode = null
  if (id === 'violations') {
    title = portal ? 'Violation at 14 Maple Court' : 'New violation'
    chip = violationChip(scene, true)
    body = <ViolationScene s={scene} />
  } else if (id === 'announcements') {
    chip = announcementChip(scene)
    body = <AnnouncementScene s={scene} />
  } else if (id === 'arc') {
    title = scene <= 1 ? 'Request an architecture review' : scene === 2 ? 'Architecture requests' : 'Fence, 12 Maple Court'
    chip = arcChip(scene)
    body = <ArcScene s={scene} />
  } else if (id === 'dues') {
    title = scene === 3 ? '9 Birch Lane' : 'Dues'
    chip = duesChip(scene)
    body = <DuesScene s={scene} />
  } else {
    chip = <Chip tone="info">Governing documents</Chip>
    body = <AskScene s={scene} />
  }
  const path = PATHS[id]?.(scene) ?? def.urlPath
  return (
    <Ctx.Provider value={{ live, reduced }}>
      <Frame path={path} title={title} chip={chip} nav={meta.nav} portal={portal} sceneKey={scene} ptr={sc.ptr} click={sc.click}>
        {body}
      </Frame>
    </Ctx.Provider>
  )
}
