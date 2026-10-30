'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Checkbox, Radio and Switch — native `<input>`s, restyled.
 *
 * Native on purpose: they submit with `<form action>` and server actions
 * with no hidden-input mirroring, keyboard and screen-reader behaviour is
 * the browser's own, and they cost no JavaScript. Each takes an optional
 * `label` + `description` and wires `htmlFor` / `aria-describedby` itself.
 */

interface ChoiceExtras {
  label?: React.ReactNode
  description?: React.ReactNode
  /** Error state for the control (e.g. a required checkbox left empty). */
  error?: boolean
  /** Classes for the outer label row (when `label` is given). */
  wrapperClassName?: string
}

function useChoiceIds(id: string | undefined, hasDescription: boolean) {
  const auto = React.useId().replace(/:/g, '')
  const controlId = id ?? `c${auto}`
  return { controlId, descriptionId: hasDescription ? `${controlId}-desc` : undefined }
}

function ChoiceRow({
  controlId,
  descriptionId,
  label,
  description,
  disabled,
  className,
  children,
}: {
  controlId: string
  descriptionId?: string
  label?: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!label) return <>{children}</>
  return (
    // On touch the whole row is the target: min 44px tall, and the label's
    // ::after stretches over the row so the gap between box and label (and
    // the padding around both) toggles the control. Desktop is unchanged.
    <div
      className={cn(
        'relative flex items-start gap-3 coarse:min-h-11 coarse:py-[11px]',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="flex h-[1.375rem] items-center">{children}</div>
      <div className="min-w-0 space-y-0.5">
        <label
          htmlFor={controlId}
          className={cn(
            'block text-sm font-medium text-foreground coarse:after:absolute coarse:after:inset-0 coarse:after:content-[""]',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {label}
        </label>
        {description ? (
          // Above the label's touch overlay, so a link in a description stays tappable.
          <p id={descriptionId} className="text-xs text-muted coarse:relative coarse:z-[1]">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

const boxBase = [
  'peer relative shrink-0 appearance-none border border-input bg-surface shadow-xs',
  'transition-[background-color,border-color,box-shadow] duration-fast ease-standard',
  'hover:border-foreground/50',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:cursor-not-allowed disabled:bg-subtle',
  'checked:border-primary checked:bg-primary',
  'cursor-pointer',
].join(' ')

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>,
    ChoiceExtras {
  /** Renders the "some selected" dash (e.g. a select-all header). */
  indeterminate?: boolean
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, wrapperClassName, className, indeterminate, id, ...props }, ref) => {
    const { controlId, descriptionId } = useChoiceIds(id, Boolean(description))
    const inner = React.useRef<HTMLInputElement | null>(null)
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement)
    React.useEffect(() => {
      if (inner.current) inner.current.indeterminate = Boolean(indeterminate)
    }, [indeterminate])

    return (
      <ChoiceRow
        controlId={controlId}
        descriptionId={descriptionId}
        label={label}
        description={description}
        disabled={props.disabled}
        className={wrapperClassName}
      >
        <span className="relative inline-flex">
          <input
            ref={inner}
            {...props}
            type="checkbox"
            id={controlId}
            aria-describedby={[descriptionId, props['aria-describedby']].filter(Boolean).join(' ') || undefined}
            aria-invalid={error || undefined}
            className={cn(
              boxBase,
              'size-[18px] rounded-[5px] indeterminate:border-primary indeterminate:bg-primary',
              error && 'border-danger',
              className,
            )}
          />
          {/* Tick and dash drawn over the native box; hidden until checked. */}
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-primary-fg peer-checked:block peer-indeterminate:hidden"
          >
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-primary-fg peer-indeterminate:block"
          >
            <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </ChoiceRow>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>, ChoiceExtras {}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, error, wrapperClassName, className, id, ...props }, ref) => {
    const { controlId, descriptionId } = useChoiceIds(id, Boolean(description))
    return (
      <ChoiceRow
        controlId={controlId}
        descriptionId={descriptionId}
        label={label}
        description={description}
        disabled={props.disabled}
        className={wrapperClassName}
      >
        <span className="relative inline-flex">
          <input
            ref={ref}
            {...props}
            type="radio"
            id={controlId}
            aria-describedby={[descriptionId, props['aria-describedby']].filter(Boolean).join(' ') || undefined}
            aria-invalid={error || undefined}
            className={cn(boxBase, 'size-[18px] rounded-full', error && 'border-danger', className)}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto hidden size-1.5 rounded-full bg-primary-fg peer-checked:block"
          />
        </span>
      </ChoiceRow>
    )
  },
)
Radio.displayName = 'Radio'

/** Lays out Radios (or Checkboxes) with consistent spacing. Wrap in `Fieldset` for a legend. */
export function ChoiceGroup({
  children,
  orientation = 'vertical',
  className,
}: {
  children: React.ReactNode
  orientation?: 'vertical' | 'horizontal'
  className?: string
}) {
  return (
    <div
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-3' : 'flex flex-wrap gap-x-6 gap-y-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>,
    ChoiceExtras {
  size?: 'sm' | 'md'
}

/**
 * On/off setting that takes effect immediately. For a choice that is
 * submitted with a form, prefer Checkbox (DESIGN_STRATEGY §1: "Toggle").
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, error, wrapperClassName, className, id, size = 'md', ...props }, ref) => {
    const { controlId, descriptionId } = useChoiceIds(id, Boolean(description))
    const dims = size === 'sm' ? { track: 'h-5 w-9', thumb: 'size-4 peer-checked:translate-x-4' } : { track: 'h-6 w-11', thumb: 'size-5 peer-checked:translate-x-5' }
    return (
      <ChoiceRow
        controlId={controlId}
        descriptionId={descriptionId}
        label={label}
        description={description}
        disabled={props.disabled}
        className={wrapperClassName}
      >
        <span className="relative inline-flex">
          <input
            ref={ref}
            {...props}
            type="checkbox"
            role="switch"
            id={controlId}
            aria-describedby={[descriptionId, props['aria-describedby']].filter(Boolean).join(' ') || undefined}
            aria-invalid={error || undefined}
            className={cn(
              'peer shrink-0 cursor-pointer appearance-none rounded-full bg-foreground/25 transition-colors duration-base ease-standard',
              'checked:bg-primary hover:bg-foreground/35 checked:hover:bg-primary-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              dims.track,
              className,
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute left-0.5 top-0.5 rounded-full bg-white shadow-sm transition-transform duration-base ease-emphasized',
              dims.thumb,
            )}
          />
        </span>
      </ChoiceRow>
    )
  },
)
Switch.displayName = 'Switch'
