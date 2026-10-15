'use client'

import * as React from 'react'
import { cn } from '../lib/cn'
import { controlBase, controlHeight, controlInvalid } from '../lib/control'
import { useFieldControlProps } from './Field'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Error state. Inside a `Field` with an `error`, this is automatic. */
  error?: boolean
  /** Leading adornment: an icon or a unit such as "$". */
  prefix?: React.ReactNode
  /** Trailing adornment: a unit, a clear button, a kbd hint. */
  suffix?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, prefix, suffix, ...props }, ref) => {
    const wired = useFieldControlProps({ ...props, error })
    const { invalid, ...aria } = wired
    const numeric = props.inputMode === 'decimal' || props.inputMode === 'numeric' || props.type === 'number'

    if (prefix || suffix) {
      return (
        <div
          className={cn(
            controlBase,
            controlHeight,
            'flex items-center gap-2 px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25',
            invalid && cn(controlInvalid, 'focus-within:border-danger focus-within:ring-danger/25'),
            props.disabled && 'cursor-not-allowed bg-subtle',
            className,
          )}
        >
          {prefix ? (
            <span className="flex shrink-0 items-center text-muted [&_svg]:size-4">{prefix}</span>
          ) : null}
          <input
            ref={ref}
            {...props}
            {...aria}
            className={cn(
              'h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted disabled:cursor-not-allowed',
              numeric && 'num',
            )}
          />
          {suffix ? (
            <span className="flex shrink-0 items-center text-muted [&_svg]:size-4">{suffix}</span>
          ) : null}
        </div>
      )
    }

    return (
      <input
        ref={ref}
        {...props}
        {...aria}
        className={cn(
          controlBase,
          controlHeight,
          'px-3',
          'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          numeric && 'num',
          invalid && controlInvalid,
          className,
        )}
      />
    )
  },
)
Input.displayName = 'Input'
