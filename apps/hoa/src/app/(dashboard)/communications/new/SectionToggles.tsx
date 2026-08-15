'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert } from '@homeowner-portal/ui'
import { renderTemplateSections } from '@/lib/community-templates/actions'
import type { TemplateSection } from '@/lib/community-templates/sections'
import type { TemplateQuestion } from '@/lib/community-templates/types'

/**
 * Per-section include/exclude for a community template.
 *
 * Before this, the composer handed over the fully-rendered body_html in a
 * textarea, so leaving out a paragraph meant editing HTML by hand. Here the
 * message is a list of its own sections and each one can be switched off.
 *
 * Toggling re-renders the body from the template, which discards manual
 * edits to the textarea below — stated in the UI rather than discovered.
 */
export function SectionToggles({
  topicSlug,
  disabled,
  onRendered,
}: {
  topicSlug: string
  disabled?: boolean
  /** Receives the re-rendered body and the questions still worth asking.
   *  bodyText is deliberately not threaded: the wizard already derives the
   *  plain-text part with stripHtml for every category, and changing that
   *  only for community templates would make two send paths differ. */
  onRendered: (r: { bodyHtml: string; questions: readonly TemplateQuestion[] }) => void
}) {
  const [sections, setSections] = useState<TemplateSection[] | null>(null)
  const [excluded, setExcluded] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset when the board member picks a different template — otherwise
  // exclusions from the previous one carry over onto unrelated sections.
  useEffect(() => {
    setExcluded([])
    setSections(null)
    setError(null)
  }, [topicSlug])

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const result = await renderTemplateSections({ topicSlug, excluded })
      // A slower earlier request must not overwrite a newer render.
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setSections(result.sections)
      onRendered({ bodyHtml: result.bodyHtml, questions: result.questions })
    })
    return () => {
      cancelled = true
    }
    // onRendered is a parent callback and is not in the dep list on
    // purpose: an inline arrow would change identity every render and
    // re-fire this effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicSlug, excluded])

  if (error && !sections) {
    return (
      <Alert variant="warning" className="mt-3">
        {error} Editing the message below still works.
      </Alert>
    )
  }

  if (!sections) return null

  const kept = sections.length - excluded.length

  function toggle(index: number) {
    setExcluded((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    )
  }

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Sections</span>
        <span className="text-xs text-muted">
          {kept} of {sections.length} included
        </span>
      </div>

      <ul className="space-y-1">
        {sections.map((s) => {
          const on = !excluded.includes(s.index)
          return (
            <li key={s.index}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted/10">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(s.index)}
                  disabled={disabled || pending}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className={`min-w-0 text-sm ${on ? 'text-foreground' : 'text-muted line-through'}`}>
                  <span className="font-medium">{s.label}</span>
                  <span className="ml-2 text-xs text-muted">{s.preview}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {error ? (
        <Alert variant="warning" className="mt-2">
          {error}
        </Alert>
      ) : null}

      <p className="mt-2 text-xs text-muted">
        Unchecking a section removes it from the email and rebuilds the message below, discarding
        any manual edits. Questions that only fed a removed section stop being asked.
      </p>
    </div>
  )
}
