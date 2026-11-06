'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { resetCalendarLink } from '@/lib/calendar-feed/actions'
import { Panel } from '@/components/resident/screen'

/**
 * "Add to my calendar": subscribe once and new meetings and events reach the
 * phone by themselves. Big buttons, plain words. The links come from the
 * server; this card never builds or signs one.
 */
export function CalendarFeedCard({ webcalUrl, httpsUrl }: { webcalUrl: string; httpsUrl: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setMessage('Link copied. Paste it into your calendar app.')
    } catch {
      setError('Couldn’t copy. Press and hold the link below, then choose Copy.')
    }
  }

  function reset() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await resetCalendarLink()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setConfirming(false)
      setCopied(false)
      setMessage('Done. Your old link no longer works. Subscribe again with the new one.')
      router.refresh()
    })
  }

  return (
    <Panel className="space-y-4" title="Add to my calendar" icon={<CalendarPlus />}>
      <p className="text-sm text-foreground-secondary">
        Subscribe once and every new meeting and community event shows up on your phone by itself.
      </p>
      <Button asChild size="lg" className="min-h-12 w-full">
        <a href={webcalUrl}>Subscribe on this phone</a>
      </Button>
      <Button type="button" variant="secondary" size="lg" className="min-h-12 w-full" onClick={copy}>
        {copied ? 'Link copied' : 'Copy link'}
      </Button>
      <ul className="space-y-1 text-sm text-foreground-secondary">
        <li>
          <span className="font-semibold text-foreground">iPhone:</span> tap Subscribe, then tap Subscribe again.
        </li>
        <li>
          <span className="font-semibold text-foreground">Google Calendar:</span> choose Copy link, then on a computer open
          Other calendars, From URL, and paste it.
        </li>
      </ul>
      <p className="break-all text-xs text-muted" aria-label="Your calendar link">
        {httpsUrl}
      </p>
      <div className="border-t border-border pt-3">
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              This stops your old link from working. You will need to subscribe again. Reset it?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="lg" className="min-h-12" onClick={reset} disabled={pending}>
                {pending ? 'Resetting…' : 'Yes, reset it'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="min-h-12"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                No, keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" size="lg" className="min-h-12" onClick={() => setConfirming(true)}>
            Reset my calendar link
          </Button>
        )}
      </div>
      <p className="text-sm text-foreground" role="status">
        {message}
      </p>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  )
}
