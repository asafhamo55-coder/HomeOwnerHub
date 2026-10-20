'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlarmClock } from 'lucide-react'
import { Alert, Button, Select } from '@homeowner-portal/ui'
import { snoozeThread } from '@/lib/inbox/snooze'
import { isSnoozed, snoozePresets, snoozedLabel } from '@/lib/inbox/snooze-rules'

/**
 * BL-134 (inbox plan B1): "Snooze until …" in the thread header. The page
 * renders this only once M3_APPLIED (migration 0067). Presets are worked
 * out here, in the board member's own time zone; the server checks the
 * instant. A resident's new reply wakes the thread on its own (0067's
 * trigger), so a snooze never hides an answer.
 */
export function SnoozeControl({ threadId, snoozedUntil }: { threadId: string; snoozedUntil: string | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [until, setUntil] = useState<string | null>(snoozedUntil)
  const presets = useMemo(() => snoozePresets(new Date()), [])
  const snoozed = isSnoozed(until, Date.now())

  function apply(next: string | null) {
    setError(null)
    startTransition(async () => {
      const result = await snoozeThread(threadId, next)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setUntil(result.snoozedUntil)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {snoozed && until ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <AlarmClock className="size-3.5" aria-hidden />
            {snoozedLabel(until)}
          </span>
          <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => apply(null)}>
            Unsnooze
          </Button>
        </>
      ) : (
        <div className="w-44">
          <Select
            value=""
            onValueChange={(key) => {
              const preset = presets.find((p) => p.key === key)
              if (preset) apply(preset.until.toISOString())
            }}
            disabled={pending}
            options={presets.map((p) => ({ value: p.key, label: p.label }))}
            placeholder="Snooze until…"
          />
        </div>
      )}
      {error ? (
        <Alert variant="error" className="w-full">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
