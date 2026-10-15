'use client'

import * as React from 'react'
import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { controlBase, controlInvalid } from '../lib/control'
import { useFieldControlProps } from './Field'

// Radix-based Select with a fully styleable open menu (the #1 reason
// native HTML <select> looks bad — browsers render the option list
// with OS chrome that CSS can't reach).
//
// API: pass children as <option value="x">Label</option> exactly like
// a native select. We parse them at render time and feed the values
// into Radix. This keeps every call site one find-replace away from
// the old native Select (onChange={e=>fn(e.target.value)} →
// onValueChange={fn}).
//
// Forms: an internal <input type="hidden"> mirrors `value` so the
// Select still participates in <form action={...}> submissions.

export interface SelectOptionData {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SelectProps {
  /** Controlled value. */
  value?: string
  /** Uncontrolled default. */
  defaultValue?: string
  /** Fires with the selected value (not an Event). */
  onValueChange?: (value: string) => void
  /** Native form name — handled via an internal hidden input. */
  name?: string
  /** Field id (attached to the trigger). */
  id?: string
  /** Placeholder when no value is selected. */
  placeholder?: string
  /** Validation/error state. */
  error?: boolean
  /** Disable the whole control. */
  disabled?: boolean
  /** Make the field required for native form validation. */
  required?: boolean
  /** Default variant has a border + surface bg; ghost is for inline
   *  table cells where the parent already provides the surface. */
  variant?: 'default' | 'ghost'
  /** Optional: provide options directly instead of via children. */
  options?: SelectOptionData[]
  /** Children as <option value="x">Label</option>. */
  children?: React.ReactNode
  /** Trigger className override. */
  className?: string
}

interface ParsedOption {
  value: string
  label: React.ReactNode
  disabled: boolean
}

// Radix Select forbids empty-string values on Items, but our codebase
// uses <option value=""> as an "All / unset" sentinel in filter rows.
// We translate '' ↔ EMPTY_SENTINEL internally so call sites can keep
// using the natural shape.
const EMPTY_SENTINEL = '__rs_empty__'

function toInternal(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return value === '' ? EMPTY_SENTINEL : value
}

function fromInternal(value: string): string {
  return value === EMPTY_SENTINEL ? '' : value
}

function parseOptions(
  children: React.ReactNode,
  optionsProp: SelectOptionData[] | undefined,
): ParsedOption[] {
  if (optionsProp && optionsProp.length > 0) {
    return optionsProp.map((o) => ({
      value: o.value === '' ? EMPTY_SENTINEL : o.value,
      label: o.label,
      disabled: o.disabled ?? false,
    }))
  }
  const out: ParsedOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    // Native <option>, OptGroup ignored (rare in HOA UI; can add later).
    if (child.type === 'option') {
      const props = child.props as {
        value?: string | number
        children?: React.ReactNode
        disabled?: boolean
      }
      if (props.value == null) return
      const raw = String(props.value)
      out.push({
        value: raw === '' ? EMPTY_SENTINEL : raw,
        label: props.children ?? raw,
        disabled: !!props.disabled,
      })
    }
  })
  return out
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  placeholder,
  error,
  disabled,
  required,
  variant = 'default',
  options,
  children,
  className,
}: SelectProps) {
  const { invalid, ...aria } = useFieldControlProps({ id, error })
  const parsed = React.useMemo(
    () => parseOptions(children, options),
    [children, options],
  )

  // Controlled vs uncontrolled. We mirror internal state for the
  // hidden form input even when the parent controls value.
  const [internal, setInternal] = React.useState<string | undefined>(
    value ?? defaultValue,
  )
  const currentValue = value ?? internal

  function handleChange(next: string) {
    const emit = fromInternal(next)
    setInternal(emit)
    onValueChange?.(emit)
  }

  const radixValue = toInternal(value ?? internal)
  const radixDefault = toInternal(defaultValue)

  return (
    <RS.Root
      value={radixValue ?? EMPTY_SENTINEL}
      defaultValue={radixDefault}
      onValueChange={handleChange}
      disabled={disabled}
      required={required}
      name={name}
    >
      <RS.Trigger
        {...aria}
        className={cn(
          'group flex min-h-10 items-center justify-between gap-2 px-3 py-1.5 text-left sm:min-h-9',
          'data-[placeholder]:text-muted data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/25',
          variant === 'default'
            ? controlBase
            : 'w-full rounded-lg border border-transparent bg-transparent text-sm text-foreground hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          invalid && controlInvalid,
          className,
        )}
      >
        <RS.Value placeholder={placeholder ?? 'Select…'} />
        <RS.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-fast group-data-[state=open]:rotate-180" aria-hidden />
        </RS.Icon>
      </RS.Trigger>

      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          align="start"
          className={cn(
            // Match the trigger width so the popup doesn't snap to its content width
            'z-popover min-w-[var(--radix-select-trigger-width)] max-h-[min(var(--radix-select-content-available-height),22rem)] overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-lg',
            'data-[state=open]:animate-scale-in',
          )}
        >
          <RS.Viewport className="p-1 scroll-py-1">
            {parsed.map((opt) => (
              <RS.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-2.5 pr-8 text-sm outline-none sm:py-1.5',
                  'data-[highlighted]:bg-subtle data-[highlighted]:text-foreground',
                  'data-[state=checked]:font-medium',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RS.ItemText>{opt.label}</RS.ItemText>
                <RS.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check className="h-4 w-4 text-primary" aria-hidden />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>

      {/* Hidden input keeps Select compatible with <form action={...}>
          when a `name` is provided. Radix's own form integration uses
          the Root's name prop but we mirror it explicitly to be sure
          server actions see the value across all callers. */}
      {name ? (
        <input type="hidden" name={name} value={currentValue ?? ''} />
      ) : null}
    </RS.Root>
  )
}
