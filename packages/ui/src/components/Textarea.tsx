'use client'

import * as React from 'react'
import { cn } from '../lib/cn'
import { controlBase, controlInvalid } from '../lib/control'
import { useFieldControlProps } from './Field'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  /**
   * Character counter under the field. Defaults to on only when there is a
   * `maxLength` (a bare "12 characters" under every textarea was noise).
   */
  showCount?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, showCount, maxLength, value, defaultValue, onChange, ...props }, ref) => {
    const { invalid, ...aria } = useFieldControlProps({ ...props, error })
    const [internal, setInternal] = React.useState<string>(
      typeof defaultValue === 'string' ? defaultValue : '',
    )
    const current = typeof value === 'string' ? value : internal
    const counter = showCount ?? Boolean(maxLength)
    const nearLimit = maxLength ? current.length >= maxLength * 0.9 : false

    return (
      <div className="space-y-1">
        <textarea
          ref={ref}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            if (value === undefined) setInternal(e.target.value)
            onChange?.(e)
          }}
          {...props}
          {...aria}
          className={cn(
            controlBase,
            'flex min-h-[88px] px-3 py-2 leading-relaxed',
            invalid && controlInvalid,
            className,
          )}
        />
        {counter ? (
          <p className={cn('num text-right text-xs', nearLimit ? 'text-warning' : 'text-muted')}>
            {maxLength ? (
              <>
                {current.length} / {maxLength}
                <span className="sr-only"> characters</span>
              </>
            ) : (
              <>
                {current.length} {current.length === 1 ? 'character' : 'characters'}
              </>
            )}
          </p>
        ) : null}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
