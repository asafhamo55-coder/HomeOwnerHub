import { Mail, Phone } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { mailtoHref, telHref } from '@/lib/contact-links'

/**
 * Call / email as icon buttons, for dense rows (the properties table, a
 * phone card, the People list) where ContactLink's full address would
 * crowd the line. Server-safe: plain tel:/mailto: anchors, no state.
 *
 * Each icon is labelled with who and what ("Call Pat Example"), and the
 * value is in `title` for hover. A number or address that isn't dialable
 * or plausible gets no icon: a button that dials nonsense is worse than
 * none (contact-links.ts). 40px on phones, 32px from `sm` (design-system
 * v2 touch targets).
 *
 * `raised` lifts the icons above a row's stretched link (`after:inset-0`)
 * so they stay their own targets inside a whole-row link.
 */
export function ContactIcons({
  name,
  phone,
  email,
  raised = false,
  className,
}: {
  name: string | null
  phone: string | null
  email: string | null
  raised?: boolean
  className?: string
}) {
  const tel = telHref(phone)
  const mail = mailtoHref(email)
  if (!tel && !mail) return null
  const who = name?.trim() || 'the owner'
  const btn = cn(
    'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-primary no-underline transition-colors duration-fast hover:bg-primary-subtle sm:size-8',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    raised && 'relative z-[1]',
  )
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {tel ? (
        <a href={tel} className={btn} aria-label={`Call ${who}`} title={phone ?? undefined}>
          <Phone className="size-4" aria-hidden />
        </a>
      ) : null}
      {mail ? (
        <a href={mail} className={btn} aria-label={`Email ${who}`} title={email ?? undefined}>
          <Mail className="size-4" aria-hidden />
        </a>
      ) : null}
    </span>
  )
}
