'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'
import { dismissAnnouncementNudge } from '@/lib/announcements/actions'
import type { Nudge } from '@/lib/announcements/nudge'

/**
 * BL-173: the dashboard's way into "New announcement". Always offers the
 * button; when an occasion is inside its lead window (3 to 14 days, per occasion) it also suggests it ("Halloween
 * is Friday") with a one-tap start and a "Not now" that hides it for this
 * association (signed, no migration). Board-facing only; the section that
 * renders it checks the role.
 */
export function AnnouncementCard({ nudge }: { nudge: Nudge | null }) {
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const show = nudge !== null && !hidden

  function dismiss() {
    if (!nudge) return
    setError(null)
    start(async () => {
      const res = await dismissAnnouncementNudge(nudge.key).catch(() => ({ ok: false as const, error: 'Couldn’t hide this. Try again.' }))
      if (res.ok) setHidden(true)
      else setError(res.error)
    })
  }

  return (
    <Card id="announcements">
      <CardContent className="flex flex-col gap-3 p-4 cq-sm:flex-row cq-sm:items-center cq-sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            {show ? (
              <>
                <p className="text-sm font-medium text-foreground">{nudge.headline}</p>
                <p className="text-sm text-muted">{nudge.prompt}</p>
                {nudge.others.length > 0 ? (
                  <p className="text-xs text-muted">
                    +{nudge.others.length} more coming up: {nudge.others.map((o) => o.name).join(', ')}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">Tell the whole community</p>
                <p className="text-sm text-muted">Parties, holidays, reminders. Pick one, check the draft, send.</p>
              </>
            )}
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {show ? (
            <>
              <Button asChild size="lg">
                <Link href={`/communications/announce?occasion=${encodeURIComponent(nudge.occasionId)}&date=${nudge.date}`}>
                  Write it
                </Link>
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={dismiss} loading={pending}>
                Not now
              </Button>
            </>
          ) : null}
          <Button asChild size="lg" variant={show ? 'secondary' : 'primary'}>
            <Link href="/communications/announce">New announcement</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
