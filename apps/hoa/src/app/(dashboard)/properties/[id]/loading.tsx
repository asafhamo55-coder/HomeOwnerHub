import { Card, CardContent, Skeleton } from '@homeowner-portal/ui'
import { SECTIONS, SECTION_LABEL } from '@/lib/properties/sections'

/**
 * The property page's shape while its two read waves run: the header,
 * the action bar and each section's title, so a click paints at once and
 * the page doesn't jump when it streams in. Section titles are real text
 * (they never change); everything that depends on data is a placeholder.
 */
export default function PropertyLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the property…</span>
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2" aria-hidden>
        {[9, 8, 8, 6].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" style={{ width: `${w}rem` }} />
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[10.5rem_minmax(0,1fr)] lg:gap-8" aria-hidden>
        <div className="hidden space-y-2 lg:block">
          {SECTIONS.map((s) => (
            <p key={s} className="px-2.5 py-1.5 text-sm text-muted">
              {SECTION_LABEL[s]}
            </p>
          ))}
        </div>
        <div className="space-y-10">
          {SECTIONS.slice(0, 3).map((s) => (
            <div key={s} className="space-y-3">
              <p className="text-lg font-semibold text-foreground">{SECTION_LABEL[s]}</p>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
