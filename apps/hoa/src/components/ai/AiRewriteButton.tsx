'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

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

  function close() {
    setOpen(false)
  }

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
        throw new Error(await responseErrorMessage(res, `Rewrite failed (${res.status}).`))
      }
      const data = (await res.json().catch(() => null)) as { variants?: Variant[] } | null
      if (!data || !Array.isArray(data.variants)) throw new Error('Rewrite failed. Try again.')
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

  const dialog = (
    <DialogContent
      title="Choose a rewrite"
      description="Pick one of three AI-written versions to replace the field."
      size="lg"
      footer={
        <Button type="button" variant="outline" size="sm" onClick={close}>
          {variants.length > 0 ? 'Keep original' : 'Close'}
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-border bg-foreground/5"
            />
          ))}
          <p role="status" className="text-center text-xs text-muted">
            Generating three variants…
          </p>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <Alert variant="error">{error}</Alert>
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
                <Button type="button" size="sm" onClick={() => pick(v.text)}>
                  Use this
                </Button>
              </header>
              <p className="whitespace-pre-wrap text-sm text-foreground">{v.text}</p>
            </article>
          ))}
          <p className="text-center text-xs text-muted">
            Picking a variant replaces the field. You can edit after.
          </p>
        </div>
      )}
    </DialogContent>
  )

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

      {/* The kit Dialog portals to <body>, traps focus and returns it to
          the trigger on close, and closes on Escape. */}
      <Dialog open={open} onOpenChange={setOpen}>
        {dialog}
      </Dialog>
    </>
  )
}
