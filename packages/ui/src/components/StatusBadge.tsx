import * as React from 'react'
import { StatusPill, type BadgeProps, type StatusTone } from './Badge'

// Couples a tone + a humanized label + an icon so list pages stop
// rendering raw enums like `notice_sent` or `prospect`, and so status is
// never carried by colour alone. Pass a label map per kind so vendors /
// violations / dues / etc. each control their own status copy.

type Tone = NonNullable<BadgeProps['variant']>

export interface StatusBadgeProps {
  status: string
  /**
   * Status → tone mapping. Status keys not in the map fall back to `neutral`.
   * Accepts the Badge variant names (`destructive`, `default`, …) for
   * backward compatibility.
   */
  tones?: Record<string, Tone | StatusTone>
  /**
   * Status → display label mapping. Status keys not in the map are
   * humanized by replacing underscores with spaces and capitalizing.
   */
  labels?: Record<string, string>
  size?: BadgeProps['size']
  className?: string
}

function defaultHumanize(s: string): string {
  if (!s) return ''
  const cleaned = s.replace(/_/g, ' ').toLowerCase()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function toStatusTone(t: Tone | StatusTone | undefined): StatusTone {
  switch (t) {
    case 'success':
    case 'warning':
    case 'info':
    case 'neutral':
    case 'ai':
    case 'brand':
    case 'danger':
      return t
    case 'destructive':
      return 'danger'
    case 'default':
    case 'solid':
      return 'brand'
    default:
      return 'neutral'
  }
}

export function StatusBadge({ status, tones, labels, size, className }: StatusBadgeProps) {
  const tone = toStatusTone(tones?.[status])
  const label = labels?.[status] || defaultHumanize(status)
  return <StatusPill tone={tone} label={label} size={size} className={className} />
}

export { defaultHumanize as humanizeStatus }
