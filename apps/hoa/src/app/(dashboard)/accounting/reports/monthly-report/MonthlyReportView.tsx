import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { BrandMark, BrandWordmark, Card } from '@homeowner-portal/ui'
import type { MonthlyReportData } from '@/lib/monthly-report/model'
import { buildReportView, unavailableSentence, type Block, type Figure, type Line, type Tone } from '@/lib/monthly-report/view'

/**
 * The month-end board report on screen and on paper (BL-073). Pure
 * presentation of `buildReportView` (lib/monthly-report/view.ts), which is
 * also what the email is built from, so the page, the email and the printout
 * say the same things in the same order: a plain-words summary and the
 * headline figures first, then the detail.
 *
 * Sizes: body text 16px, labels 14px or more; figures are tabular and right
 * aligned so columns of money line up. Nothing is a wide table, so a 375px
 * phone never scrolls sideways. On paper the app menu is gone (the shell
 * hides it) and cards avoid splitting across pages.
 */

const inApp = { appUrl: (path: string) => path }

const toneClass = (t?: Tone) => (t === 'danger' ? 'text-danger' : t === 'success' ? 'text-success' : 'text-foreground')

export function MonthlyReportView({ data }: { data: MonthlyReportData }) {
  const { summary, sections } = buildReportView(data, inApp)
  const missing = unavailableSentence(summary.unavailable)

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Paper masthead: the screen has the app header and breadcrumbs instead. */}
      <header className="hidden items-center justify-between border-b-2 border-primary pb-3 print:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <BrandWordmark className="h-6 w-auto" />
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">{data.associationName}</p>
          <p className="text-sm text-muted">{data.period.label} board report</p>
        </div>
      </header>

      <section aria-labelledby="in-brief" className="rounded-xl border border-primary/20 bg-primary-subtle p-5 print:break-inside-avoid sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">In brief</p>
        <h2 id="in-brief" className="mt-1 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {summary.headline}
        </h2>
        {summary.sentences.length > 0 ? (
          <div className="mt-3 space-y-2 text-base leading-relaxed text-foreground-secondary">
            {summary.sentences.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        ) : null}
        {missing ? <p role="alert" className="mt-3 text-base font-medium text-danger">{missing}</p> : null}
      </section>

      {summary.attention.length > 0 ? (
        <section aria-labelledby="worth-a-look" className="rounded-xl border-l-4 border-warning-solid bg-warning-subtle p-5 print:break-inside-avoid">
          <h2 id="worth-a-look" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            Worth a look
          </h2>
          <ul className="mt-2 space-y-1.5 text-base text-foreground">
            {summary.attention.map((a) => (
              <li key={a.text} className="flex gap-2">
                <span aria-hidden className="text-warning">
                  &bull;
                </span>
                <span>
                  {a.text}{' '}
                  {a.href ? (
                    <Link href={a.href} className="font-semibold text-primary underline-offset-2 hover:underline print:hidden">
                      Open
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Key figures" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-2">
        {summary.figures.map((f) => (
          <FigureTile key={f.label} f={f} />
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        {sections.map((b) => (
          <SectionCard key={b.title} b={b} />
        ))}
      </div>
    </div>
  )
}

function FigureTile({ f }: { f: Figure }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 print:break-inside-avoid">
      <p className="text-sm font-medium text-muted">{f.label}</p>
      <p
        className={`num mt-1 font-semibold leading-tight [overflow-wrap:anywhere] ${f.unavailable ? 'text-lg text-muted' : 'text-2xl'} ${f.unavailable ? '' : toneClass(f.tone)}`}
      >
        {f.value}
      </p>
      {f.sub ? <p className="mt-1 text-sm text-muted">{f.sub}</p> : null}
    </div>
  )
}

function SectionCard({ b }: { b: Block }) {
  return (
    <Card className="min-w-0 p-5 print:break-inside-avoid print:shadow-none">
      <h2 className="text-lg font-semibold text-foreground">{b.title}</h2>
      {b.lines === null ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-subtle p-3 text-base text-danger">{b.failed}</p>
      ) : b.empty ? (
        <p className="mt-2 text-base text-muted">{b.lines[0]?.value}.</p>
      ) : (
        <dl className="mt-2 divide-y divide-border">
          {b.lines.map((l) => (
            <Row key={l.label} l={l} />
          ))}
        </dl>
      )}
      {b.note && b.lines !== null ? <p className="mt-2 text-sm text-muted">{b.note}</p> : null}
      {b.link ? (
        <p className="mt-3 print:hidden">
          <Link href={b.link.href} className="inline-flex items-center gap-1 text-base font-semibold text-primary underline-offset-2 hover:underline">
            {b.link.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </p>
      ) : null}
    </Card>
  )
}

function Row({ l }: { l: Line }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt className="text-base text-muted">{l.label}</dt>
      <dd
        className={`num min-w-0 text-base font-semibold [overflow-wrap:anywhere] ${l.value.length > 20 ? 'basis-full text-left' : 'text-right'} ${toneClass(l.tone)}`}
      >{l.value}</dd>
    </div>
  )
}
