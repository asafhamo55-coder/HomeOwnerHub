'use client'

import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

interface Variant {
  label: string
  text: string
}

type AiRewriteButtonProps = {
  /** Optional short hint about what the field is for ("violation letter", "dues reminder"). Improves tone matching. */
  context?: string
  /** Hide the label, show only the sparkles icon. Useful in tight cells. */
  iconOnly?: boolean
  /** Disable when the parent is mid-submit. */
  disabled?: boolean
  /** Visual size for the trigger button. */
  size?: 'sm' | 'md'
} & (
  | {
      /** Controlled mode: pass value + onChange. */
      value: string
      onChange: (next: string) => void
      textareaRef?: never
    }
  | {
      /** Uncontrolled mode (form-based fields): pass a ref to the underlying textarea. */
      textareaRef: React.RefObject<HTMLTextAreaElement | null>
      value?: never
      onChange?: never
    }
)

export function AiRewriteButton(props: AiRewriteButtonProps) {
  const { context, iconOnly, disabled, size = 'sm' } = props

  function readValue(): string {
    if ('textareaRef' in props && props.textareaRef) {
      return props.textareaRef.current?.value ?? ''
    }
    return props.value ?? ''
  }

  function writeValue(next: string): void {
    if ('textareaRef' in props && props.textareaRef) {
      const el = props.textareaRef.current
      if (!el) return
      // Use the native setter so React's input synthetic event fires, which
      // keeps any onChange listeners + form libraries in sync.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setter?.call(el, next)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    props.onChange?.(next)
  }

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variants, setVariants] = useState<Variant[]>([])
  // Tick on every interaction so we re-read the ref'd textarea's current
  // value when deciding if the button should be disabled.
  const [, setReadTick] = useState(0)

  async function generate() {
    const current = readValue()
    if (current.trim().length === 0) return
    setOpen(true)
    setLoading(true)
    setError(null)
    setVariants([])
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: current, context }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Rewrite failed (${res.status}).`)
      }
      const data = (await res.json()) as { variants: Variant[] }
      setVariants(data.variants)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rewrite failed.')
    } finally {
      setLoading(false)
    }
  }

  function pick(text: string) {
    writeValue(text)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={disabled}
        onClick={generate}
        onMouseEnter={() => setReadTick((t) => t + 1)}
        onFocus={() => setReadTick((t) => t + 1)}
        title="Get 3 AI rewrites"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {iconOnly ? null : 'Improve with AI'}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI rewrite suggestions"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Choose a rewrite
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 animate-pulse rounded-lg border border-border bg-foreground/5"
                    />
                  ))}
                  <p className="text-center text-xs text-muted">
                    Generating three variants…
                  </p>
                </div>
              ) : error ? (
                <div className="space-y-3">
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={generate}>
                    Try again
                  </Button>
                </div>
              ) : variants.length === 0 ? (
                <p className="text-sm text-muted">No suggestions yet.</p>
              ) : (
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <article
                      key={`${v.label}-${i}`}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <header className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {v.label}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => pick(v.text)}
                        >
                          Use this
                        </Button>
                      </header>
                      <p className="whitespace-pre-wrap text-sm text-foreground">
                        {v.text}
                      </p>
                    </article>
                  ))}
                  <p className="text-center text-xs text-muted">
                    Picking a variant replaces the field. You can edit after.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
