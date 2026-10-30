'use client'

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Field — label + control + hint + error, wired for assistive tech.
 *
 * Fixes UX audit findings 4 and 5: 73 files rendered a `<label>` with no
 * `htmlFor`, and `aria-invalid` appeared zero times. Field owns the id:
 *
 *   <Field label="Email" hint="We never share it" error={errors.email}>
 *     <Input name="email" type="email" />
 *   </Field>
 *
 * The control gets `id`, `aria-describedby` (hint + error) and
 * `aria-invalid` without the call site passing any of them. Works with
 * `Input`, `Textarea`, `Select` (they read context) and with a raw
 * `<input>`/`<select>`/`<textarea>` child (props are cloned onto it). For
 * anything else, use the render prop: `{(control) => <Thing {...control} />}`.
 */

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

interface FieldContextValue extends FieldControlProps {
  invalid: boolean
  disabled?: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

/** Inside a Field: the props a control must carry. Outside: null. */
export function useField(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

/**
 * Merge a control's own props with the enclosing Field's wiring. The
 * control's explicit props win, so a call site can still override.
 */
export function useFieldControlProps<
  P extends { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: unknown; error?: boolean },
>(props: P): { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: true; invalid: boolean } {
  const field = useField()
  const invalid = Boolean(props.error) || props['aria-invalid'] === true || props['aria-invalid'] === 'true' || Boolean(field?.invalid)
  const describedBy = [field?.['aria-describedby'], props['aria-describedby']].filter(Boolean).join(' ') || undefined
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid ? true : undefined,
    invalid,
  }
}

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
  optional?: boolean
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required, optional, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('inline-flex items-baseline gap-1 text-sm font-medium text-foreground', className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-danger" aria-hidden>
          *
        </span>
      ) : null}
      {optional ? <span className="text-xs font-normal text-muted">(optional)</span> : null}
    </label>
  ),
)
Label.displayName = 'Label'

export interface FieldProps {
  label: React.ReactNode
  /** Helper text under the control. Announced via aria-describedby. */
  hint?: React.ReactNode
  /** Per-field error. Truthy → aria-invalid + message announced. */
  error?: React.ReactNode
  required?: boolean
  /** Shows "(optional)" after the label — use on forms where most fields are required. */
  optional?: boolean
  /** Override the generated id (e.g. to match an existing anchor). */
  id?: string
  /** Visually hide the label (it is still the accessible name). */
  hideLabel?: boolean
  /** Extra content on the label row, right-aligned (e.g. a "Forgot?" link). */
  labelAside?: React.ReactNode
  className?: string
  children: React.ReactNode | ((control: FieldControlProps) => React.ReactNode)
}

const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea'])

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  id: idProp,
  hideLabel,
  labelAside,
  className,
  children,
}: FieldProps) {
  const autoId = React.useId()
  const id = idProp ?? `f${autoId.replace(/:/g, '')}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const invalid = Boolean(error)

  const control: FieldControlProps = {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(invalid ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  }

  let body: React.ReactNode
  if (typeof children === 'function') {
    body = children(control)
  } else if (
    React.isValidElement(children) &&
    typeof children.type === 'string' &&
    NATIVE_CONTROLS.has(children.type)
  ) {
    const own = children.props as Record<string, unknown>
    body = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ...control,
      id: (own.id as string | undefined) ?? id,
      required: own.required ?? required,
    })
  } else {
    body = children
  }

  return (
    <FieldContext.Provider value={{ ...control, invalid }}>
      <div className={cn('flex flex-col gap-1.5', className)} data-invalid={invalid || undefined}>
        <div className={cn('flex items-baseline justify-between gap-2', hideLabel && 'sr-only')}>
          <Label htmlFor={id} required={required} optional={optional}>
            {label}
          </Label>
          {labelAside ? <div className="text-xs">{labelAside}</div> : null}
        </div>
        {body}
        {hint ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

/** Groups related checkboxes/radios under one legend. */
export function Fieldset({
  legend,
  hint,
  error,
  children,
  className,
}: {
  legend: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = `fs${React.useId().replace(/:/g, '')}`
  return (
    <fieldset
      className={cn('flex flex-col gap-2', className)}
      aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1 text-sm font-medium text-foreground">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  )
}
