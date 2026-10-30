import { FileCheck2, Lock, ShieldCheck, Users } from 'lucide-react'
import { cn, BrandLogo, BrandMark } from '@homeowner-portal/ui'
import { AppVersion } from '@/components/layout/AppVersion'
import { appVersion } from '@/lib/app-version'

/**
 * The signed-out (and pre-org) frame: a calm canvas, the product mark, one
 * centered surface, and a short trust line. Used by the (auth) layout and
 * by onboarding, which sit outside the board AppShell.
 *
 * It renders no heading: each page renders its own single <h1> via
 * `AuthHeader`, so the document outline names the task ("Sign in"), not
 * the product.
 */
export function AuthShell({
  children,
  width = 'sm',
  footer,
  split = false,
}: {
  children: React.ReactNode
  /** sm = auth forms (28rem); md = onboarding steps (36rem). */
  width?: 'sm' | 'md'
  /** Replaces the default trust line. */
  footer?: React.ReactNode
  /**
   * Sign-in family: on lg+ a violet brand panel sits beside the form; below
   * lg a slim gradient strip replaces it. The panel carries the logo.
   */
  split?: boolean
}) {
  const form = (
    <main
      className={cn(
        'flex flex-1 flex-col items-center px-4 pb-10 pt-12 sm:justify-center sm:pt-10',
        split && 'pt-8 sm:pt-10 lg:px-10',
      )}
    >
        <div className={cn('w-full space-y-6', width === 'sm' ? 'max-w-md' : 'max-w-xl')}>
          {/* HomeownerHub logo (BL-098): the wordmark is the product name. */}
          {split ? null : (
            <div className="flex items-center justify-center">
              <BrandLogo size="lg" />
            </div>
          )}
          {children}
          <div className="text-center text-xs text-muted">
            {footer ?? (
              <p className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden />
                Encrypted connection · sessions end after 24 hours
              </p>
            )}
            {/* BL-071: which build is running, on every signed-out screen. */}
            <AppVersion version={appVersion()} className="mt-2" />
          </div>
        </div>
    </main>
  )
  if (!split) return <div className="flex min-h-dvh flex-col bg-background">{form}</div>
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <AuthBrandStrip />
      <div className="flex flex-1 flex-col lg:order-1">{form}</div>
      <AuthBrandPanel />
    </div>
  )
}

const BRAND_GRADIENT =
  'bg-[radial-gradient(60%_80%_at_0%_100%,#4a1dc2,transparent_75%),linear-gradient(135deg,#2a1288_0%,#4a1dc2_48%,#2b3cc4_100%)]'

function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-white', className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-white" aria-hidden>
        <BrandMark className="size-7" />
      </span>
      <span className="text-lg font-semibold tracking-[-0.01em]">HomeownerHub</span>
    </div>
  )
}

/** Below lg: a slim violet header above the form. */
function AuthBrandStrip() {
  return (
    <div className={cn('flex h-14 items-center px-5 lg:hidden', BRAND_GRADIENT)}>
      <BrandLockup />
    </div>
  )
}

const BENEFITS = [
  { icon: FileCheck2, text: 'Notices, letters and minutes drafted for you' },
  { icon: ShieldCheck, text: 'Nothing goes out until a board member approves it' },
  { icon: Users, text: 'One place for the board, the residents and your vendors' },
] as const

/** lg and up: the brand panel, echoing the website hero. */
function AuthBrandPanel() {
  return (
    <aside
      className={cn('relative hidden overflow-hidden text-white lg:order-2 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16', BRAND_GRADIENT)}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#22c7c0]/30 blur-3xl"
        aria-hidden
      />
      <BrandLockup className="relative" />
      <div className="relative max-w-md space-y-8">
        <p className="text-3xl font-semibold leading-tight tracking-[-0.02em] xl:text-4xl">
          Your board&apos;s paperwork, drafted and waiting for approval.
        </p>
        <ul className="space-y-4">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-base text-white/90">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-sm text-white/80">Built for volunteer HOA boards.</p>
    </aside>
  )
}

/** The card every auth step sits in. */
export function AuthPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8', className)}>
      {children}
    </div>
  )
}

/** Page title + one-line context. Renders the page's only <h1>. */
export function AuthHeader({
  title,
  description,
  icon,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-1.5">
      {icon ? (
        <span
          className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary-subtle text-primary [&_svg]:size-5"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <h1 className="text-xl font-semibold tracking-[-0.015em] text-foreground">{title}</h1>
      {description ? <div className="text-sm text-muted">{description}</div> : null}
    </div>
  )
}
